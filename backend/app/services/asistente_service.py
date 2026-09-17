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
    """Minúsculas, sin acentos y sin puntuación en los extremos.

    Se quitan los signos de apertura/cierre porque las preguntas llegan como
    "¿y mañana?" y los patrones anclados al inicio (para reconocer seguimientos)
    necesitan empezar por la palabra.
    """
    t = _sin_acentos((texto or "").lower()).strip()
    return t.strip("¿?¡!.,;:\"'()[]{} ").strip()


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


def _menciona_fecha(pregunta: str) -> bool:
    t = _norm(pregunta)
    if any(p in t for p in ("hoy", "manana", "ayer", "pasado manana", "esta semana",
                            "proxima semana", "semana entrante", "este mes")):
        return True
    if any(re.search(rf"\b{_norm(d)}\b", t) for d in DIAS):
        return True
    if re.search(r"\b\d{1,2}\s+de\s+[a-z]+", t) or re.search(r"\b\d{1,2}/\d{1,2}\b", t) \
            or re.search(r"\b\d{4}-\d{2}-\d{2}\b", t):
        return True
    return False


def _es_seguimiento(pregunta: str) -> bool:
    """Frases que continúan la conversación anterior: 'y mañana?', 'y sus horas?'."""
    t = _norm(pregunta)
    if re.match(r"^(y|e)\b", t):
        return True
    if len(t.split()) <= 5 and any(p in t for p in ("sus ", "su ", "de el", "de ella",
                                                    "mismo", "misma", "ese", "esa", "eso",
                                                    "tambien", "también", "ahora", "entonces")):
        return True
    return False


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

    # (2) parecido (tolera erratas: "gabrel" -> "gabriel")
    import difflib
    palabras = [w for w in t.split() if len(w) >= 4]
    alias = []
    for u in candidatos:
        for nombre in {_norm(u.full_name or ""), _norm(u.username.replace(".", " "))}:
            alias += [(x, u) for x in nombre.split() if len(x) >= 4]
    for palabra in palabras:
        cercanos = difflib.get_close_matches(palabra, [a for a, _ in alias], n=2, cutoff=0.85)
        if cercanos:
            usuarios = {u.id: u for a, u in alias if a == cercanos[0]}
            if len(usuarios) == 1:
                return list(usuarios.values())[0]

    # (3) token único
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


PALABRAS_VACIAS = {
    "quien", "quienes", "quien va", "van", "va", "para", "por", "con", "los", "las", "una",
    "unos", "unas", "del", "que", "como", "esta", "estan", "este", "ese", "esa", "esos",
    "hay", "tiene", "tienen", "cual", "cuales", "cuando", "donde", "hoy", "manana", "ayer",
    "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo", "semana",
    "mes", "dia", "dias", "actividad", "actividades", "agenda", "programad", "asignado",
    "asignados", "encargado", "encargados", "cubre", "trabaja", "trabajan", "evento",
    "eventos", "solicitud", "solicitudes", "recreador", "recreadores", "persona",
    "personas", "turno", "horario", "hora", "horas", "cual", "mas", "menos", "todo",
    "todos", "ver", "dime", "muestrame", "saber", "puedes", "decir",
}


def _coincide_con_algo(db: Session, texto: str) -> bool:
    """¿El texto aparece en alguna actividad (empresa, servicio, observaciones, ciudad)?"""
    patron = f"%{texto}%"
    return db.query(Solicitud.id).filter(or_(
        Solicitud.empresa.ilike(patron),
        Solicitud.tipo_servicio.ilike(patron),
        Solicitud.observaciones.ilike(patron),
        Solicitud.ciudad.ilike(patron),
    )).first() is not None


