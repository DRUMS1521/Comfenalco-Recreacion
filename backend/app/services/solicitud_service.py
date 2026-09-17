from sqlalchemy.orm import Session
from sqlalchemy import or_, func as sqlfunc
from sqlalchemy.sql import func
from typing import Optional, List, Dict, Any, Tuple
from datetime import date, timedelta
from app.models.solicitud import Solicitud
from app.models.user import User
from app.models.hora_extra import HorasExtraClasificada
from app.schemas.solicitud import SolicitudCreate, SolicitudResponse, RecreadorInfo
from app.services.email_service import send_solicitud_email
from app.services.horas_utils import (
    LIMITE_HORAS_SEMANALES,
    calc_hours,
    rango_semana,
    turnos_se_solapan,
)

# Tamaño de página por defecto y máximo aceptado en el listado paginado.
PAGE_SIZE_DEFAULT = 10
PAGE_SIZE_MAX = 100


def _users_map(db: Session, solicitudes: List[Solicitud]) -> Dict[int, User]:
    """Carga en UNA consulta todos los usuarios referenciados por las solicitudes
    (creador + recreador primario). Antes se hacían 2 consultas por solicitud."""
    ids = {s.user_id for s in solicitudes}
    ids |= {s.recreador_id for s in solicitudes if s.recreador_id}
    if not ids:
        return {}
    return {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}


def _enrich(
    sol: Solicitud,
    users: Optional[Dict[int, User]] = None,
    db: Optional[Session] = None,
) -> SolicitudResponse:
    """Convierte Solicitud ORM a SolicitudResponse con info de usuarios.

    `users` es un mapa id→User precalculado (ruta rápida, sin N+1). Si no se
    entrega, se resuelve contra `db` para una única solicitud.
    """
    data = SolicitudResponse.model_validate(sol)
    if users is None:
        users = _users_map(db, [sol])

    creator = users.get(sol.user_id)
    if creator:
        data.user_username = creator.username
        data.user_full_name = creator.full_name
        data.user_empresa = creator.empresa
        data.user_email = creator.email

    # Recreador primario (backwards compat)
    if sol.recreador_id:
        recreador = users.get(sol.recreador_id)
        if recreador:
            data.recreador_username = recreador.username
            data.recreador_full_name = recreador.full_name

    # Todos los recreadores asignados (many-to-many)
    data.recreadores_asignados = [
        RecreadorInfo(id=r.id, username=r.username, full_name=r.full_name)
        for r in sol.recreadores
    ]

    return data


def _enrich_many(solicitudes: List[Solicitud], db: Session) -> List[SolicitudResponse]:
    users = _users_map(db, solicitudes)
    return [_enrich(s, users) for s in solicitudes]


def create_solicitud(db: Session, data: SolicitudCreate, user_id: int) -> SolicitudResponse:
    solicitud = Solicitud(**data.model_dump(), user_id=user_id)
    db.add(solicitud)
    db.commit()
    db.refresh(solicitud)
    try:
        send_solicitud_email(solicitud)
    except Exception as e:
        print(f"[EMAIL ERROR] No se pudo enviar el correo: {e}")
    return _enrich(solicitud, db=db)


def _scope_query(
    db: Session,
    user_id: Optional[int] = None,
    recreador_id: Optional[int] = None,
):
    """Aplica el alcance por rol: el recreador ve lo asignado (campo primario y
    M2M), la empresa/promotor ve lo que creó, el admin ve todo."""
    query = db.query(Solicitud)
    if recreador_id:
        query = query.filter(
            or_(
                Solicitud.recreador_id == recreador_id,
                Solicitud.recreadores.any(User.id == recreador_id),
            )
        )
    elif user_id:
        query = query.filter(Solicitud.user_id == user_id)
    return query


def excluir_administrativas(query, incluir_administrativo: bool = False):
    """Deja fuera las solicitudes clasificadas como administrativas.

    La migración del cronograma desde Excel insertó tareas internas (novedades
    de personal, exámenes médicos, bodega, papelería, programas internos) que hoy
    ensucian calendarios y estadísticas. Las filas sin clasificar (NULL) siguen
    visibles para no esconder datos por omisión.
    """
    if incluir_administrativo:
        return query
    return query.filter(
        or_(
            Solicitud.categoria_origen.is_(None),
            Solicitud.categoria_origen != "administrativo",
        )
    )


