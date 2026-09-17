"""Asistente interno: responde preguntas en lenguaje natural con datos reales.

No usa un modelo de lenguaje externo: resuelve la intención con reglas (fechas,
nombres de recreadores, empresas y palabras clave) y consulta la base de datos
respetando el MISMO alcance por rol que el resto de la aplicación:

* administración ve todo;
* un recreador solo lo suyo (si pregunta por otro, se le dice con educación);
* un promotor solo sus solicitudes y sus cotizaciones;
* la persona de cotizaciones, el módulo de cotizaciones.

La respuesta es estructurada (texto + tarjetas + conteos + sugerencias) para que
el frontend la pueda pintar bonita, y así añadir intenciones no obliga a tocar la
interfaz.
"""
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.cotizacion import Cotizacion, Producto
from app.models.solicitud import Solicitud
from app.models.user import User
from app.services.horas_utils import LIMITE_HORAS_SEMANALES, calc_hours, rango_semana

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


# ── utilidades de texto y fechas ─────────────────────────────────────────────
def _sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto or "")
                   if unicodedata.category(c) != "Mn")


def _norm(texto: str) -> str:
    return _sin_acentos((texto or "").lower()).strip()


def _fecha_larga(f: date) -> str:
    return f"{DIAS[f.weekday()]} {f.day} de {MESES[f.month - 1]} de {f.year}"


def _etiqueta_fecha(f: date) -> str:
    hoy = date.today()
    if f == hoy:
        return "hoy"
    if f == hoy + timedelta(days=1):
        return "mañana"
    if f == hoy - timedelta(days=1):
        return "ayer"
    return f"el {_fecha_larga(f)}"