def _detectar_concepto(db: Session, pregunta: str) -> Optional[str]:
    """Concepto del que habla la pregunta: 'caike', 'cru', 'escuelas deportivas'…

    Se buscan las palabras significativas (quitando las vacías) y se prueba la frase
    más larga que exista de verdad en la base, para no inventar filtros. Es lo que
    permite responder "quién va el domingo para caike" aunque CAIKE solo aparezca
    dentro de las observaciones.
    """
    from app.services.asistente_consulta import VACIAS  # vocabulario de la consulta
    t = _norm(pregunta)
    # fuera las fechas ISO que se añaden al heredar el turno anterior ("2026-09-20"):
    # si no, "2026" se colaba como concepto porque aparece en las observaciones
    t = re.sub(r"\d{4}-\d{2}-\d{2}", " ", t)
    palabras = [w for w in re.split(r"[^a-z0-9]+", t)
                if len(w) >= 3 and not w.isdigit()
                and w not in PALABRAS_VACIAS and w not in VACIAS]
    if not palabras:
        return None
    # descartar los nombres propios de recreadores
    nombres = set()
    for u in db.query(User).filter(User.is_recreador == True).all():  # noqa: E712
        for nombre in {_norm(u.full_name or ""), _norm(u.username.replace(".", " "))}:
            nombres |= {x for x in nombre.split() if len(x) >= 3}
    palabras = [w for w in palabras if w not in nombres]
    if not palabras:
        return None
    for n in range(min(3, len(palabras)), 0, -1):
        for i in range(len(palabras) - n + 1):
            frase = " ".join(palabras[i:i + n])
            if _coincide_con_algo(db, frase):
                return frase
    return None


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
        # "hoy" y "mañana" necesitan la fecha; "el domingo 20 de septiembre…" ya la trae
        return (f"{etiqueta} ({_fecha_larga(desde)})"
                if etiqueta in ("hoy", "mañana", "ayer") else etiqueta)
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


def _quien_va(db: Session, user: User, pregunta: str,
              concepto: Optional[str] = None, ciudad: Optional[str] = None,
              estado: Optional[str] = None) -> Dict[str, Any]:
    """Quién tiene asignada cada actividad de una fecha (con filtros opcionales)."""
    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    q = db.query(Solicitud).filter(
        Solicitud.fecha_evento >= desde.isoformat(),
        Solicitud.fecha_evento <= hasta.isoformat(),
        Solicitud.estado == (estado or "programado"),
    )
    if ciudad:
        q = q.filter(Solicitud.ciudad.ilike(f"%{ciudad}%"))
    # alcance por rol
    if user.is_recreador:
        q = q.filter(or_(Solicitud.recreador_id == user.id,
                         Solicitud.recreadores.any(User.id == user.id)))
    elif not (user.is_admin or user.is_cotizador):
        q = q.filter(Solicitud.user_id == user.id)

    if not concepto:
        # mismo criterio que la agenda: las tareas administrativas del cronograma no
        # se listan salvo que se pregunte por un tema concreto
        q = q.filter(or_(Solicitud.categoria_origen.is_(None),
                         Solicitud.categoria_origen != "administrativo"))

    if concepto:
        patron = f"%{concepto}%"
        q = q.filter(or_(
            Solicitud.empresa.ilike(patron),
            Solicitud.tipo_servicio.ilike(patron),
            Solicitud.observaciones.ilike(patron),
            Solicitud.ciudad.ilike(patron),
        ))

    solicitudes = q.order_by(Solicitud.fecha_evento, Solicitud.hora_inicio).all()
    de_quien = f" de «{concepto}»" if concepto else ""

    if not solicitudes:
        # ¿existe el concepto en otra fecha? Se avisa para no dejar sin salida
        alternativa = ""
        if concepto:
            existe = db.query(Solicitud).filter(
                or_(Solicitud.empresa.ilike(f"%{concepto}%"),
                    Solicitud.tipo_servicio.ilike(f"%{concepto}%"),
                    Solicitud.observaciones.ilike(f"%{concepto}%"))
            ).order_by(Solicitud.fecha_evento).first()
            if existe:
                try:
                    anio, mes, dia = (int(x) for x in str(existe.fecha_evento).split("-"))
                    alternativa = (" Lo encuentro en otras fechas, por ejemplo el "
                                   f"{_fecha_larga(date(anio, mes, dia))}.")
                except (ValueError, TypeError):
                    alternativa = ""
        return {
            "respuesta": (f"No hay actividades{de_quien} {_etiqueta_rango(desde, hasta, etiqueta)}."
                          + alternativa),
            "tipo": "texto",
            "sugerencias": ["¿Qué actividades hay hoy?", "¿Quién va mañana?"],
        }

    items = []
    personas = set()
    for s in solicitudes:
        quienes = [_nombre(r) for r in s.recreadores] or (
            [_nombre(s.recreador)] if s.recreador else [])
        if not quienes:
            quienes = ["Sin asignar"]
        personas.update(quienes)
        items.append({
            "titulo": f"{s.hora_inicio}–{s.hora_fin} · {s.empresa}",
            "subtitulo": "Van: " + ", ".join(quienes),
            "meta": f"{s.ciudad or ''}".strip() or (s.tipo_servicio or ""),
            "estado": "libre" if quienes == ["Sin asignar"] else None,
            "horas": None,
        })

    plural = "actividad" if len(solicitudes) == 1 else "actividades"
    return {
        "respuesta": (f"{_etiqueta_rango(desde, hasta, etiqueta).capitalize()} hay "
                      f"**{len(solicitudes)} {plural}{de_quien}** con "
                      f"{len(personas)} recreador{'es' if len(personas) != 1 else ''} asignado"
                      f"{'s' if len(personas) != 1 else ''}."),
        "tipo": "actividades",
        "items": items[:10],
        "extra": f"y {len(solicitudes) - 10} más" if len(solicitudes) > 10 else None,
        "sugerencias": ["¿Quién va mañana?", "¿Qué actividades hay el domingo?"],
    }


