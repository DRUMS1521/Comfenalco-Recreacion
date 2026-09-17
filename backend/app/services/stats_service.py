from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List, Dict, Any
from app.models.solicitud import Solicitud
from app.models.user import User
from app.models.empresa import Empresa
# Cálculo de horas centralizado (antes duplicado en este módulo y en horas_extra_service).
from app.services.horas_utils import calc_hours as _calc_hours  # noqa: F401


def _apply_filters(query, fecha_desde: Optional[str], fecha_hasta: Optional[str], tipo_servicio: Optional[str]):
    if fecha_desde:
        query = query.filter(Solicitud.fecha_evento >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Solicitud.fecha_evento <= fecha_hasta)
    if tipo_servicio:
        query = query.filter(Solicitud.tipo_servicio == tipo_servicio)
    return query


def get_stats_recreador(
    db: Session,
    recreador_id: int,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    tipo_servicio: Optional[str] = None,
) -> Dict[str, Any]:
    base_q = db.query(Solicitud).filter(
        or_(
            Solicitud.recreador_id == recreador_id,
            Solicitud.recreadores.any(User.id == recreador_id),
        )
    ).filter(Solicitud.estado != "eliminado")

    filtered_q = _apply_filters(base_q, fecha_desde, fecha_hasta, tipo_servicio)
    solicitudes = filtered_q.order_by(Solicitud.fecha_evento.desc()).all()

    finalizadas = [s for s in solicitudes if s.estado == "finalizado"]
    programadas = [s for s in solicitudes if s.estado == "programado"]

    horas_finalizadas = sum(_calc_hours(s.hora_inicio, s.hora_fin) for s in finalizadas)

    tipo_count: Dict[str, int] = {}
    for s in solicitudes:
        tipo_count[s.tipo_servicio] = tipo_count.get(s.tipo_servicio, 0) + 1

    por_tipo = sorted(
        [{"tipo": k, "count": v} for k, v in tipo_count.items()],
        key=lambda x: x["count"], reverse=True
    )

    return {
        "total": len(solicitudes),
        "finalizadas": len(finalizadas),
        "programadas": len(programadas),
        "horas_finalizadas": round(horas_finalizadas, 1),
        "por_tipo_servicio": por_tipo,
        "solicitudes_finalizadas": [
            {
                "id": s.id,
                "empresa": s.empresa,
                "fecha_evento": s.fecha_evento,
                "hora_inicio": s.hora_inicio,
                "hora_fin": s.hora_fin,
                "tipo_servicio": s.tipo_servicio,
                "ciudad": s.ciudad,
                "observacion_final": s.observacion_final,
                "fecha_finalizacion": s.fecha_finalizacion.isoformat() if s.fecha_finalizacion else None,
                "horas": _calc_hours(s.hora_inicio, s.hora_fin),
            }
            for s in finalizadas
        ],
    }


def get_stats_admin(
    db: Session,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    tipo_servicio: Optional[str] = None,
    recreador_id: Optional[int] = None,
) -> Dict[str, Any]:
    base_q = db.query(Solicitud).filter(Solicitud.estado != "eliminado")

    if recreador_id:
        base_q = base_q.filter(
            or_(
                Solicitud.recreador_id == recreador_id,
                Solicitud.recreadores.any(User.id == recreador_id),
            )
        )

    filtered_q = _apply_filters(base_q, fecha_desde, fecha_hasta, tipo_servicio)
    solicitudes = filtered_q.order_by(Solicitud.fecha_evento.desc()).all()

    por_estado: Dict[str, int] = {}
    for s in solicitudes:
        por_estado[s.estado] = por_estado.get(s.estado, 0) + 1

    tipo_count: Dict[str, int] = {}
    for s in solicitudes:
        tipo_count[s.tipo_servicio] = tipo_count.get(s.tipo_servicio, 0) + 1

    por_tipo = sorted(
        [{"tipo": k, "count": v} for k, v in tipo_count.items()],
        key=lambda x: x["count"], reverse=True
    )

    # Estadísticas por recreador
    recreadores_map: Dict[int, Dict] = {}
    for s in solicitudes:
        ids_asignados = {r.id for r in s.recreadores}
        if s.recreador_id:
            ids_asignados.add(s.recreador_id)
        for rid in ids_asignados:
            if rid not in recreadores_map:
                user = db.query(User).filter(User.id == rid).first()
                recreadores_map[rid] = {
                    "id": rid,
                    "nombre": user.full_name if user else str(rid),
                    "finalizadas": 0,
                    "programadas": 0,
                    "horas": 0.0,
                }
            if s.estado == "finalizado":
                recreadores_map[rid]["finalizadas"] += 1
                recreadores_map[rid]["horas"] += _calc_hours(s.hora_inicio, s.hora_fin)
            elif s.estado == "programado":
                recreadores_map[rid]["programadas"] += 1

    por_recreador = sorted(
        list(recreadores_map.values()),
        key=lambda x: x["finalizadas"], reverse=True
    )
    for r in por_recreador:
        r["horas"] = round(r["horas"], 1)

    # Si hay filtro por recreador, mostrar solo ese en la tabla
    if recreador_id:
        por_recreador = [r for r in por_recreador if r["id"] == recreador_id]

    finalizadas_list = [s for s in solicitudes if s.estado == "finalizado"]
    horas_totales = sum(_calc_hours(s.hora_inicio, s.hora_fin) for s in finalizadas_list)

    return {
        "total": len(solicitudes),
        "por_estado": por_estado,
        "horas_totales": round(horas_totales, 1),
        "por_tipo_servicio": por_tipo,
        "por_recreador": por_recreador,
        "solicitudes": [
            {
                "id": s.id,
                "empresa": s.empresa,
                "fecha_evento": s.fecha_evento,
                "hora_inicio": s.hora_inicio,
                "hora_fin": s.hora_fin,
                "tipo_servicio": s.tipo_servicio,
                "ciudad": s.ciudad,
                "estado": s.estado,
                "observacion_final": s.observacion_final,
                "horas": _calc_hours(s.hora_inicio, s.hora_fin),
                "recreadores": [
                    {"id": r.id, "nombre": r.full_name or r.username}
                    for r in s.recreadores
                ],
            }
            for s in solicitudes
        ],
    }


