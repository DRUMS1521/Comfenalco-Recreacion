from datetime import datetime, date
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import or_
import holidays

from app.models.solicitud import Solicitud
from app.models.user import User
from app.models.hora_extra import HoraExtraManual

CO_HOLIDAYS = holidays.CO()

CATEGORIAS = ("ordinarias", "recargo_nocturno", "extra_ordinaria", "extra_festiva")


def _to_minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def calc_hours(hora_inicio: str, hora_fin: str) -> float:
    """Misma lógica que stats_service._calc_hours: mínimo 1h si el turno es positivo."""
    try:
        mins = _to_minutes(hora_fin) - _to_minutes(hora_inicio)
        return max(mins / 60.0, 1.0) if mins > 0 else 0.0
    except Exception:
        return 0.0


def _horas_solapadas(hora_inicio: str, hora_fin: str, limite_inicio: str, limite_fin: str) -> float:
    ini, fin = _to_minutes(hora_inicio), _to_minutes(hora_fin)
    lim_ini, lim_fin = _to_minutes(limite_inicio), _to_minutes(limite_fin)
    solape = min(fin, lim_fin) - max(ini, lim_ini)
    return max(solape, 0) / 60.0


def clasificar_horas(fecha: date, hora_inicio: str, hora_fin: str) -> Dict[str, float]:
    """
    Clasifica un bloque de horas trabajadas según las reglas de jornada flexible
    de los recreadores (jornada base miércoles-domingo, lunes=extra ordinaria,
    martes=extra dominical/festiva, festivos reales tienen precedencia sobre todo).
    """
    resultado = {c: 0.0 for c in CATEGORIAS}
    total = calc_hours(hora_inicio, hora_fin)
    if total <= 0:
        return resultado

    dia_semana = fecha.weekday()  # 0=lunes ... 6=domingo
    es_festivo = fecha in CO_HOLIDAYS

    if es_festivo:
        resultado["extra_festiva"] = total
        return resultado
    if dia_semana == 0:  # lunes
        resultado["extra_ordinaria"] = total
        return resultado
    if dia_semana == 1:  # martes
        resultado["extra_festiva"] = total
        return resultado

    # miércoles a domingo, día normal: split 6:00am-7:00pm
    ordinarias = _horas_solapadas(hora_inicio, hora_fin, "06:00", "19:00")
    resultado["ordinarias"] = round(ordinarias, 4)
    resultado["recargo_nocturno"] = round(total - ordinarias, 4)
    return resultado


def _lugar_solicitud(s: Solicitud) -> Optional[str]:
    partes = [p for p in [s.direccion, s.ciudad] if p]
    return ", ".join(partes) if partes else None


