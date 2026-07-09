from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List

from app.core.database import get_db
from app.services.auth_service import get_current_user
from app.models.user import User
from app.models.hora_extra import HoraExtraManual
from app.schemas.hora_extra import (
    HoraExtraManualCreate,
    HoraExtraManualUpdate,
    HoraExtraManualResponse,
    HorasExtraRecreadorResponse,
    ResumenRecreadorAdmin,
)
from app.services.horas_extra_service import (
    get_horas_recreador,
    get_resumen_admin,
    listar_horas_extra_manuales,
    crear_hora_extra_manual,
    actualizar_hora_extra_manual,
    eliminar_hora_extra_manual,
    manual_to_dict,
)

router = APIRouter(prefix="/horas-extra", tags=["horas-extra"])


@router.get("/mias", response_model=HorasExtraRecreadorResponse)
def mis_horas_extra(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    recreador_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if recreador_id and recreador_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    if not current_user.is_recreador and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    rid = recreador_id or current_user.id
    return get_horas_recreador(db, rid, fecha_desde, fecha_hasta)


@router.get("/admin/resumen", response_model=List[ResumenRecreadorAdmin])
def resumen_admin(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    return get_resumen_admin(db, fecha_desde, fecha_hasta)


@router.get("/manuales", response_model=List[HoraExtraManualResponse])
def listar_manuales(
    recreador_id: Optional[int] = None,
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    registros = listar_horas_extra_manuales(db, recreador_id, fecha_desde, fecha_hasta)
    return [manual_to_dict(db, m) for m in registros]


@router.post("/manuales", response_model=HoraExtraManualResponse, status_code=status.HTTP_201_CREATED)
def crear_manual(
    data: HoraExtraManualCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    recreador = db.query(User).filter(User.id == data.recreador_id, User.is_recreador == True).first()  # noqa: E712
    if not recreador:
        raise HTTPException(status_code=404, detail="Recreador no encontrado")
    obj = crear_hora_extra_manual(db, data, creado_por_id=current_user.id)
    return manual_to_dict(db, obj)


@router.put("/manuales/{registro_id}", response_model=HoraExtraManualResponse)
def actualizar_manual(
    registro_id: int,
    data: HoraExtraManualUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    obj = db.query(HoraExtraManual).filter(HoraExtraManual.id == registro_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    obj = actualizar_hora_extra_manual(db, obj, data)
    return manual_to_dict(db, obj)


@router.delete("/manuales/{registro_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_manual(
    registro_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    obj = db.query(HoraExtraManual).filter(HoraExtraManual.id == registro_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    eliminar_hora_extra_manual(db, obj)
