"""Rutas de cotizaciones y de catálogo de proveedores.

Permisos:
* Cotizar: administradores, promotores/gestores comerciales y el rol dedicado
  "persona de cotizaciones" (`is_cotizador`).
* Mantener el catálogo (proveedores, categorías, productos): administradores y el
  rol de cotizaciones. Un promotor solo lo consulta.
* Alcance de lectura: administradores y cotizaciones ven todas las cotizaciones;
  un promotor ve únicamente las suyas.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.cotizacion import CategoriaCotizacion, Producto, Proveedor
from app.models.user import User
from app.schemas.cotizacion import (
    CategoriaCreate,
    CategoriaResponse,
    CategoriaUpdate,
    CatalogoResponse,
    CotizacionCreate,
    CotizacionEstadoUpdate,
    CotizacionResponse,
    CotizacionUpdate,
    PaginaCotizaciones,
    ProductoCreate,
    ProductoResponse,
    ProductoUpdate,
    ProveedorCreate,
    ProveedorResponse,
    ProveedorUpdate,
    ResumenCotizaciones,
)
from app.services.auth_service import get_current_user
from app.services import cotizacion_service as svc

router = APIRouter(prefix="/cotizaciones", tags=["cotizaciones"])
catalogo_router = APIRouter(prefix="/catalogo", tags=["catalogo"])


# ── Permisos ─────────────────────────────────────────────────────────────────
def puede_cotizar(current_user: User = Depends(get_current_user)) -> User:
    if not (current_user.is_admin or current_user.is_promotor or current_user.is_cotizador):
        raise HTTPException(status_code=403, detail="No autorizado para cotizaciones")
    return current_user


def puede_editar_catalogo(current_user: User = Depends(get_current_user)) -> User:
    if not (current_user.is_admin or current_user.is_cotizador):
        raise HTTPException(
            status_code=403,
            detail="Solo administración o la persona de cotizaciones puede modificar el catálogo",
        )
    return current_user


# ═══════════════════════════ CATÁLOGO ═══════════════════════════════════════
@catalogo_router.get("/proveedores", response_model=List[ProveedorResponse])
def listar_proveedores(
    solo_activos: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(puede_cotizar),
):
    return svc.listar_proveedores(db, solo_activos)


@catalogo_router.post("/proveedores", response_model=ProveedorResponse, status_code=status.HTTP_201_CREATED)
def crear_proveedor(
    data: ProveedorCreate,
    db: Session = Depends(get_db),
    _: User = Depends(puede_editar_catalogo),
):
    existente = db.query(Proveedor).filter(Proveedor.nombre == data.nombre).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe un proveedor con ese nombre")
    obj = Proveedor(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return {
        "id": obj.id, "nombre": obj.nombre, "nit": obj.nit, "contacto": obj.contacto,
        "telefono": obj.telefono, "email": obj.email, "notas": obj.notas,
        "activo": bool(obj.activo), "productos": 0,
    }


@catalogo_router.patch("/proveedores/{proveedor_id}", response_model=ProveedorResponse)
def actualizar_proveedor(
    proveedor_id: int,
    data: ProveedorUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(puede_editar_catalogo),
):
    obj = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(obj, campo, valor)
    db.commit()
    db.refresh(obj)
    return {
        "id": obj.id, "nombre": obj.nombre, "nit": obj.nit, "contacto": obj.contacto,
        "telefono": obj.telefono, "email": obj.email, "notas": obj.notas,
        "activo": bool(obj.activo),
        "productos": db.query(Producto).filter(Producto.proveedor_id == obj.id).count(),
    }


@catalogo_router.get("/proveedores/{proveedor_id}", response_model=CatalogoResponse)
def catalogo_del_proveedor(
    proveedor_id: int,
    q: Optional[str] = None,
    categoria_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(puede_cotizar),
):
    data = svc.catalogo_de(db, proveedor_id, q, categoria_id)
    if not data:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    return data


@catalogo_router.post("/categorias", response_model=CategoriaResponse, status_code=status.HTTP_201_CREATED)
def crear_categoria(
    data: CategoriaCreate,
    db: Session = Depends(get_db),
    _: User = Depends(puede_editar_catalogo),
):
    if not db.query(Proveedor).filter(Proveedor.id == data.proveedor_id).first():
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    obj = CategoriaCotizacion(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@catalogo_router.patch("/categorias/{categoria_id}", response_model=CategoriaResponse)
def actualizar_categoria(
    categoria_id: int,
    data: CategoriaUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(puede_editar_catalogo),
):
    obj = db.query(CategoriaCotizacion).filter(CategoriaCotizacion.id == categoria_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(obj, campo, valor)
    db.commit()
    db.refresh(obj)
    return obj


@catalogo_router.delete("/categorias/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_categoria(
    categoria_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(puede_editar_catalogo),
):
    obj = db.query(CategoriaCotizacion).filter(CategoriaCotizacion.id == categoria_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    db.delete(obj)
    db.commit()


@catalogo_router.post("/productos", response_model=ProductoResponse, status_code=status.HTTP_201_CREATED)
def crear_producto(
    data: ProductoCreate,
    db: Session = Depends(get_db),
    _: User = Depends(puede_editar_catalogo),
):
    if not db.query(Proveedor).filter(Proveedor.id == data.proveedor_id).first():
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    if data.categoria_id and not db.query(CategoriaCotizacion).filter(
        CategoriaCotizacion.id == data.categoria_id
    ).first():
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    obj = Producto(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@catalogo_router.patch("/productos/{producto_id}", response_model=ProductoResponse)
def actualizar_producto(
    producto_id: int,
    data: ProductoUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(puede_editar_catalogo),
):
    obj = db.query(Producto).filter(Producto.id == producto_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(obj, campo, valor)
    db.commit()
    db.refresh(obj)
    return obj


@catalogo_router.delete("/productos/{producto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_producto(
    producto_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(puede_editar_catalogo),
):
    obj = db.query(Producto).filter(Producto.id == producto_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    db.delete(obj)
    db.commit()


# ═══════════════════════════ COTIZACIONES ═══════════════════════════════════
@router.get("/resumen", response_model=ResumenCotizaciones)
def resumen(
    db: Session = Depends(get_db),
    current_user: User = Depends(puede_cotizar),
):
    return svc.resumen_cotizaciones(db, current_user)


@router.get("/", response_model=PaginaCotizaciones)
def listar(
    estado: Optional[str] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(puede_cotizar),
):
    return svc.listar_cotizaciones(db, current_user, estado, q, page, page_size)


@router.post("/", response_model=CotizacionResponse, status_code=status.HTTP_201_CREATED)
def crear(
    data: CotizacionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(puede_cotizar),
):
    try:
        return svc.crear_cotizacion(db, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{cotizacion_id}", response_model=CotizacionResponse)
def obtener(
    cotizacion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(puede_cotizar),
):
    cot = svc.obtener_cotizacion(db, cotizacion_id)
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    if not (current_user.is_admin or current_user.is_cotizador) and cot.creado_por_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    return svc._enrich(db, cot)


@router.patch("/{cotizacion_id}", response_model=CotizacionResponse)
def actualizar(
    cotizacion_id: int,
    data: CotizacionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(puede_cotizar),
):
    cot = svc.obtener_cotizacion(db, cotizacion_id)
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    if not (current_user.is_admin or current_user.is_cotizador) and cot.creado_por_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    try:
        return svc.actualizar_cotizacion(db, cot, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{cotizacion_id}/estado", response_model=CotizacionResponse)
def cambiar_estado(
    cotizacion_id: int,
    data: CotizacionEstadoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(puede_cotizar),
):
    cot = svc.obtener_cotizacion(db, cotizacion_id)
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    if not (current_user.is_admin or current_user.is_cotizador) and cot.creado_por_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    return svc.cambiar_estado(db, cot, data.estado)


@router.delete("/{cotizacion_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(
    cotizacion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(puede_cotizar),
):
    cot = svc.obtener_cotizacion(db, cotizacion_id)
    if not cot:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    if not (current_user.is_admin or current_user.is_cotizador) and cot.creado_por_id != current_user.id:
        raise HTTPException(status_code=403, detail="No autorizado")
    if cot.estado not in ("borrador", "anulada") and not (current_user.is_admin or current_user.is_cotizador):
        raise HTTPException(status_code=400, detail="Solo se pueden eliminar cotizaciones en borrador")
    svc.eliminar_cotizacion(db, cot)