def _apply_filters(
    query,
    estado: Optional[str] = None,
    search: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    incluir_administrativo: bool = False,
):
    query = excluir_administrativas(query, incluir_administrativo)
    if estado:
        query = query.filter(Solicitud.estado == estado)
    if fecha_desde:
        query = query.filter(Solicitud.fecha_evento >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Solicitud.fecha_evento <= fecha_hasta)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Solicitud.empresa.ilike(like),
                Solicitud.ciudad.ilike(like),
                Solicitud.tipo_servicio.ilike(like),
                Solicitud.direccion.ilike(like),
                Solicitud.contacto.ilike(like),
            )
        )
    return query


def _ordenar(query, sort_dir: str = "asc"):
    if sort_dir == "desc":
        return query.order_by(Solicitud.fecha_evento.desc(), Solicitud.hora_inicio.desc())
    return query.order_by(Solicitud.fecha_evento.asc(), Solicitud.hora_inicio.asc())


def get_solicitudes(
    db: Session,
    user_id: Optional[int] = None,
    recreador_id: Optional[int] = None,
    estado: Optional[str] = None,
    search: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    sort_dir: str = "asc",
    incluir_administrativo: bool = False,
) -> List[SolicitudResponse]:
    query = _scope_query(db, user_id, recreador_id)
    query = _apply_filters(query, estado, search, fecha_desde, fecha_hasta, incluir_administrativo)
    solicitudes = _ordenar(query, sort_dir).all()
    return _enrich_many(solicitudes, db)


