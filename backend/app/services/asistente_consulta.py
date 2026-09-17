"""Motor de filtros del asistente.

En lugar de reconocer frases sueltas, la pregunta se traduce a un conjunto de
FILTROS sobre las actividades y se ejecuta una consulta. Así se pueden combinar
condiciones ("el domingo para caike en Ibagué", "finalizadas de Cortolima en
septiembre agrupadas por empresa") sin tener que enseñarle cada frase posible.

El vocabulario (ciudades, tipos de servicio, categorías, empresas y recreadores)
se lee de la base de datos, no de una lista fija en el código: si mañana aparece
una ciudad nueva, el asistente la entiende sin tocar nada.

Nota de diseño: este ejecutor es independiente de cómo se obtienen los filtros.
Si algún día se conecta un modelo de lenguaje, su única tarea sería devolver este
mismo diccionario de filtros; la consulta y la redacción no cambian.
"""
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.solicitud import Solicitud
from app.models.user import User
from app.services.horas_utils import calc_hours, rango_semana

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

ESTADOS = {
    "programad": "programado", "programada": "programado", "programadas": "programado",
    "programados": "programado", "finalizad": "finalizado", "finalizada": "finalizado",
    "finalizadas": "finalizado", "finalizados": "finalizado", "pendiente": "pendiente",
    "pendientes": "pendiente", "corregir": "por corregir", "anulad": "anulada",
    "anulada": "anulada", "anuladas": "anulada",
}

AGRUPACIONES = {
    "empresa": "empresa", "empresas": "empresa", "cliente": "empresa", "clientes": "empresa",
    "ciudad": "ciudad", "ciudades": "ciudad", "municipio": "ciudad",
    "recreador": "recreador", "recreadores": "recreador", "persona": "recreador",
    "dia": "dia", "dias": "dia", "fecha": "dia", "fechas": "dia",
    "servicio": "tipo_servicio", "servicios": "tipo_servicio",
    "tipo": "tipo_servicio", "categoria": "categoria_origen", "categoria_origen": "categoria_origen",
}


def _sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "")
                   if unicodedata.category(c) != "Mn")


def norm(texto: str) -> str:
    t = _sin_acentos((texto or "").lower()).strip()
    return re.sub(r"\s+", " ", t.strip("¿?¡!.,;:\"'()[]{} ")).strip()


@dataclass
class Filtros:
    """Filtros entendidos en la pregunta (lo que se muestra como fichas en la UI)."""
    desde: Optional[date] = None
    hasta: Optional[date] = None
    etiqueta_fecha: Optional[str] = None
    estado: Optional[str] = None
    recreador_id: Optional[int] = None
    recreador_nombre: Optional[str] = None
    excluir_recreador_id: Optional[int] = None
    excluir_recreador_nombre: Optional[str] = None
    empresa: Optional[str] = None
    concepto: Optional[str] = None
    ciudad: Optional[str] = None
    categoria: Optional[str] = None
    tipo_servicio: Optional[str] = None
    agrupar_por: Optional[str] = None
    orden: Optional[str] = None          # "mas" | "menos"
    limite: int = 12
    rango: bool = False

    def fichas(self) -> List[Dict[str, str]]:
        """Filtros en formato de fichas para pintarlos en el chat."""
        f = []
        if self.etiqueta_fecha:
            f.append({"campo": "fecha", "valor": self.etiqueta_fecha})
        if self.recreador_nombre:
            f.append({"campo": "recreador", "valor": self.recreador_nombre})
        if self.excluir_recreador_nombre:
            f.append({"campo": "sin", "valor": self.excluir_recreador_nombre})
        if self.empresa:
            f.append({"campo": "empresa", "valor": self.empresa})
        if self.concepto:
            f.append({"campo": "tema", "valor": self.concepto})
        if self.ciudad:
            f.append({"campo": "ciudad", "valor": self.ciudad})
        if self.tipo_servicio:
            f.append({"campo": "servicio", "valor": self.tipo_servicio})
        if self.categoria:
            f.append({"campo": "categoría", "valor": self.categoria})
        if self.estado:
            f.append({"campo": "estado", "valor": self.estado})
        if self.agrupar_por:
            f.append({"campo": "agrupado por", "valor": self.agrupar_por.replace("_", " ")})
        if self.orden:
            f.append({"campo": "orden", "valor": "los que más" if self.orden == "mas" else "los que menos"})
        return f


