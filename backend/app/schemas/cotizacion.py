from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, validator

ESTADOS_COTIZACION = ["borrador", "enviada", "aprobada", "rechazada", "anulada"]


# ── Proveedores ──────────────────────────────────────────────────────────────
class ProveedorCreate(BaseModel):
    nombre: str
    nit: Optional[str] = None
    contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None


class ProveedorUpdate(BaseModel):
    nombre: Optional[str] = None
    nit: Optional[str] = None
    contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None
    activo: Optional[bool] = None


class ProveedorResponse(BaseModel):
    id: int
    nombre: str
    nit: Optional[str] = None
    contacto: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    notas: Optional[str] = None
    activo: bool = True
    productos: int = 0

    class Config:
        from_attributes = True


# ── Catálogo ─────────────────────────────────────────────────────────────────
class CategoriaCreate(BaseModel):
    proveedor_id: int
    nombre: str
    notas: Optional[str] = None
    orden: Optional[int] = 0


class CategoriaUpdate(BaseModel):
    nombre: Optional[str] = None
    notas: Optional[str] = None
    orden: Optional[int] = None


class ProductoCreate(BaseModel):
    proveedor_id: int
    categoria_id: Optional[int] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    observaciones: Optional[str] = None
    variables: Optional[str] = None
    precio: float
    precio_empacado: Optional[float] = None
    tipo_montaje: Optional[str] = None
    incremento_empaque: Optional[float] = None
    incremento_bebida: Optional[float] = None
    incremento_jugo: Optional[float] = None
    cantidad_minima: Optional[int] = None
    cantidad_maxima: Optional[int] = None
    activo: Optional[bool] = True
    orden: Optional[int] = 0

    @validator("precio")
    def precio_no_negativo(cls, v):
        if v is None or v < 0:
            raise ValueError("El precio no puede ser negativo")
        return v


class ProductoUpdate(BaseModel):
    categoria_id: Optional[int] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    observaciones: Optional[str] = None
    variables: Optional[str] = None
    precio: Optional[float] = None
    precio_empacado: Optional[float] = None
    tipo_montaje: Optional[str] = None
    incremento_empaque: Optional[float] = None
    incremento_bebida: Optional[float] = None
    incremento_jugo: Optional[float] = None
    cantidad_minima: Optional[int] = None
    cantidad_maxima: Optional[int] = None
    activo: Optional[bool] = None
    orden: Optional[int] = None


class ProductoResponse(BaseModel):
    id: int
    proveedor_id: int
    categoria_id: Optional[int] = None
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    observaciones: Optional[str] = None
    variables: Optional[str] = None
    precio: float
    precio_empacado: Optional[float] = None
    tipo_montaje: Optional[str] = None
    incremento_empaque: Optional[float] = None
    incremento_bebida: Optional[float] = None
    incremento_jugo: Optional[float] = None
    cantidad_minima: Optional[int] = None
    cantidad_maxima: Optional[int] = None
    activo: bool = True
    orden: int = 0

    class Config:
        from_attributes = True


class CategoriaResponse(BaseModel):
    id: int
    proveedor_id: int
    nombre: str
    notas: Optional[str] = None
    orden: int = 0
    productos: List[ProductoResponse] = []

    class Config:
        from_attributes = True


class CatalogoResponse(BaseModel):
    """Catálogo de un proveedor agrupado por categorías."""
    proveedor: ProveedorResponse
    categorias: List[CategoriaResponse] = []


# ── Cotizaciones ─────────────────────────────────────────────────────────────
class CotizacionItemIn(BaseModel):
    """Línea de la cotización.

    Si viene `producto_id`, el precio y la descripción se toman del portafolio
    (los precios son fijos y no se aceptan desde el cliente). Sin `producto_id` se
    admite una línea libre (domicilio, loza, transporte), que sí exige precio.
    """
    producto_id: Optional[int] = None
    descripcion: Optional[str] = None
    presentacion: Optional[str] = None      # 'servido' | 'empacado'
    precio_unitario: Optional[float] = None  # solo para líneas libres
    cantidad: int = 1
    inc_empaque: bool = False
    inc_bebida: bool = False
    inc_jugo: bool = False
    notas: Optional[str] = None

    @validator("presentacion")
    def presentacion_valida(cls, v):
        if v not in (None, "", "servido", "empacado"):
            raise ValueError("Presentación inválida. Opciones: servido, empacado")
        return v or None

    @validator("cantidad")
    def cantidad_positiva(cls, v):
        if v is None or v <= 0:
            raise ValueError("La cantidad debe ser mayor a 0")
        return v


class CotizacionItemResponse(BaseModel):
    id: int
    producto_id: Optional[int] = None
    categoria: Optional[str] = None
    descripcion: str
    presentacion: Optional[str] = None
    precio_unitario: float
    cantidad: int
    inc_empaque: float = 0
    inc_bebida: float = 0
    inc_jugo: float = 0
    subtotal: float = 0
    notas: Optional[str] = None
    # Aviso de negocio: el portafolio pide un mínimo de despacho
    aviso_minimo: Optional[str] = None

    class Config:
        from_attributes = True


class CotizacionCreate(BaseModel):
    proveedor_id: int
    cliente: str
    nit_cliente: Optional[str] = None
    contacto: Optional[str] = None
    telefono_email: Optional[str] = None
    ciudad: Optional[str] = None
    direccion: Optional[str] = None
    fecha_evento: Optional[str] = None
    hora: Optional[str] = None
    cantidad_personas: Optional[int] = None
    observaciones: Optional[str] = None
    condiciones: Optional[str] = None
    items: List[CotizacionItemIn] = []


class CotizacionUpdate(BaseModel):
    proveedor_id: Optional[int] = None
    cliente: Optional[str] = None
    nit_cliente: Optional[str] = None
    contacto: Optional[str] = None
    telefono_email: Optional[str] = None
    ciudad: Optional[str] = None
    direccion: Optional[str] = None
    fecha_evento: Optional[str] = None
    hora: Optional[str] = None
    cantidad_personas: Optional[int] = None
    observaciones: Optional[str] = None
    condiciones: Optional[str] = None
    items: Optional[List[CotizacionItemIn]] = None


class CotizacionEstadoUpdate(BaseModel):
    estado: str

    @validator("estado")
    def estado_valido(cls, v):
        if v not in ESTADOS_COTIZACION:
            raise ValueError(f"Estado inválido. Opciones: {ESTADOS_COTIZACION}")
        return v


class CotizacionResponse(BaseModel):
    id: int
    numero: str
    proveedor_id: int
    proveedor_nombre: Optional[str] = None
    cliente: str
    nit_cliente: Optional[str] = None
    contacto: Optional[str] = None
    telefono_email: Optional[str] = None
    ciudad: Optional[str] = None
    direccion: Optional[str] = None
    fecha_evento: Optional[str] = None
    hora: Optional[str] = None
    cantidad_personas: Optional[int] = None
    estado: str
    observaciones: Optional[str] = None
    condiciones: Optional[str] = None
    subtotal: float = 0
    total: float = 0
    creado_por_id: int
    creado_por_nombre: Optional[str] = None
    items: List[CotizacionItemResponse] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PaginaCotizaciones(BaseModel):
    items: List[CotizacionResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ResumenCotizaciones(BaseModel):
    total: int
    por_estado: dict
    valor_total: float = 0