def _consulta_actividades(db: Session, user: User, pregunta: str, f=None) -> Dict[str, Any]:
    """Responde usando el motor de filtros (combinaciones y agrupaciones)."""
    from app.services import asistente_consulta as motor
    f = f or motor.extraer(db, user, pregunta)
    r = motor.ejecutar(db, user, f)
    fichas = f.fichas()
    etiqueta = f.etiqueta_fecha or "el periodo consultado"
    rango_largo = f.rango or (f.desde != f.hasta)

    if r["tipo"] == "grupos":
        filas = r["filas"]
        if not filas:
            return {"respuesta": f"No hay actividades que cumplan esos filtros ({motor.describir(f)}).",
                    "tipo": "texto", "filtros": fichas,
                    "sugerencias": ["¿Qué actividades hay hoy?", "¿Cuántas hay por empresa este mes?"]}
        campo = (f.agrupar_por or "").replace("_", " ")
        cabeza = filas[0]
        respuesta = (f"**{r['total']} actividades** en {len(filas)} grupos de {campo} "
                     f"({r['horas']} h) · {etiqueta}. El mayor: **{cabeza[0]}** con "
                     f"{cabeza[1]['n']} actividades y {round(cabeza[1]['horas'], 1)} h.")
        items = [{
            "titulo": str(clave),
            "subtitulo": (f"{datos['n']} actividades · {round(datos['horas'], 1)} h"
                          + (f" · {len(datos['personas'])} personas" if datos["personas"] else "")),
            "meta": "El mayor" if i == 0 else "",
            "estado": None,
        } for i, (clave, datos) in enumerate(filas)]
        return {"respuesta": respuesta, "tipo": "grupos", "items": items, "filtros": fichas,
                "conteos": [{"etiqueta": "Actividades", "valor": r["total"]},
                            {"etiqueta": "Horas", "valor": r["horas"]},
                            {"etiqueta": campo.capitalize() or "Grupos", "valor": r["grupos"]}],
                "extra": f"y {r['grupos'] - len(filas)} grupos más" if r["grupos"] > len(filas) else None,
                "sugerencias": ["¿Cuántas hay por ciudad?", "¿Y agrupadas por recreador?"]}

    solicitudes = r["solicitudes"]
    if not solicitudes:
        return {"respuesta": (f"No hay actividades que cumplan esos filtros "
                              f"({motor.describir(f)}) para tu alcance."),
                "tipo": "texto", "filtros": fichas,
                "sugerencias": ["¿Qué actividades hay hoy?", "¿Quién va el domingo?"]}
    plural = "actividad" if r["total"] == 1 else "actividades"
    respuesta = (f"**{r['total']} {plural}** · {r['horas']} h · {r['personas']} personas · "
                 f"{etiqueta}.")
    return {"respuesta": respuesta, "tipo": "actividades", "filtros": fichas,
            "items": [_tarjeta_actividad(s, con_fecha=rango_largo) for s in solicitudes[:f.limite]],
            "extra": f"y {r['total'] - f.limite} más" if r["total"] > f.limite else None,
            "sugerencias": ["¿Y agrupadas por empresa?", "¿Quién va ese día?"]}