def get_solicitudes_paginadas(
    db: Session,
    page: int = 1,
    page_size: int = PAGE_SIZE_DEFAULT,
    user_id: Optional[int] = None,
    recreador_id: Optional[int] = None,
    estado: Optional[str] = None,
    search: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    sort_dir: str = "asc",
    incluir_administrativo: bool = False,
) -> Dict[str, Any]:
    """Listado paginado en servidor: filtra, ordena y cuenta en SQL y solo
    materializa la página pedida (evita transferir y resolver miles de filas)."""
    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), PAGE_SIZE_MAX)

    query = _scope_query(db, user_id, recreador_id)
    query = _apply_filters(query, estado, search, fecha_desde, fecha_hasta, incluir_administrativo)

    total = query.with_entities(sqlfunc.count(Solicitud.id)).scalar() or 0
    pages = max(1, -(-total // page_size))  # techo entero
    page = min(page, pages)

    solicitudes = (
        _ordenar(query, sort_dir)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": _enrich_many(solicitudes, db),
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


def _semana_actual() -> Tuple[str, str]:
    hoy = date.today()
    lunes = hoy - timedelta(days=hoy.weekday())
    return lunes.isoformat(), (lunes + timedelta(days=6)).isoformat()


def get_resumen_solicitudes(
    db: Session,
    user_id: Optional[int] = None,
    recreador_id: Optional[int] = None,
    incluir_administrativo: bool = False,
) -> Dict[str, Any]:
    """Conteos por estado para los contadores del dashboard, resueltos con
    GROUP BY en la base de datos (antes el frontend contaba sobre la lista completa)."""
    base = excluir_administrativas(_scope_query(db, user_id, recreador_id), incluir_administrativo)

    filas = (
        base.with_entities(Solicitud.estado, sqlfunc.count(Solicitud.id))
        .group_by(Solicitud.estado)
        .all()
    )
    por_estado = {estado or "sin_estado": total for estado, total in filas}

    desde, hasta = _semana_actual()
    finalizadas_semana = (
        base.filter(
            Solicitud.estado == "finalizado",
            Solicitud.fecha_evento >= desde,
            Solicitud.fecha_evento <= hasta,
        )
        .with_entities(sqlfunc.count(Solicitud.id))
        .scalar()
        or 0
    )

    administrativas = (
        _scope_query(db, user_id, recreador_id)
        .filter(Solicitud.categoria_origen == "administrativo")
        .with_entities(sqlfunc.count(Solicitud.id))
        .scalar()
        or 0
    )

    return {
        "total": sum(por_estado.values()),
        "por_estado": por_estado,
        "finalizadas_semana": finalizadas_semana,
        "semana_desde": desde,
        "semana_hasta": hasta,
        "administrativas": administrativas,
    }


def get_solicitud_orm(db: Session, solicitud_id: int) -> Optional[Solicitud]:
    """Devuelve la entidad ORM (para comprobar permisos antes de serializar)."""
    return db.query(Solicitud).filter(Solicitud.id == solicitud_id).first()


def solicitud_to_response(sol: Solicitud, db: Session) -> SolicitudResponse:
    """Serializa una entidad ORM ya cargada."""
    return _enrich(sol, db=db)


def get_solicitud_by_id(db: Session, solicitud_id: int) -> Optional[SolicitudResponse]:
    sol = get_solicitud_orm(db, solicitud_id)
    if not sol:
        return None
    return _enrich(sol, db=db)


def usuario_puede_ver_solicitud(sol: Solicitud, user: User) -> bool:
    """Un recreador puede ver la solicitud si está en la asignación M2M o es el
    recreador primario; el creador la ve; el admin ve todo. Antes solo se
    comprobaba `recreador_id` (primario), así que del 2.º recreador asignado en
    adelante recibía 403 al abrir el detalle."""
    if user.is_admin:
        return True
    if sol.user_id == user.id or sol.recreador_id == user.id:
        return True
    return any(r.id == user.id for r in sol.recreadores)


def finalizar_solicitud(
    db: Session,
    solicitud_id: int,
    recreador_id: int,
    observacion: str,
    skip_auth: bool = False,
) -> Optional[SolicitudResponse]:
    sol = db.query(Solicitud).filter(Solicitud.id == solicitud_id).first()
    if not sol:
        return None
    if not skip_auth:
        assigned_ids = {r.id for r in sol.recreadores} | ({sol.recreador_id} if sol.recreador_id else set())
        if recreador_id not in assigned_ids:
            raise PermissionError("No estás asignado a esta solicitud")
    if sol.fecha_evento > str(date.today()):
        raise ValueError("El evento aún no ha ocurrido")
    sol.estado = "finalizado"
    sol.observacion_final = observacion
    sol.fecha_finalizacion = func.now()
    db.commit()
    db.refresh(sol)
    return _enrich(sol, db=db)


def validar_asignacion(db: Session, sol: Solicitud, recreador_ids: List[int]) -> Dict[str, Any]:
    """Horas semanales ya asignadas y conflictos de horario de cada candidato.

    Es la fuente de verdad que antes vivía solo en el navegador
    (`EstadoModal.jsx`), donde el frontend necesitaba la lista COMPLETA de
    solicitudes para poder calcularla. Aquí se resuelve con una sola consulta
    acotada a la semana del evento.
    """
    ids = list(dict.fromkeys(recreador_ids or []))
    desde, hasta = rango_semana(sol.fecha_evento)
    horas_nuevas = calc_hours(sol.hora_inicio, sol.hora_fin)

    usuarios = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()} if ids else {}

    otras: List[Solicitud] = []
    if ids:
        otras = (
            db.query(Solicitud)
            .filter(
                Solicitud.estado == "programado",
                Solicitud.id != sol.id,
                Solicitud.fecha_evento >= desde,
                Solicitud.fecha_evento <= hasta,
                or_(
                    Solicitud.recreador_id.in_(ids),
                    Solicitud.recreadores.any(User.id.in_(ids)),
                ),
            )
            .all()
        )

    resultado = []
    for rid in ids:
        user = usuarios.get(rid)
        asignadas = [
            s for s in otras
            if s.recreador_id == rid or any(r.id == rid for r in s.recreadores)
        ]
        horas_semana = sum(calc_hours(s.hora_inicio, s.hora_fin) for s in asignadas)
        total = horas_semana + horas_nuevas
        conflictos = [
            {
                "solicitud_id": s.id,
                "empresa": s.empresa,
                "hora_inicio": s.hora_inicio,
                "hora_fin": s.hora_fin,
            }
            for s in asignadas
            if s.fecha_evento == sol.fecha_evento
            and turnos_se_solapan(sol.hora_inicio, sol.hora_fin, s.hora_inicio, s.hora_fin)
        ]
        resultado.append({
            "id": rid,
            "nombre": (user.full_name or user.username) if user else f"#{rid}",
            "horas_semana": round(horas_semana, 2),
            "horas_nuevas": round(horas_nuevas, 2),
            "total": round(total, 2),
            "excede_limite": total > LIMITE_HORAS_SEMANALES,
            # Cuántas horas sobran: es el valor por defecto que el modal pide
            # clasificar como extras diurnas, dominicales o festivas.
            "exceso_horas": round(max(0.0, total - LIMITE_HORAS_SEMANALES), 2),
            "conflictos": conflictos,
        })

    return {
        "solicitud_id": sol.id,
        "semana_desde": desde,
        "semana_hasta": hasta,
        "limite_horas": LIMITE_HORAS_SEMANALES,
        "recreadores": resultado,
        "hay_exceso": any(r["excede_limite"] for r in resultado),
        "hay_conflicto": any(r["conflictos"] for r in resultado),
    }


def update_solicitud_estado(
    db: Session,
    solicitud_id: int,
    estado: str,
    recreador_ids: Optional[List[int]] = None,
    tipo_hora_extra: Optional[str] = None,
    horas_extra: Optional[List] = None,
    creado_por_id: Optional[int] = None,
) -> Optional[SolicitudResponse]:
    sol = db.query(Solicitud).filter(Solicitud.id == solicitud_id).first()
    if not sol:
        return None

    sol.estado = estado

    if estado == "programado":
        # Validación estricta: antes se aceptaba cualquier id y la solicitud
        # quedaba "programada" con un recreador_id inexistente y la lista M2M
        # vacía, es decir, una tarea que nadie veía.
        ids_unicos = list(dict.fromkeys(recreador_ids or []))
        if not ids_unicos:
            raise ValueError("Debes asignar al menos un recreador para programar la solicitud")

        recreadores = (
            db.query(User)
            .filter(
                User.id.in_(ids_unicos),
                User.is_recreador == True,  # noqa: E712
                User.is_active == True,  # noqa: E712
            )
            .all()
        )
        por_id = {r.id: r for r in recreadores}
        invalidos = [i for i in ids_unicos if i not in por_id]
        if invalidos:
            raise ValueError(f"Recreador(es) inexistente(s) o inactivo(s): {invalidos}")

        # Primario = primer recreador de la lista, conservando el orden recibido
        sol.recreador_id = ids_unicos[0]
        sol.tipo_hora_extra = tipo_hora_extra
        sol.recreadores = [por_id[i] for i in ids_unicos]

        if horas_extra is not None:
            # Reemplaza la clasificación anterior de esta solicitud.
            sol.horas_extra_clasificadas = []
            db.flush()
            for item in horas_extra:
                if item.recreador_id not in por_id:
                    raise ValueError(
                        f"El recreador {item.recreador_id} no está en la asignación"
                    )
                sol.horas_extra_clasificadas.append(HorasExtraClasificada(
                    recreador_id=item.recreador_id,
                    tipo=item.tipo,
                    horas=round(float(item.horas), 2),
                    creado_por_id=creado_por_id or sol.user_id,
                ))
        else:
            # Sin clasificación nueva: se conserva la existente, pero se descarta
            # la de recreadores que ya no están asignados.
            sol.horas_extra_clasificadas = [
                h for h in sol.horas_extra_clasificadas if h.recreador_id in por_id
            ]
    elif estado not in ("programado", "finalizado"):
        sol.recreador_id = None
        sol.tipo_hora_extra = None
        sol.recreadores = []
        sol.horas_extra_clasificadas = []

    db.commit()
    db.refresh(sol)
    return _enrich(sol, db=db)