def get_stats_empresarial(
    db: Session,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    tipo_servicio: Optional[str] = None,
    empresa_nombre: Optional[str] = None,
) -> Dict[str, Any]:
    base_q = db.query(Solicitud).filter(Solicitud.estado != "eliminado")

    if empresa_nombre:
        base_q = base_q.filter(Solicitud.empresa == empresa_nombre)

    filtered_q = _apply_filters(base_q, fecha_desde, fecha_hasta, tipo_servicio)
    solicitudes = filtered_q.order_by(Solicitud.fecha_evento.desc()).all()

    por_estado: Dict[str, int] = {}
    for s in solicitudes:
        por_estado[s.estado] = por_estado.get(s.estado, 0) + 1

    tipo_count: Dict[str, int] = {}
    for s in solicitudes:
        tipo_count[s.tipo_servicio] = tipo_count.get(s.tipo_servicio, 0) + 1

    por_tipo = sorted(
        [{"tipo": k, "count": v} for k, v in tipo_count.items()],
        key=lambda x: x["count"], reverse=True
    )

    # Estadísticas agrupadas por empresa
    empresas_map: Dict[str, Dict] = {}
    for s in solicitudes:
        nombre = s.empresa or "Sin empresa"
        if nombre not in empresas_map:
            empresas_map[nombre] = {
                "nombre": nombre,
                "total": 0,
                "finalizadas": 0,
                "programadas": 0,
                "horas": 0.0,
            }
        empresas_map[nombre]["total"] += 1
        if s.estado == "finalizado":
            empresas_map[nombre]["finalizadas"] += 1
            empresas_map[nombre]["horas"] += _calc_hours(s.hora_inicio, s.hora_fin)
        elif s.estado == "programado":
            empresas_map[nombre]["programadas"] += 1

    por_empresa = sorted(
        list(empresas_map.values()),
        key=lambda x: x["total"], reverse=True
    )
    for e in por_empresa:
        e["horas"] = round(e["horas"], 1)

    finalizadas_list = [s for s in solicitudes if s.estado == "finalizado"]
    horas_totales = sum(_calc_hours(s.hora_inicio, s.hora_fin) for s in finalizadas_list)

    return {
        "total": len(solicitudes),
        "por_estado": por_estado,
        "horas_totales": round(horas_totales, 1),
        "por_tipo_servicio": por_tipo,
        "por_empresa": por_empresa,
        "solicitudes": [
            {
                "id": s.id,
                "empresa": s.empresa,
                "fecha_evento": s.fecha_evento,
                "hora_inicio": s.hora_inicio,
                "hora_fin": s.hora_fin,
                "tipo_servicio": s.tipo_servicio,
                "ciudad": s.ciudad,
                "estado": s.estado,
                "observacion_final": s.observacion_final,
                "horas": _calc_hours(s.hora_inicio, s.hora_fin),
                "recreadores": [
                    {"id": r.id, "nombre": r.full_name or r.username}
                    for r in s.recreadores
                ],
            }
            for s in solicitudes
        ],
    }