def _menos_carga(db: Session, user: User, pregunta: str) -> Dict[str, Any]:
    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    recreadores = db.query(User).filter(User.is_recreador == True, User.is_active == True).all()  # noqa: E712
    conteo: Dict[int, int] = {u.id: 0 for u in recreadores}
    horas: Dict[int, float] = {u.id: 0.0 for u in recreadores}
    for s in db.query(Solicitud).filter(
        Solicitud.fecha_evento >= desde.isoformat(),
        Solicitud.fecha_evento <= hasta.isoformat(),
        Solicitud.estado == "programado",
    ).all():
        for r in s.recreadores:
            if r.id in conteo:
                conteo[r.id] += 1
                horas[r.id] += calc_hours(s.hora_inicio, s.hora_fin)
    ordenados = sorted(recreadores, key=lambda u: (conteo[u.id], horas[u.id], _nombre(u)))
    items = [{"titulo": _nombre(u), "subtitulo": f"{conteo[u.id]} actividades · {round(horas[u.id], 1)} h",
              "meta": "Menor carga" if i == 0 else "", "estado": "libre" if conteo[u.id] == 0 else None}
             for i, u in enumerate(ordenados[:8])]
    return {
        "respuesta": (f"Con menos carga {etiqueta} ({desde.isoformat()}): "
                      f"**{_nombre(ordenados[0])}** con {conteo[ordenados[0].id]} actividades "
                      f"y {round(horas[ordenados[0].id], 1)} h."),
        "tipo": "personas", "items": items,
        "sugerencias": ["¿Qué recreadores están libres hoy?", "¿Qué actividades hay hoy?"],
    }


def _sin_asignar(db: Session, user: User, pregunta: str) -> Dict[str, Any]:
    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    solicitudes = (
        db.query(Solicitud)
        .filter(Solicitud.fecha_evento >= desde.isoformat(),
                Solicitud.fecha_evento <= hasta.isoformat(),
                Solicitud.estado == "programado",
                Solicitud.recreador_id.is_(None))
        .all()
    )
    if not solicitudes:
        return {"respuesta": (f"No hay actividades programadas sin recreador asignado {etiqueta}. "
                              "Todas tienen al menos una persona."),
                "tipo": "texto",
                "sugerencias": ["¿Qué actividades hay hoy?", "¿Quién tiene menos carga hoy?"]}
    return {"respuesta": f"Hay **{len(solicitudes)} actividades sin recreador asignado** {etiqueta}.",
            "tipo": "actividades",
            "items": [_tarjeta_actividad(s, con_fecha=True) for s in solicitudes[:10]],
            "sugerencias": ["¿Qué recreadores están libres hoy?"]}


def _top_empresas(db: Session, user: User, pregunta: str) -> Dict[str, Any]:
    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    filas = (
        db.query(Solicitud.empresa, func.count(Solicitud.id))
        .filter(Solicitud.fecha_evento >= desde.isoformat(),
                Solicitud.fecha_evento <= hasta.isoformat(),
                Solicitud.estado.in_(["programado", "finalizado"]))
        .group_by(Solicitud.empresa)
        .order_by(func.count(Solicitud.id).desc())
        .limit(8)
        .all()
    )
    if not filas:
        return {"respuesta": f"No hay actividades registradas {etiqueta}.", "tipo": "texto",
                "sugerencias": ["¿Qué actividades hay hoy?"]}
    items = [{"titulo": nombre, "subtitulo": f"{n} actividades", "meta": "Más actividad" if i == 0 else ""}
             for i, (nombre, n) in enumerate(filas)]
    return {
        "respuesta": (f"{etiqueta.capitalize()} la empresa con más actividades es "
                      f"**{filas[0][0]}** con {filas[0][1]}."),
        "tipo": "personas", "items": items,
        "sugerencias": ["¿Qué actividades hay hoy?", "¿Cuántas solicitudes hay programadas?"],
    }