# ── vocabulario tomado de la base ────────────────────────────────────────────
def _vocabulario(db: Session) -> Dict[str, List[str]]:
    def distintos(columna):
        return [v[0] for v in db.query(columna).distinct().all() if v[0]]

    return {
        "ciudades": distintos(Solicitud.ciudad),
        "servicios": distintos(Solicitud.tipo_servicio),
        "empresas": distintos(Solicitud.empresa),
    }


def _contiene(t: str, frase: str) -> bool:
    """¿Aparece la frase como palabra(s) completa(s) dentro del texto?"""
    return bool(re.search(rf"\b{re.escape(norm(frase))}\b", t))


def _mejor_coincidencia(t: str, opciones: List[str], minimo: int = 4) -> Optional[str]:
    mejor = None
    for opcion in opciones:
        n = norm(opcion)
        if len(n) >= minimo and _contiene(t, n) and (mejor is None or len(n) > len(norm(mejor))):
            mejor = opcion
    return mejor


# ── fechas ───────────────────────────────────────────────────────────────────
def _fecha_de(t: str, dia: int, mes: str, anio: Optional[str]) -> Optional[date]:
    if mes not in MESES:
        return None
    try:
        return date(int(anio) if anio else date.today().year, MESES.index(mes) + 1, dia)
    except ValueError:
        return None