def get_horas_recreador(
    db: Session,
    recreador_id: int,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
) -> Dict[str, Any]:
    user = db.query(User).filter(User.id == recreador_id).first()

    q = db.query(Solicitud).filter(
        or_(
            Solicitud.recreador_id == recreador_id,
            Solicitud.recreadores.any(User.id == recreador_id),
        ),
        Solicitud.estado == "finalizado",
    )
    if fecha_desde:
        q = q.filter(Solicitud.fecha_evento >= fecha_desde)
    if fecha_hasta:
        q = q.filter(Solicitud.fecha_evento <= fecha_hasta)
    solicitudes = q.all()

    totales = {c: 0.0 for c in CATEGORIAS}
    registros: List[Dict[str, Any]] = []

    for s in solicitudes:
        try:
            fecha_dt = datetime.strptime(s.fecha_evento, "%Y-%m-%d").date()
        except Exception:
            continue
        clasif = clasificar_horas(fecha_dt, s.hora_inicio, s.hora_fin)
        lugar = _lugar_solicitud(s)
        for categoria, horas in clasif.items():
            if horas <= 0:
                continue
            totales[categoria] += horas
            registros.append({
                "origen": "solicitud",
                "id": s.id,
                "fecha": s.fecha_evento,
                "hora_inicio": s.hora_inicio,
                "hora_fin": s.hora_fin,
                "empresa": s.empresa,
                "lugar": lugar,
                "categoria": categoria,
                "horas": round(horas, 2),
            })

    mq = db.query(HoraExtraManual).filter(HoraExtraManual.recreador_id == recreador_id)
    if fecha_desde:
        mq = mq.filter(HoraExtraManual.fecha >= fecha_desde)
    if fecha_hasta:
        mq = mq.filter(HoraExtraManual.fecha <= fecha_hasta)

    for m in mq.all():
        horas = calc_hours(m.hora_inicio, m.hora_fin)
        if horas <= 0:
            continue
        categoria = "extra_ordinaria" if m.tipo == "ordinaria" else "extra_festiva"
        totales[categoria] += horas
        registros.append({
            "origen": "manual",
            "id": m.id,
            "fecha": m.fecha,
            "hora_inicio": m.hora_inicio,
            "hora_fin": m.hora_fin,
            "empresa": m.empresa,
            "lugar": None,
            "categoria": categoria,
            "horas": round(horas, 2),
        })

    registros.sort(key=lambda r: (r["fecha"], r["hora_inicio"]), reverse=True)
    totales = {k: round(v, 2) for k, v in totales.items()}

    return {
        "recreador_id": recreador_id,
        "recreador_nombre": (user.full_name or user.username) if user else str(recreador_id),
        "totales": totales,
        "registros": registros,
    }


def get_resumen_admin(
    db: Session,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
) -> List[Dict[str, Any]]:
    recreadores = db.query(User).filter(User.is_recreador == True, User.is_active == True).all()  # noqa: E712
    resultado = []
    for r in recreadores:
        data = get_horas_recreador(db, r.id, fecha_desde, fecha_hasta)
        resultado.append({
            "recreador_id": r.id,
            "recreador_nombre": data["recreador_nombre"],
            "totales": data["totales"],
        })
    return resultado


def manual_to_dict(db: Session, m: HoraExtraManual) -> Dict[str, Any]:
    user = db.query(User).filter(User.id == m.recreador_id).first()
    return {
        "id": m.id,
        "recreador_id": m.recreador_id,
        "recreador_nombre": (user.full_name or user.username) if user else str(m.recreador_id),
        "fecha": m.fecha,
        "empresa": m.empresa,
        "hora_inicio": m.hora_inicio,
        "hora_fin": m.hora_fin,
        "tipo": m.tipo,
        "horas": round(calc_hours(m.hora_inicio, m.hora_fin), 2),
        "creado_por_id": m.creado_por_id,
        "created_at": m.created_at,
    }


def listar_horas_extra_manuales(
    db: Session,
    recreador_id: Optional[int] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
) -> List[HoraExtraManual]:
    q = db.query(HoraExtraManual)
    if recreador_id:
        q = q.filter(HoraExtraManual.recreador_id == recreador_id)
    if fecha_desde:
        q = q.filter(HoraExtraManual.fecha >= fecha_desde)
    if fecha_hasta:
        q = q.filter(HoraExtraManual.fecha <= fecha_hasta)
    return q.order_by(HoraExtraManual.fecha.desc()).all()


def crear_hora_extra_manual(db: Session, data, creado_por_id: int) -> HoraExtraManual:
    obj = HoraExtraManual(
        recreador_id=data.recreador_id,
        fecha=data.fecha,
        empresa=data.empresa,
        hora_inicio=data.hora_inicio,
        hora_fin=data.hora_fin,
        tipo=data.tipo,
        creado_por_id=creado_por_id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def actualizar_hora_extra_manual(db: Session, obj: HoraExtraManual, data) -> HoraExtraManual:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


def eliminar_hora_extra_manual(db: Session, obj: HoraExtraManual) -> None:
    db.delete(obj)
    db.commit()