def _recreadores_activos(db: Session) -> Dict[str, Any]:
    activos = db.query(func.count(User.id)).filter(User.is_recreador == True,  # noqa: E712
                                                   User.is_active == True).scalar() or 0  # noqa: E712
    inactivos = db.query(func.count(User.id)).filter(User.is_recreador == True,  # noqa: E712
                                                     User.is_active == False).scalar() or 0  # noqa: E712
    return {"respuesta": (f"Hay **{activos} recreadores activos**"
                          + (f" y {inactivos} inactivos." if inactivos else ".")),
            "tipo": "conteos",
            "conteos": [{"etiqueta": "Activos", "valor": activos},
                        {"etiqueta": "Inactivos", "valor": inactivos}],
            "sugerencias": ["¿Qué recreadores están libres hoy?", "¿Quién tiene menos carga hoy?"]}


# ── enrutador de intenciones (con memoria de la conversación) ───────────────
def _acciones_para(tipo: str) -> List[Dict[str, str]]:
    if tipo == "cotizaciones":
        return [{"tab": "cotizaciones", "etiqueta": "Ir a Cotizaciones"}]
    if tipo in ("actividades", "personas"):
        return [{"tab": "calendario", "etiqueta": "Ver calendario"}]
    return []


def _cerrar(respuesta: Dict[str, Any], contexto: Dict[str, Any],
            tema: Optional[str] = None, recreador: Optional[User] = None,
            empresa: Optional[str] = None, fecha: Optional[date] = None,
            etiqueta_fecha: Optional[str] = None) -> Dict[str, Any]:
    """Completa la respuesta con el contexto que se recordará en el próximo turno."""
    ctx = dict(contexto or {})
    if tema:
        ctx["tema"] = tema
    if recreador:
        ctx["recreador_id"] = recreador.id
        ctx["recreador_nombre"] = _nombre(recreador)
    if empresa:
        ctx["empresa"] = empresa
    if fecha:
        ctx["fecha"] = fecha.isoformat()
        ctx["fecha_etiqueta"] = etiqueta_fecha or _etiqueta_fecha(fecha)
    respuesta["contexto_conversacion"] = ctx
    respuesta["acciones"] = _acciones_para(respuesta.get("tipo", "texto"))
    return respuesta