def _fechas(t: str) -> Tuple[Optional[date], Optional[date], Optional[str], bool]:
    """(desde, hasta, etiqueta, es_rango) a partir del texto."""
    hoy = date.today()

    # rangos explícitos: "del 20 al 25 de septiembre", "entre el 1 y el 15"
    m = re.search(r"\b(?:del|desde el|entre el|entre)\s+(\d{1,2})(?:\s+de\s+([a-z]+))?"
                  r"\s+(?:al|hasta el|hasta|y el|y)\s+(\d{1,2})(?:\s+de\s+([a-z]+))?", t)
    if m:
        d1, mes1, d2, mes2 = int(m.group(1)), m.group(2), int(m.group(3)), m.group(4)
        mes1 = mes1 or mes2 or MESES[hoy.month - 1]
        mes2 = mes2 or mes1
        f1 = _fecha_de(t, d1, mes1, None)
        f2 = _fecha_de(t, d2, mes2, None)
        if f1 and f2:
            if f2 < f1:
                f2 = f2.replace(year=f2.year + 1)
            return f1, f2, f"del {f1.day} al {f2.day} de {MESES[f2.month - 1]}", True

    # "últimos N días" / "próximos N días"
    m = re.search(r"\b(ultimos|proximos|siguientes)\s+(\d{1,2})\s+dias", t)
    if m:
        n = int(m.group(2))
        if m.group(1) == "ultimos":
            return hoy - timedelta(days=n - 1), hoy, f"últimos {n} días", True
        return hoy, hoy + timedelta(days=n - 1), f"próximos {n} días", True

    if "semana pasada" in t or "semana anterior" in t:
        d, h = rango_semana((hoy - timedelta(days=7)).isoformat())
        return (date.fromisoformat(d), date.fromisoformat(h), "la semana pasada", True)
    if "esta semana" in t or "semana actual" in t:
        d, h = rango_semana(hoy.isoformat())
        return date.fromisoformat(d), date.fromisoformat(h), "esta semana", True
    if "proxima semana" in t:
        d, h = rango_semana((hoy + timedelta(days=7)).isoformat())
        return date.fromisoformat(d), date.fromisoformat(h), "la próxima semana", True
    if "este mes" in t:
        primero = hoy.replace(day=1)
        ultimo = (primero + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return primero, ultimo, f"{MESES[hoy.month - 1]}", True
    if "mes pasado" in t:
        primero = (hoy.replace(day=1) - timedelta(days=1)).replace(day=1)
        ultimo = hoy.replace(day=1) - timedelta(days=1)
        return primero, ultimo, f"{MESES[ultimo.month - 1]}", True

    if "pasado manana" in t:
        f = hoy + timedelta(days=2)
        return f, f, f"pasado mañana ({_larga(f)})", False
    if "manana" in t:
        f = hoy + timedelta(days=1)
        return f, f, f"mañana ({_larga(f)})", False
    if "ayer" in t:
        f = hoy - timedelta(days=1)
        return f, f, f"ayer ({_larga(f)})", False

    for i, dia in enumerate(DIAS):
        if re.search(rf"\b{norm(dia)}\b", t):
            f = hoy + timedelta(days=(i - hoy.weekday()) % 7)
            return f, f, _larga(f), False

    m = re.search(r"\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?", t)
    if m:
        f = _fecha_de(t, int(m.group(1)), m.group(2), m.group(3))
        if f:
            return f, f, _larga(f), False

    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", t)
    if m:
        f = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        return f, f, _larga(f), False
    m = re.search(r"\b(\d{1,2})/(\d{1,2})\b", t)
    if m:
        try:
            f = date(hoy.year, int(m.group(2)), int(m.group(1)))
            return f, f, _larga(f), False
        except ValueError:
            pass

    return hoy, hoy, f"hoy ({_larga(hoy)})", False


def _larga(f: date) -> str:
    return f"{DIAS[f.weekday()]} {f.day} de {MESES[f.month - 1]} de {f.year}"


# ── extracción de filtros ────────────────────────────────────────────────────
def extraer(db: Session, user: User, pregunta: str) -> Filtros:
    t = norm(pregunta)
    vocab = _vocabulario(db)
    filtros = Filtros()

    # fecha
    t_sin_fechas = re.sub(r"\b\d{4}-\d{2}-\d{2}\b", " ", t)
    d, h, etiqueta, es_rango = _fechas(t_sin_fechas)
    filtros.desde, filtros.hasta, filtros.etiqueta_fecha, filtros.rango = d, h, etiqueta, es_rango

    # estado
    for clave, valor in ESTADOS.items():
        if re.search(rf"\b{clave}", t):
            filtros.estado = valor
            break

    # agrupación y orden
    m = re.search(r"\b(?:por|agrupad[oa]s? por|segun)\s+([a-z ]{3,22})", t)
    if m:
        for palabra in norm(m.group(1)).split():
            if palabra in AGRUPACIONES:
                filtros.agrupar_por = AGRUPACIONES[palabra]
                break
    if any(p in t for p in ("los que mas", "el que mas", "mayor", "top", "ranking", "mas actividades")):
        filtros.orden = "mas"
    elif any(p in t for p in ("los que menos", "el que menos", "menor", "menos actividades")):
        filtros.orden = "menos"

    m = re.search(r"\b(?:top|primeros|las|los)\s+(\d{1,2})\b", t)
    if m and 1 <= int(m.group(1)) <= 50:
        filtros.limite = int(m.group(1))

    # ciudad, tipo de servicio, categoría
    filtros.ciudad = _mejor_coincidencia(t, vocab["ciudades"])
    filtros.tipo_servicio = _mejor_coincidencia(t, vocab["servicios"], minimo=6)
    if "administrativ" in t:
        filtros.categoria = "administrativo"
    elif "dudos" in t:
        filtros.categoria = "dudoso"
    elif "reales" in t or "categoria real" in t:
        filtros.categoria = "real"

    # empresa
    filtros.empresa = _mejor_coincidencia(t, vocab["empresas"], minimo=5)

    # recreador (incluido y excluido)
    excluido = re.search(r"\b(?:sin|excepto|menos|que no sea|salvo)\s+([a-z ]{4,30})", t)
    if excluido:
        quien = _buscar_persona(db, excluido.group(1))
        if quien:
            filtros.excluir_recreador_id = quien.id
            filtros.excluir_recreador_nombre = quien.full_name or quien.username
    quien = _buscar_persona(db, t)
    if quien and quien.id != filtros.excluir_recreador_id:
        filtros.recreador_id = quien.id
        filtros.recreador_nombre = quien.full_name or quien.username

    # concepto libre (solo si existe de verdad en los datos)
    if not filtros.empresa and not filtros.tipo_servicio and not filtros.ciudad:
        filtros.concepto = _concepto(db, t)

    return filtros


def _buscar_persona(db: Session, texto: str) -> Optional[User]:
    from app.services.asistente_service import _buscar_recreador
    return _buscar_recreador(db, texto)


def _concepto(db: Session, t: str) -> Optional[str]:
    from app.services.asistente_service import _detectar_concepto
    return _detectar_concepto(db, t)


# ── ejecución ────────────────────────────────────────────────────────────────
def _consulta(db: Session, user: User, f: Filtros):
    q = db.query(Solicitud)
    if f.desde and f.hasta:
        q = q.filter(Solicitud.fecha_evento >= f.desde.isoformat(),
                     Solicitud.fecha_evento <= f.hasta.isoformat())
    if f.estado:
        q = q.filter(Solicitud.estado == f.estado)
    else:
        q = q.filter(Solicitud.estado.in_(["programado", "finalizado"]))
    if f.empresa:
        q = q.filter(Solicitud.empresa.ilike(f"%{f.empresa}%"))
    if f.ciudad:
        q = q.filter(Solicitud.ciudad.ilike(f"%{f.ciudad}%"))
    if f.tipo_servicio:
        q = q.filter(Solicitud.tipo_servicio.ilike(f"%{f.tipo_servicio}%"))
    if f.categoria:
        q = q.filter(Solicitud.categoria_origen == f.categoria)
    elif not f.concepto:
        # por defecto no se mezclan las tareas administrativas del cronograma
        q = q.filter(or_(Solicitud.categoria_origen.is_(None),
                         Solicitud.categoria_origen != "administrativo"))
    if f.concepto:
        patron = f"%{f.concepto}%"
        q = q.filter(or_(Solicitud.empresa.ilike(patron),
                         Solicitud.tipo_servicio.ilike(patron),
                         Solicitud.observaciones.ilike(patron),
                         Solicitud.ciudad.ilike(patron)))
    if f.recreador_id:
        q = q.filter(or_(Solicitud.recreador_id == f.recreador_id,
                         Solicitud.recreadores.any(User.id == f.recreador_id)))
    if f.excluir_recreador_id:
        q = q.filter(~Solicitud.recreadores.any(User.id == f.excluir_recreador_id))

    # alcance por rol
    if user.is_recreador:
        q = q.filter(or_(Solicitud.recreador_id == user.id,
                         Solicitud.recreadores.any(User.id == user.id)))
    elif not (user.is_admin or user.is_cotizador):
        q = q.filter(Solicitud.user_id == user.id)
    return q


def ejecutar(db: Session, user: User, f: Filtros) -> Dict[str, Any]:
    """Devuelve el resultado de aplicar los filtros (listado o agrupación)."""
    solicitudes = _consulta(db, user, f).order_by(Solicitud.fecha_evento,
                                                 Solicitud.hora_inicio).all()
    horas = round(sum(calc_hours(s.hora_inicio, s.hora_fin) for s in solicitudes), 1)

    # ── agrupado ──
    if f.agrupar_por:
        grupos: Dict[str, Dict[str, Any]] = {}
        for s in solicitudes:
            if f.agrupar_por == "empresa":
                claves = [s.empresa or "(sin empresa)"]
            elif f.agrupar_por == "ciudad":
                claves = [s.ciudad or "(sin ciudad)"]
            elif f.agrupar_por == "dia":
                claves = [s.fecha_evento or "(sin fecha)"]
            elif f.agrupar_por == "tipo_servicio":
                claves = [s.tipo_servicio or "(sin servicio)"]
            elif f.agrupar_por == "categoria_origen":
                claves = [s.categoria_origen or "(sin categoría)"]
            else:  # recreador
                claves = [(r.full_name or r.username) for r in s.recreadores] or ["(sin asignar)"]
            for clave in claves:
                g = grupos.setdefault(clave, {"n": 0, "horas": 0.0, "personas": set()})
                g["n"] += 1
                g["horas"] += calc_hours(s.hora_inicio, s.hora_fin)
                g["personas"] |= {(r.full_name or r.username) for r in s.recreadores}
        filas = sorted(grupos.items(),
                       key=lambda kv: kv[1]["horas"] if f.agrupar_por == "dia" else kv[1]["n"],
                       reverse=(f.orden != "menos"))
        return {"tipo": "grupos", "filas": filas[:f.limite], "total": len(solicitudes),
                "horas": horas, "grupos": len(grupos)}

    return {"tipo": "listado", "solicitudes": solicitudes, "total": len(solicitudes),
            "horas": horas,
            "personas": len({r.id for s in solicitudes for r in s.recreadores} |
                            {s.recreador_id for s in solicitudes if s.recreador_id})}


def describir(f: Filtros) -> str:
    """Frase con lo que se entendió ('domingo 20 · caike · Ibagué')."""
    partes = [x["valor"] for x in f.fichas()]
    return " · ".join(partes)
