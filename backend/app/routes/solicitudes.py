from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.schemas.solicitud import (
    SolicitudCreate,
    SolicitudResponse,
    SolicitudUpdate,
    FinalizarRequest,
    PaginaSolicitudes,
    ResumenSolicitudes,
    ValidacionAsignacion,
)
from app.services.auth_service import get_current_user
from app.services.solicitud_service import (
    create_solicitud,
    get_solicitudes,
    get_solicitudes_paginadas,
    get_resumen_solicitudes,
    get_solicitud_orm,
    solicitud_to_response,
    update_solicitud_estado,
    validar_asignacion,
    finalizar_solicitud,
    usuario_puede_ver_solicitud,
)
from app.models.user import User
from app.core.config import settings

router = APIRouter(prefix="/solicitudes", tags=["solicitudes"])

# Por defecto se ocultan las solicitudes administrativas (ruido de la migración
# del cronograma). Se puede invertir el criterio con EXCLUIR_ADMINISTRATIVAS_POR_DEFECTO=false
# o pedirlas explícitamente con ?incluir_administrativo=true.
ADMIN_POR_DEFECTO = not settings.EXCLUIR_ADMINISTRATIVAS_POR_DEFECTO


def _alcance(current_user: User):
    """Argumentos de alcance por rol para las consultas de listado."""
    if current_user.is_admin:
        return {}
    if current_user.is_recreador:
        return {"recreador_id": current_user.id}
    return {"user_id": current_user.id}


@router.post("/", response_model=SolicitudResponse, status_code=status.HTTP_201_CREATED)
def crear_solicitud(
    solicitud: SolicitudCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_solicitud(db, solicitud, current_user.id)


# ── Rutas estáticas ANTES de /{solicitud_id} para que FastAPI no intente
#    interpretarlas como un id numérico. ─────────────────────────────────────

@router.get("/paginadas", response_model=PaginaSolicitudes)
def listar_solicitudes_paginadas(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    estado: Optional[str] = None,
    q: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
    incluir_administrativo: bool = Query(ADMIN_POR_DEFECTO),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Listado paginado en servidor. Sustituye al listado completo para la vista
    de lista del admin: filtra, cuenta y ordena en la base de datos."""
    return get_solicitudes_paginadas(
        db,
        page=page,
        page_size=page_size,
        estado=estado,
        search=q,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        sort_dir=sort_dir,
        incluir_administrativo=incluir_administrativo,
        **_alcance(current_user),
    )


@router.get("/resumen", response_model=ResumenSolicitudes)
def resumen_solicitudes(
    incluir_administrativo: bool = Query(ADMIN_POR_DEFECTO),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Conteos por estado y finalizadas de la semana, calculados con GROUP BY."""
    return get_resumen_solicitudes(
        db, incluir_administrativo=incluir_administrativo, **_alcance(current_user)
    )


@router.get("/", response_model=List[SolicitudResponse])
def listar_solicitudes(
    estado: Optional[str] = None,
    q: Optional[str] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    sort_dir: str = Query("asc", pattern="^(asc|desc)$"),
    incluir_administrativo: bool = Query(ADMIN_POR_DEFECTO),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Listado completo con filtros opcionales. Se mantiene por compatibilidad
    (calendarios y validación de asignaciones lo usan con rango de fechas)."""
    return get_solicitudes(
        db,
        estado=estado,
        search=q,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        sort_dir=sort_dir,
        incluir_administrativo=incluir_administrativo,
        **_alcance(current_user),
    )


@router.get("/{solicitud_id}", response_model=SolicitudResponse)
def obtener_solicitud(
    solicitud_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sol = get_solicitud_orm(db, solicitud_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    # Comprueba también la asignación many-to-many (no solo el recreador primario).
    if not usuario_puede_ver_solicitud(sol, current_user):
        raise HTTPException(status_code=403, detail="No autorizado")
    return solicitud_to_response(sol, db)


@router.get("/{solicitud_id}/validacion", response_model=ValidacionAsignacion)
def validar_asignacion_solicitud(
    solicitud_id: int,
    recreador_ids: str = Query("", description="Ids de recreador separados por coma, ej: 3,7"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Horas semanales y conflictos de horario de los recreadores candidatos.

    Lo usa el modal de cambio de estado para avisar antes de programar, sin
    necesidad de descargar todas las solicitudes en el navegador."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")

    sol = get_solicitud_orm(db, solicitud_id)
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")

    ids = []
    for token in recreador_ids.split(","):
        token = token.strip()
        if not token:
            continue
        if not token.isdigit():
            raise HTTPException(status_code=400, detail=f"Id de recreador inválido: {token}")
        ids.append(int(token))

    return validar_asignacion(db, sol, ids)


@router.patch("/{solicitud_id}/finalizar", response_model=SolicitudResponse)
def finalizar(
    solicitud_id: int,
    data: FinalizarRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_recreador and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    try:
        result = finalizar_solicitud(
            db, solicitud_id,
            recreador_id=current_user.id,
            observacion=data.observacion or "",
            skip_auth=current_user.is_admin,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return result


@router.patch("/{solicitud_id}/estado", response_model=SolicitudResponse)
def cambiar_estado(
    solicitud_id: int,
    data: SolicitudUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    try:
        sol = update_solicitud_estado(
            db,
            solicitud_id,
            data.estado,
            data.recreador_ids,
            data.tipo_hora_extra,
            data.horas_extra,
            creado_por_id=current_user.id,
        )
    except ValueError as e:
        # Asignación inválida (sin recreadores, ids inexistentes o inactivos).
        raise HTTPException(status_code=400, detail=str(e))
    if not sol:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    return sol