def responder(db: Session, user: User, pregunta: str,
               contexto: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Resuelve la pregunta teniendo en cuenta lo hablado antes.

    `contexto` es el que devolvió la respuesta anterior (recreador, fecha y tema).
    Así funcionan los seguimientos del tipo "¿y mañana?" o "¿y cuántas horas?".
    """
    contexto = dict(contexto or {})
    t = _norm(pregunta)
    if not t:
        return _cerrar(_ayuda(user), {})

    # ── charla corta ──
    if re.search(r"\b(gracias|mil gracias|muchas gracias|te agradezco)\b", t):
        return _cerrar({
            "respuesta": f"¡Con gusto, {_nombre(user).split(' ')[0]}! Si necesitas algo más, aquí estoy.",
            "tipo": "texto",
            "sugerencias": ["¿Qué actividades hay hoy?", "¿Quién tiene menos carga hoy?"],
        }, contexto)
    if any(p in t for p in ("quien eres", "que eres", "como te llamas", "eres un robot",
                            "eres humano", "eres una ia")):
        return _cerrar({
            "respuesta": ("Soy el asistente interno de Comfenalco Tolima: consulto la base del "
                          "sistema (agenda de recreadores, solicitudes, horas y cotizaciones) y "
                          "te respondo al instante. No soy un modelo de lenguaje: trabajo con "
                          "reglas y datos reales, así que si algo no lo entiendo te lo digo."),
            "tipo": "texto",
            "sugerencias": ["¿Qué puedes hacer?", "¿Qué actividades hay hoy?"],
        }, contexto)
    if any(p in t for p in ("adios", "hasta luego", "chao", "nos vemos")):
        return _cerrar({"respuesta": f"¡Hasta luego, {_nombre(user).split(' ')[0]}! "
                                     "Quedo pendiente de lo que necesites.",
                        "tipo": "texto", "sugerencias": ["¿Qué actividades hay hoy?"]}, contexto)

    pide_ayuda = any(p in t for p in ("que puedes hacer", "ayuda", "como funciona",
                                      "que sabes", "instrucciones", "opciones"))
    saludo = bool(re.search(r"\b(hola|buenas|buenos dias|buenas tardes|buenas noches|hey)\b", t))
    if pide_ayuda or (saludo and len(t.split()) <= 4):
        return _cerrar(_ayuda(user), {})

    # ── contexto del turno anterior ──
    seg = _es_seguimiento(pregunta)
    menciona_fecha = _menciona_fecha(pregunta)
    tema_previo = contexto.get("tema")
    rec_previo = None
    if contexto.get("recreador_id"):
        rec_previo = db.query(User).filter(User.id == contexto["recreador_id"]).first()

    # Temas explícitos de la frase (antes de decidir qué se hereda)
    menciona_horas = "hora" in t
    menciona_cotiz = "cotiza" in t
    menciona_agenda = any(p in t for p in ("actividad", "actividades", "agenda", "que tiene",
                                           "que tengo", "que hace", "programad", "turno",
                                           "tareas", "horario", "eventos"))
    menciona_libre = "libre" in t or "disponible" in t
    # Otras intenciones con palabras propias: también cuentan como "tema nuevo",
    # para que un seguimiento como "¿y quién tiene menos carga?" no herede la fecha
    # de la pregunta anterior.
    menciona_quien_va = any(p in t for p in (
        "quien va", "quienes van", "quien esta", "quienes estan", "quien cubre",
        "quien trabaja", "quienes trabajan", "quien asiste", "asignado a", "encargado de",
        "van para", "quienes cubren"))
    # OJO: "quién va" NO entra aquí a propósito. Depende de la fecha, así que como
    # seguimiento ("¿y quién va?") debe heredar la del turno anterior; bloquearla
    # hacía que respondiera siempre por hoy.
    menciona_otro = (
        any(p in t for p in ("menos carga", "quien tiene menos", "mas libre", "menos actividades",
                             "mas descansado", "sin asignar", "sin recreador", "sin nadie",
                             "falta asignar", "cuantos recreadores", "recreadores activos",
                             "que empresas", "empresas con mas", "top empresas",
                             "mas actividades tiene"))
        or "solicitud" in t
    )
    tema_explicito = ("horas" if menciona_horas else
                      "cotizaciones" if menciona_cotiz else
                      "agenda" if (menciona_agenda or menciona_libre) else
                      "otro" if menciona_otro else None)

    # Solo una continuación PURA (sin tema ni fecha propios) hereda la fecha anterior:
    # así "¿y el lunes?" usa su fecha, y "¿y quién tiene menos carga?" vuelve a hoy.
    if seg and not menciona_fecha and tema_explicito is None and contexto.get("fecha"):
        pregunta = f"{pregunta} {contexto['fecha']}"

    desde, hasta, etiqueta = _detectar_fecha(pregunta)
    rec = _buscar_recreador(db, pregunta, excluir_id=user.id if user.is_recreador else None)
    if not rec and seg and rec_previo:
        rec = rec_previo

    # ── qué tema pide la frase ──
    # Manda lo explícito; si no dice nada y es un seguimiento, se hereda el tema
    # anterior. Un seguimiento con fecha propia ("¿y mañana?", "¿y el lunes?") se
    # entiende como agenda.
    if tema_explicito and tema_explicito != "otro":
        tema = tema_explicito
    elif seg and menciona_fecha:
        tema = "agenda"
    elif seg:
        tema = tema_previo
    else:
        tema = None

    # ── filtros de la pregunta (motor de consultas) ──
    from app.services import asistente_consulta as motor
    f = motor.extraer(db, user, pregunta)
    # un concepto que en realidad es una empresa o ciudad no debe duplicarse
    concepto = f.concepto or f.empresa or f.tipo_servicio
    filtros_combinables = any([f.ciudad, f.tipo_servicio, f.categoria, f.estado, f.concepto,
                               f.empresa, f.rango, f.excluir_recreador_id, f.agrupar_por])

    # ── intenciones específicas (solo con palabras propias, no heredan) ──
    if menciona_quien_va:
        r = _quien_va(db, user, pregunta, concepto, f.ciudad, f.estado)
        return _cerrar(r, contexto, tema="quien_va", fecha=desde, etiqueta_fecha=etiqueta)

    # ── combinaciones y agrupaciones: las resuelve el motor de filtros ──
    if f.agrupar_por or (filtros_combinables and not user.is_cotizador):
        r = _consulta_actividades(db, user, pregunta, f)
        return _cerrar(r, contexto, tema="consulta", fecha=desde, etiqueta_fecha=etiqueta,
                       empresa=f.empresa, recreador=(db.query(User).get(f.recreador_id)
                                                     if f.recreador_id else None))
    if any(p in t for p in ("menos carga", "quien tiene menos", "mas libre", "menos actividades",
                            "mas descansado")):
        r = _menos_carga(db, user, pregunta)
        return _cerrar(r, contexto, tema="carga", fecha=desde, etiqueta_fecha=etiqueta)
    if any(p in t for p in ("sin asignar", "sin recreador", "sin nadie", "falta asignar")):
        r = _sin_asignar(db, user, pregunta)
        return _cerrar(r, contexto, tema="sin_asignar", fecha=desde, etiqueta_fecha=etiqueta)
    if any(p in t for p in ("cuantos recreadores", "recreadores activos")):
        return _cerrar(_recreadores_activos(db), contexto, tema="recreadores")
    if any(p in t for p in ("que empresas", "empresas con mas", "top empresas",
                            "mas actividades tiene")):
        r = _top_empresas(db, user, pregunta)
        return _cerrar(r, contexto, tema="empresas", fecha=desde, etiqueta_fecha=etiqueta)

    # ── cotizaciones ──
    if tema == "cotizaciones":
        mencion = re.search(r"(?:de|para|cliente)\s+([a-z0-9 .&-]{3,40})", t)
        empresa = mencion.group(1).strip() if mencion else contexto.get("empresa")
        if empresa and empresa in ("esta semana", "este mes", "hoy", "manana"):
            empresa = None
        r = _cotizaciones(db, user, pregunta, empresa)
        return _cerrar(r, contexto, tema="cotizaciones", empresa=empresa, fecha=desde,
                       etiqueta_fecha=etiqueta)

    # ── horas ──
    if tema == "horas":
        objetivo = rec or (user if user.is_recreador else None)
        if objetivo:
            r = _horas_de_recreador(db, user, pregunta, objetivo)
            return _cerrar(r, contexto, tema="horas", recreador=objetivo, fecha=desde,
                           etiqueta_fecha=etiqueta)

    # ── una empresa o tema concreto (incluye conceptos de las observaciones) ──
    if not user.is_recreador and not user.is_cotizador:
        concepto = _detectar_concepto(db, pregunta)
        if concepto:
            r = _quien_va(db, user, pregunta, concepto)
            return _cerrar(r, contexto, tema="concepto", fecha=desde, etiqueta_fecha=etiqueta)

    empresa = _detectar_empresa(db, pregunta)
    if not empresa and seg and contexto.get("empresa"):
        empresa = contexto["empresa"]
    if empresa and not user.is_cotizador and not user.is_recreador:
        r = _empresa(db, user, pregunta, empresa)
        return _cerrar(r, contexto, tema="empresa", empresa=empresa, fecha=desde,
                       etiqueta_fecha=etiqueta)

    # ── conteos de solicitudes ──
    if "solicitud" in t and any(p in t for p in ("cuantas", "cuántas", "total", "hay",
                                                 "pendientes", "corregir", "programad",
                                                 "finalizad", "resumen")):
        r = _solicitudes_resumen(db, user, pregunta)
        return _cerrar(r, contexto, tema="solicitudes")

    # ── agenda ──
    if tema == "agenda":
        propio = any(p in t for p in ("mi agenda", "mis actividades", "que tengo", "mi turno",
                                      "mis tareas", "tengo hoy", "tengo manana", "mi horario"))
        if propio and user.is_recreador:
            r = _mis_actividades(db, user, pregunta)
            return _cerrar(r, contexto, tema="agenda", recreador=user, fecha=desde,
                           etiqueta_fecha=etiqueta)
        if propio and _alcance_admin(user):
            r = _actividades_globales(db, user, pregunta)
            return _cerrar(r, contexto, tema="agenda", fecha=desde, etiqueta_fecha=etiqueta)
        if menciona_libre:
            r = _disponibles(db, user, pregunta)
            return _cerrar(r, contexto, tema="disponibilidad", fecha=desde, etiqueta_fecha=etiqueta)
        if rec:
            r = _actividades_de_recreador(db, user, pregunta, rec)
            return _cerrar(r, contexto, tema="actividades", recreador=rec, fecha=desde,
                           etiqueta_fecha=etiqueta)
        if not seg:
            candidatos = _recreadores_ambiguos(db, pregunta)
            if len(candidatos) > 1 and _alcance_admin(user):
                return _cerrar({
                    "respuesta": ("Con ese nombre puedo referirme a varios recreadores: "
                                  + ", ".join(_nombre(c) for c in candidatos[:6])
                                  + ". ¿Cuál de ellos?"),
                    "tipo": "texto",
                    "sugerencias": [f"¿Qué actividades tiene {_nombre(c)} hoy?" for c in candidatos[:3]],
                }, contexto)
        if _alcance_admin(user):
            r = _actividades_globales(db, user, pregunta)
            return _cerrar(r, contexto, tema="agenda", fecha=desde, etiqueta_fecha=etiqueta)
        if user.is_recreador:
            r = _mis_actividades(db, user, pregunta)
            return _cerrar(r, contexto, tema="agenda", recreador=user, fecha=desde,
                           etiqueta_fecha=etiqueta)

    # ── resumen general ──
    if any(p in t for p in ("cuantas solicitudes", "solicitudes hay", "pendientes", "por corregir",
                            "programadas", "finalizadas", "resumen", "totales")):
        r = _solicitudes_resumen(db, user, pregunta)
        return _cerrar(r, contexto, tema="solicitudes")

    # ── roles sin módulo de recreación ──
    if (user.is_promotor or user.is_cotizador) and not _alcance_admin(user):
        if user.is_cotizador:
            return _cerrar({
                "respuesta": ("Tu rol es de cotizaciones, así que puedo ayudarte con el catálogo "
                              "de proveedores y las cotizaciones."),
                "tipo": "texto",
                "sugerencias": ["¿Cuánto llevamos cotizado?", "Muéstrame la última cotización"],
            }, contexto)
        return _cerrar({
            "respuesta": ("Puedo consultar tus solicitudes y tus cotizaciones. Las agendas de "
                          "recreadores las ve administración."),
            "tipo": "texto",
            "sugerencias": ["¿Cuántas solicitudes tengo?", "¿Cuánto llevamos cotizado?"],
        }, contexto)

    # ── sin intención reconocida: se intenta una búsqueda antes de rendirse ──
    if not user.is_cotizador:
        intento = _consulta_actividades(db, user, pregunta, f)
        if intento.get("items"):
            intento["respuesta"] = ("No estoy seguro de haber entendido del todo, pero esto es lo "
                                    "que coincide con tu pregunta: " + intento["respuesta"])
            return _cerrar(intento, contexto, tema="busqueda", fecha=desde, etiqueta_fecha=etiqueta)
    base = _ayuda(user)
    base["respuesta"] = ("No estoy seguro de haber entendido. Puedo consultar la agenda de los "
                         "recreadores, las solicitudes y las cotizaciones. Prueba con:")
    return _cerrar(base, contexto)