def _detectar_fecha(pregunta: str) -> Tuple[Optional[date], Optional[date], str]:
    """Devuelve (desde, hasta, etiqueta). Por defecto, hoy."""
    t = _norm(pregunta)
    hoy = date.today()

    if "pasado manana" in t:
        f = hoy + timedelta(days=2)
        return f, f, _etiqueta_fecha(f)
    if "manana" in t:
        f = hoy + timedelta(days=1)
        return f, f, _etiqueta_fecha(f)
    if "ayer" in t:
        f = hoy - timedelta(days=1)
        return f, f, _etiqueta_fecha(f)
    if "esta semana" in t or "semana actual" in t:
        desde, hasta = rango_semana(hoy.isoformat())
        return datetime.strptime(desde, "%Y-%m-%d").date(), datetime.strptime(hasta, "%Y-%m-%d").date(), "esta semana"
    if "proxima semana" in t or "semana entrante" in t:
        desde, hasta = rango_semana((hoy + timedelta(days=7)).isoformat())
        return datetime.strptime(desde, "%Y-%m-%d").date(), datetime.strptime(hasta, "%Y-%m-%d").date(), "la próxima semana"
    if "este mes" in t:
        primero = hoy.replace(day=1)
        ultimo = (primero + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return primero, ultimo, "este mes"

    # día de la semana: el próximo que ocurra (hoy incluido)
    for i, dia in enumerate(DIAS):
        if re.search(rf"\b{_norm(dia)}\b", t):
            delta = (i - hoy.weekday()) % 7
            f = hoy + timedelta(days=delta)
            return f, f, _etiqueta_fecha(f)

    # "20 de octubre" / "20 de octubre de 2026"
    m = re.search(r"\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?", t)
    if m:
        dia, mes_txt, anio = int(m.group(1)), m.group(2), m.group(3)
        if mes_txt in MESES:
            anio = int(anio) if anio else hoy.year
            try:
                f = date(anio, MESES.index(mes_txt) + 1, dia)
                return f, f, _etiqueta_fecha(f)
            except ValueError:
                pass

    # "20/10" o "2026-10-20"
    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", t)
    if m:
        f = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        return f, f, _etiqueta_fecha(f)
    m = re.search(r"\b(\d{1,2})/(\d{1,2})\b", t)
    if m:
        try:
            f = date(hoy.year, int(m.group(2)), int(m.group(1)))
            return f, f, _etiqueta_fecha(f)
        except ValueError:
            pass

    return hoy, hoy, "hoy"


def _buscar_recreador(db: Session, pregunta: str, excluir_id: Optional[int] = None) -> Optional[User]:
    """Encuentra al recreador mencionado.

    Primero exige el nombre completo ('juan daniel', 'camilo peña') y, si no hay
    coincidencia, acepta un único token distintivo ('camilo', 'gabriel'), siempre
    que ese token identifique a UN solo recreador: si el nombre es ambiguo (p. ej.
    'daniel' entre Daniel Rincón, Daniel Ruiz y Juan Daniel) no adivina.
    """
    t = _norm(pregunta)
    candidatos = [u for u in db.query(User).filter(User.is_recreador == True).all()  # noqa: E712
                  if not (excluir_id and u.id == excluir_id)]

    # (1) nombre completo
    mejor, mejor_largo = None, 0
    for u in candidatos:
        for nombre in {_norm(u.full_name or ""), _norm(u.username.replace(".", " "))}:
            partes = [x for x in nombre.split() if len(x) > 2]
            if partes and all(re.search(rf"\b{x}\b", t) for x in partes):
                if len(nombre) > mejor_largo:
                    mejor, mejor_largo = u, len(nombre)
    if mejor:
        return mejor

    # (2) token único
    coincidencias: Dict[int, User] = {}
    for u in candidatos:
        tokens = set()
        for nombre in {_norm(u.full_name or ""), _norm(u.username.replace(".", " "))}:
            tokens |= {x for x in nombre.split() if len(x) >= 4}
        if any(re.search(rf"\b{x}\b", t) for x in tokens):
            coincidencias[u.id] = u
    return list(coincidencias.values())[0] if len(coincidencias) == 1 else None


def _detectar_empresa(db: Session, pregunta: str) -> Optional[str]:
    """Nombre de empresa mencionado, buscando el más largo que aparezca en la frase.

    Se comparan los nombres reales de la base (no una lista fija), así funciona con
    cualquier empresa registrada y con nombres compuestos.
    """
    t = _norm(pregunta)
    if len(t) < 4:
        return None
    nombres = [n[0] for n in db.query(Solicitud.empresa).distinct().all() if n[0]]
    mejor = None
    for nombre in nombres:
        n = _norm(nombre)
        if len(n) >= 4 and re.search(rf"\b{re.escape(n)}\b", t) \
                and (mejor is None or len(n) > len(_norm(mejor))):
            mejor = nombre
    return mejor


def _recreadores_ambiguos(db: Session, pregunta: str) -> List[User]:
    """Recreadores cuyo nombre parcial aparece en la frase (para pedir precisión)."""
    t = _norm(pregunta)
    encontrados = []
    for u in db.query(User).filter(User.is_recreador == True).all():  # noqa: E712
        tokens = set()
        for nombre in {_norm(u.full_name or ""), _norm(u.username.replace(".", " "))}:
            tokens |= {x for x in nombre.split() if len(x) >= 4}
        if any(re.search(rf"\b{x}\b", t) for x in tokens):
            encontrados.append(u)
    return encontrados


def _etiqueta_rango(desde: date, hasta: date, etiqueta: str) -> str:
    if desde == hasta:
        return f"{etiqueta} ({_fecha_larga(desde)})"
    return (f"{etiqueta} (del {desde.day} al {hasta.day} de "
            f"{MESES[hasta.month - 1]} de {hasta.year})")


def _nombre(user: User) -> str:
    return user.full_name or user.username


def _alcance_admin(user: User) -> bool:
    return bool(user.is_admin)


# ── bloque de actividades ────────────────────────────────────────────────────
def _solicitudes_de(db: Session, recreador_id: int, desde: date, hasta: date) -> List[Solicitud]:
    return (
        db.query(Solicitud)
        .filter(
            Solicitud.estado.in_(["programado", "finalizado"]),
            Solicitud.fecha_evento >= desde.isoformat(),
            Solicitud.fecha_evento <= hasta.isoformat(),
            or_(
                Solicitud.recreador_id == recreador_id,
                Solicitud.recreadores.any(User.id == recreador_id),
            ),
        )
        .order_by(Solicitud.fecha_evento, Solicitud.hora_inicio)
        .all()
    )


def _tarjeta_actividad(s: Solicitud, con_fecha: bool = False) -> Dict[str, Any]:
    meta = []
    if con_fecha:
        meta.append(s.fecha_evento)
    meta.append(f"{s.hora_inicio}–{s.hora_fin}")
    meta.append(s.ciudad or "")
    return {
        "titulo": s.empresa,
        "subtitulo": " · ".join([m for m in meta if m]),
        "meta": s.tipo_servicio or "",
        "estado": s.estado,
        "horas": round(calc_hours(s.hora_inicio, s.hora_fin), 1),
    }


def _totales_actividades(db: Session, desde: date, hasta: date, recreador_id: Optional[int] = None,
                         incluir_administrativo: bool = False) -> Dict[str, Any]:
    q = db.query(Solicitud).filter(
        Solicitud.fecha_evento >= desde.isoformat(),
        Solicitud.fecha_evento <= hasta.isoformat(),
        Solicitud.estado == "programado",
    )
    if recreador_id:
        q = q.filter(or_(Solicitud.recreador_id == recreador_id,
                         Solicitud.recreadores.any(User.id == recreador_id)))
    if not incluir_administrativo:
        q = q.filter(or_(Solicitud.categoria_origen.is_(None),
                         Solicitud.categoria_origen != "administrativo"))
    solicitudes = q.order_by(Solicitud.fecha_evento, Solicitud.hora_inicio).all()
    return {
        "solicitudes": solicitudes,
        "total": len(solicitudes),
        "recreadores": len({r.id for s in solicitudes for r in s.recreadores} |
                           {s.recreador_id for s in solicitudes if s.recreador_id}),
        "horas": round(sum(calc_hours(s.hora_inicio, s.hora_fin) for s in solicitudes), 1),
    }


# ── intenciones ──────────────────────────────────────────────────────────────
def _ayuda(user: User) -> Dict[str, Any]:
    es_admin = _alcance_admin(user)
    ejemplos = ["¿Qué actividades hay hoy?", "¿Qué tengo hoy?"]
    if es_admin:
        ejemplos = [
            "¿Qué actividades tiene Juan Daniel hoy?",
            "¿Qué actividades hay hoy?",
            "¿Cuántas horas lleva Camilo esta semana?",
            "¿Cuántas solicitudes hay pendientes?",
            "¿Cuánto llevamos cotizado?",
        ]
    elif user.is_cotizador:
        ejemplos = ["¿Cuánto llevamos cotizado?", "Muéstrame la última cotización",
                    "¿Qué cotizaciones tiene Cortolima?"]
    return {
        "respuesta": (
            f"¡Hola, {_nombre(user).split(' ')[0]}! Soy el asistente de Comfenalco Tolima. "
            "Puedo consultar la agenda de los recreadores, las solicitudes y las cotizaciones "
            "por ti. Pregúntame lo que necesites; por ejemplo:"
        ),
        "tipo": "texto",
        "sugerencias": ejemplos,
    }


def _actividades_de_recreador(db: Session, user: User, pregunta: str,
                              recreador: User) -> Dict[str, Any]:
    if not _alcance_admin(user) and recreador.id != user.id:
        return {
            "respuesta": ("Solo puedo mostrarte tu propia agenda. Si necesitas la de otro "
                          f"compañero, pídeselo a la Secretaría de Recreación."),
            "tipo": "texto",
            "sugerencias": ["¿Qué tengo hoy?", "¿Qué tengo esta semana?"],
        }

    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    solicitudes = _solicitudes_de(db, recreador.id, desde, hasta)
    if not solicitudes:
        return {
            "respuesta": f"{_nombre(recreador)} no tiene actividades {etiqueta} ({_fecha_larga(desde)}).",
            "tipo": "texto",
            "sugerencias": [f"¿Qué actividades tiene {_nombre(recreador)} mañana?",
                            "¿Qué actividades hay hoy?"],
        }

    horas = round(sum(calc_hours(s.hora_inicio, s.hora_fin) for s in solicitudes), 1)
    plural = "actividad" if len(solicitudes) == 1 else "actividades"
    return {
        "respuesta": (f"{_nombre(recreador)} tiene **{len(solicitudes)} {plural}** "
                      f"{_etiqueta_rango(desde, hasta, etiqueta)} · {horas} horas en total."),
        "tipo": "actividades",
        "items": [_tarjeta_actividad(s, con_fecha=desde != hasta) for s in solicitudes[:10]],
        "extra": f"y {len(solicitudes) - 10} más" if len(solicitudes) > 10 else None,
        "sugerencias": [f"¿Cuántas horas lleva {_nombre(recreador)} esta semana?",
                        f"¿Qué tiene {_nombre(recreador)} mañana?"],
    }


def _actividades_globales(db: Session, user: User, pregunta: str) -> Dict[str, Any]:
    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    datos = _totales_actividades(db, desde, hasta)
    por_recreador: Dict[str, int] = {}
    for s in datos["solicitudes"]:
        for r in s.recreadores:
            por_recreador[_nombre(r)] = por_recreador.get(_nombre(r), 0) + 1

    items = [
        _tarjeta_actividad(s, con_fecha=desde != hasta)
        for s in datos["solicitudes"][:10]
    ]
    top = sorted(por_recreador.items(), key=lambda x: -x[1])[:5]
    respuesta = (f"{_etiqueta_rango(desde, hasta, etiqueta).capitalize()} hay "
                 f"**{datos['total']} actividades programadas** "
                 f"con {datos['recreadores']} recreadores ({datos['horas']} horas). "
                 "No incluyo las tareas administrativas del cronograma.")
    if top:
        respuesta += " Quienes más tienen: " + ", ".join(f"{n} ({c})" for n, c in top) + "."
    return {
        "respuesta": respuesta,
        "tipo": "actividades",
        "items": items,
        "extra": f"y {datos['total'] - 10} más" if datos["total"] > 10 else None,
        "sugerencias": ["¿Qué actividades hay mañana?", "¿Qué recreadores están libres hoy?",
                        "¿Cuántas solicitudes hay pendientes?"],
    }


def _mis_actividades(db: Session, user: User, pregunta: str) -> Dict[str, Any]:
    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    solicitudes = _solicitudes_de(db, user.id, desde, hasta)
    if not solicitudes:
        return {"respuesta": f"No tienes actividades asignadas {etiqueta}.",
                "tipo": "texto",
                "sugerencias": ["¿Qué tengo mañana?", "¿Cuántas horas llevo esta semana?"]}
    horas = round(sum(calc_hours(s.hora_inicio, s.hora_fin) for s in solicitudes), 1)
    plural = "actividad" if len(solicitudes) == 1 else "actividades"
    return {
        "respuesta": (f"Tienes **{len(solicitudes)} {plural}** "
                      f"{_etiqueta_rango(desde, hasta, etiqueta)} · {horas} horas."),
        "tipo": "actividades",
        "items": [_tarjeta_actividad(s, con_fecha=desde != hasta) for s in solicitudes[:10]],
        "sugerencias": ["¿Cuántas horas llevo esta semana?", "¿Qué tengo mañana?"],
    }


def _disponibles(db: Session, user: User, pregunta: str) -> Dict[str, Any]:
    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    recreadores = db.query(User).filter(User.is_recreador == True, User.is_active == True).all()  # noqa: E712
    ocupados = {
        r.id for s in db.query(Solicitud).filter(
            Solicitud.fecha_evento >= desde.isoformat(),
            Solicitud.fecha_evento <= hasta.isoformat(),
            Solicitud.estado == "programado",
        ).all() for r in s.recreadores
    }
    libres = [u for u in recreadores if u.id not in ocupados]
    items = [{"titulo": _nombre(u), "subtitulo": u.cargo or "Recreador", "meta": "Sin actividades",
              "estado": "libre"} for u in libres]
    return {
        "respuesta": (f"{etiqueta.capitalize()} hay **{len(libres)} de {len(recreadores)} "
                      f"recreadores sin actividades asignadas**."),
        "tipo": "personas",
        "items": items[:12],
        "extra": f"y {len(libres) - 12} más" if len(libres) > 12 else None,
        "sugerencias": ["¿Qué actividades hay hoy?", "¿Cuántas solicitudes hay programadas?"],
    }


def _horas_de_recreador(db: Session, user: User, pregunta: str, recreador: User) -> Dict[str, Any]:
    if not _alcance_admin(user) and recreador.id != user.id:
        recreador = user
    desde, hasta = rango_semana(date.today().isoformat())
    solicitudes = _solicitudes_de(db, recreador.id, datetime.strptime(desde, "%Y-%m-%d").date(),
                                 datetime.strptime(hasta, "%Y-%m-%d").date())
    horas = round(sum(calc_hours(s.hora_inicio, s.hora_fin) for s in solicitudes), 1)
    restante = round(LIMITE_HORAS_SEMANALES - horas, 1)
    if horas > LIMITE_HORAS_SEMANALES:
        estado = f"Supera el límite de {LIMITE_HORAS_SEMANALES} h por {abs(restante)} h."
    else:
        estado = f"Le quedan {restante} h para el límite de {LIMITE_HORAS_SEMANALES} h."
    return {
        "respuesta": (f"{_nombre(recreador)} lleva **{horas} horas** esta semana "
                      f"({desde} a {hasta}) en {len(solicitudes)} actividades. {estado}"),
        "tipo": "conteos",
        "conteos": [{"etiqueta": "Horas esta semana", "valor": horas},
                    {"etiqueta": "Actividades", "valor": len(solicitudes)},
                    {"etiqueta": "Límite semanal", "valor": LIMITE_HORAS_SEMANALES}],
        "sugerencias": [f"¿Qué actividades tiene {_nombre(recreador)} hoy?",
                        "¿Qué recreadores están libres hoy?"],
    }


def _solicitudes_resumen(db: Session, user: User, pregunta: str) -> Dict[str, Any]:
    t = _norm(pregunta)
    q = db.query(Solicitud)
    if user.is_recreador:
        q = q.filter(or_(Solicitud.recreador_id == user.id,
                         Solicitud.recreadores.any(User.id == user.id)))
    elif not _alcance_admin(user):
        q = q.filter(Solicitud.user_id == user.id)

    filas = q.with_entities(Solicitud.estado, func.count(Solicitud.id)).group_by(Solicitud.estado).all()
    por_estado = {e or "sin estado": n for e, n in filas}
    total = sum(por_estado.values())

    if "pendiente" in t:
        n = por_estado.get("pendiente", 0)
        texto = f"Hay **{n} solicitudes pendientes** de programar."
    elif "corregir" in t:
        n = por_estado.get("por corregir", 0)
        texto = f"Hay **{n} solicitudes por corregir**."
    elif "programad" in t:
        n = por_estado.get("programado", 0)
        texto = f"Hay **{n} solicitudes programadas**."
    elif "finalizad" in t:
        n = por_estado.get("finalizado", 0)
        texto = f"Hay **{n} solicitudes finalizadas**."
    else:
        texto = f"En total hay **{total} solicitudes**."
        if por_estado:
            texto += " " + ", ".join(f"{k}: {v}" for k, v in sorted(por_estado.items()))

    return {
        "respuesta": texto,
        "tipo": "conteos",
        "conteos": [{"etiqueta": k.replace("_", " ").capitalize(), "valor": v}
                    for k, v in sorted(por_estado.items())],
        "sugerencias": ["¿Qué actividades hay hoy?", "¿Qué recreadores están libres hoy?"],
    }


def _empresa(db: Session, user: User, pregunta: str, empresa: str) -> Dict[str, Any]:
    desde, hasta, _ = _detectar_fecha(pregunta)
    q = db.query(Solicitud).filter(Solicitud.empresa.ilike(f"%{empresa}%"))
    if user.is_recreador:
        q = q.filter(or_(Solicitud.recreador_id == user.id,
                         Solicitud.recreadores.any(User.id == user.id)))
    elif not _alcance_admin(user):
        q = q.filter(Solicitud.user_id == user.id)
    solicitudes = q.order_by(Solicitud.fecha_evento.desc()).all()
    if not solicitudes:
        return {"respuesta": f"No encuentro solicitudes de «{empresa}».",
                "tipo": "texto",
                "sugerencias": ["¿Cuántas solicitudes hay en total?"]}
    proximas = [s for s in solicitudes if s.fecha_evento >= desde.isoformat()]
    horas = round(sum(calc_hours(s.hora_inicio, s.hora_fin)
                      for s in solicitudes if s.estado == "finalizado"), 1)
    return {
        "respuesta": (f"**{solicitudes[0].empresa}** tiene {len(solicitudes)} solicitudes "
                      f"({len(proximas)} desde {_etiqueta_fecha(desde)}). "
                      f"Horas finalizadas acumuladas: {horas}."),
        "tipo": "actividades",
        "items": [_tarjeta_actividad(s, con_fecha=True) for s in solicitudes[:8]],
        "sugerencias": ["¿Cuántas solicitudes hay pendientes?", "¿Qué actividades hay hoy?"],
    }


def _cotizaciones(db: Session, user: User, pregunta: str,
                  empresa_mencionada: Optional[str] = None) -> Dict[str, Any]:
    if not (user.is_admin or user.is_promotor or user.is_cotizador):
        return {"respuesta": "Las cotizaciones las gestionan administración, los promotores y "
                             "la persona de cotizaciones.",
                "tipo": "texto", "sugerencias": ["¿Qué actividades hay hoy?"]}

    t = _norm(pregunta)
    q = db.query(Cotizacion)
    if not (user.is_admin or user.is_cotizador):
        q = q.filter(Cotizacion.creado_por_id == user.id)

    if empresa_mencionada:
        q = q.filter(Cotizacion.cliente.ilike(f"%{empresa_mencionada}%"))

    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    if "semana" in t or "mes" in t or "hoy" in t or "manana" in t or "ayer" in t:
        q = q.filter(Cotizacion.fecha_evento >= desde.isoformat(),
                     Cotizacion.fecha_evento <= hasta.isoformat())

    cotizaciones = q.order_by(Cotizacion.id.desc()).all()
    if not cotizaciones:
        hay_alguna = db.query(func.count(Cotizacion.id)).scalar() or 0
        mensaje = ("Todavía no hay cotizaciones registradas. Puedes crear la primera en la "
                   "sección Cotizaciones." if not hay_alguna
                   else "No hay cotizaciones que coincidan con eso.")
        return {"respuesta": mensaje,
                "tipo": "texto",
                "sugerencias": ["¿Cuánto llevamos cotizado?", "Muéstrame la última cotización"]}

    valor = round(sum(c.total or 0 for c in cotizaciones if c.estado != "anulada"), 2)
    por_estado: Dict[str, int] = {}
    for c in cotizaciones:
        por_estado[c.estado] = por_estado.get(c.estado, 0) + 1

    if empresa_mencionada:
        respuesta = (f"**{cotizaciones[0].cliente}** tiene {len(cotizaciones)} cotizaciones "
                     f"por {valor:,.0f} COP (sin contar anuladas).").replace(",", ".")
    elif "ultima" in t or "última" in t:
        c = cotizaciones[0]
        respuesta = (f"La última es **{c.numero}** de {c.cliente}, "
                     f"{(c.total or 0):,.0f} COP, estado {c.estado}.").replace(",", ".")
    else:
        respuesta = (f"Hay **{len(cotizaciones)} cotizaciones** por un valor de "
                     f"**{valor:,.0f} COP** (sin anular).").replace(",", ".")

    items = [{
        "titulo": f"{c.numero} · {c.cliente}",
        "subtitulo": " · ".join([x for x in [c.fecha_evento, c.proveedor_nombre,
                                             f"{(c.total or 0):,.0f} COP".replace(",", ".")] if x]),
        "meta": f"{len(c.items)} líneas",
        "estado": c.estado,
    } for c in cotizaciones[:8]]

    return {
        "respuesta": respuesta,
        "tipo": "cotizaciones",
        "items": items,
        "conteos": [{"etiqueta": k.capitalize(), "valor": v} for k, v in sorted(por_estado.items())],
        "sugerencias": ["Muéstrame la última cotización", "¿Cuánto llevamos cotizado?"],
    }


# ── enrutador de intenciones ─────────────────────────────────────────────────
def responder(db: Session, user: User, pregunta: str) -> Dict[str, Any]:
    """Resuelve la pregunta y devuelve la respuesta estructurada."""
    t = _norm(pregunta)
    if not t:
        return _ayuda(user)

    saludo = bool(re.search(r"\b(hola|buenas|buenos dias|buenas tardes|buenas noches|hey)\b", t))
    pide_ayuda = any(p in t for p in ("que puedes hacer", "ayuda", "como funciona",
                                      "que sabes", "instrucciones", "opciones"))

    # 1) saludo o ayuda
    if pide_ayuda or (saludo and len(t.split()) <= 4):
        return _ayuda(user)

    # 2) cotizaciones (antes que solicitudes, para no confundir "cotizaciones de X")
    if "cotiza" in t:
        mencion = re.search(r"(?:de|para|cliente)\s+([a-z0-9 .&-]{3,40})", t)
        empresa = mencion.group(1).strip() if mencion else None
        if empresa and empresa in ("esta semana", "este mes", "hoy", "manana"):
            empresa = None
        return _cotizaciones(db, user, pregunta, empresa)

    # 3) horas de un recreador
    if any(p in t for p in ("cuantas horas", "horas lleva", "horas tiene", "horas semanales",
                            "horas llevo", "cuantas horas llevo")):
        rec = _buscar_recreador(db, pregunta, excluir_id=user.id if user.is_recreador else None)
        if rec:
            return _horas_de_recreador(db, user, pregunta, rec)
        if user.is_recreador or "llevo" in t:
            return _horas_de_recreador(db, user, pregunta, user)

    # 4) una empresa concreta (tiene prioridad: "cuántas solicitudes tiene Cortolima")
    empresa = _detectar_empresa(db, pregunta)
    if empresa and not user.is_cotizador and not user.is_recreador:
        return _empresa(db, user, pregunta, empresa)

    # 4b) conteos explícitos de solicitudes ("cuántas solicitudes hay programadas")
    if "solicitud" in t and any(p in t for p in ("cuantas", "cuántas", "total", "hay",
                                                 "pendientes", "corregir", "programad",
                                                 "finalizad", "resumen")):
        return _solicitudes_resumen(db, user, pregunta)

    # 5) actividades de un recreador concreto
    menciona_agenda = any(p in t for p in ("actividad", "actividades", "agenda", "que tiene",
                                           "que tengo", "que hace", "programad", "turno",
                                           "tareas", "horario"))
    if menciona_agenda or "libre" in t:
        rec = _buscar_recreador(db, pregunta, excluir_id=user.id if user.is_recreador else None)

        # "mis actividades" / "qué tengo"
        propio = any(p in t for p in ("mi agenda", "mis actividades", "que tengo", "mi turno",
                                      "mis tareas", "tengo hoy", "tengo manana", "mi horario"))
        if propio and user.is_recreador:
            return _mis_actividades(db, user, pregunta)
        if propio and _alcance_admin(user):
            return _actividades_globales(db, user, pregunta)

        # disponibilidad de recreadores
        if "libre" in t or "disponible" in t:
            return _disponibles(db, user, pregunta)

        if rec:
            return _actividades_de_recreador(db, user, pregunta, rec)

        # nombre ambiguo ("daniel" -> ¿Rincón, Ruiz o Juan Daniel?)
        if not rec:
            candidatos = _recreadores_ambiguos(db, pregunta)
            if len(candidatos) > 1 and _alcance_admin(user):
                return {
                    "respuesta": ("Con ese nombre puedo referirme a varios recreadores: "
                                  + ", ".join(_nombre(c) for c in candidatos[:6])
                                  + ". ¿Cuál de ellos?"),
                    "tipo": "texto",
                    "sugerencias": [f"¿Qué actividades tiene {_nombre(c)} hoy?" for c in candidatos[:3]],
                }

        # agenda global (solo administración)
        if _alcance_admin(user):
            return _actividades_globales(db, user, pregunta)
        if user.is_recreador:
            return _mis_actividades(db, user, pregunta)

    # 7) resumen de solicitudes
    if any(p in t for p in ("cuantas solicitudes", "solicitudes hay", "pendientes", "por corregir",
                            "programadas", "finalizadas", "resumen", "totales")):
        return _solicitudes_resumen(db, user, pregunta)

    # 8) roles sin módulo de recreación: se les dice qué sí pueden consultar
    if (user.is_promotor or user.is_cotizador) and not _alcance_admin(user):
        if user.is_cotizador:
            return {"respuesta": ("Tu rol es de cotizaciones, así que puedo ayudarte con el "
                                  "catálogo de proveedores y las cotizaciones."),
                    "tipo": "texto",
                    "sugerencias": ["¿Cuánto llevamos cotizado?", "Muéstrame la última cotización"]}
        return {"respuesta": ("Puedo consultar tus solicitudes y tus cotizaciones. "
                              "Las agendas de recreadores las ve administración."),
                "tipo": "texto",
                "sugerencias": ["¿Cuántas solicitudes tengo?", "¿Cuánto llevamos cotizado?"]}

    # 7) sin intención reconocida
    base = _ayuda(user)
    base["respuesta"] = ("No estoy seguro de haber entendido. Puedo consultar la agenda de los "
                         "recreadores, las solicitudes y las cotizaciones. Prueba con:")
    return base
