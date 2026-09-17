"""Cotizaciones de proveedores (alimentos y servicios).

Estructura: un PROVEEDOR tiene un CATÁLOGO (categorías + productos) y emite
COTIZACIONES con líneas (items). Las cotizaciones son documentos independientes
(no se ligan a una solicitud de recreación) con sus propios datos de cliente.

Los precios del portafolio son fijos: la cotización NO permite editarlos, solo
cantidades y la presentación (servido / empacado). Cada línea guarda una COPIA
del precio y la descripción del momento, para que un cambio futuro del portafolio
no altere una cotización ya emitida.
"""
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    false,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Proveedor(Base):
    __tablename__ = "proveedores"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False, index=True)
    nit = Column(String, nullable=True)
    contacto = Column(String, nullable=True)
    telefono = Column(String, nullable=True)
    email = Column(String, nullable=True)
    notas = Column(Text, nullable=True)
    activo = Column(Boolean, default=True, server_default=false())
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    categorias = relationship(
        "CategoriaCotizacion",
        back_populates="proveedor",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="CategoriaCotizacion.orden",
    )


class CategoriaCotizacion(Base):
    """Agrupación del portafolio: sede (CAIKE, CRU, TOMOGO) o familia de producto
    (CENAS ESPECIALES, REFRIGERIOS PREMIUM...). Se pueden crear más desde la app."""
    __tablename__ = "categorias_cotizacion"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=False, index=True)
    nombre = Column(String, nullable=False)
    notas = Column(Text, nullable=True)
    orden = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    proveedor = relationship("Proveedor", back_populates="categorias")
    productos = relationship(
        "Producto",
        back_populates="categoria",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Producto.orden",
    )


class Producto(Base):
    """Ítem del portafolio de un proveedor."""
    __tablename__ = "productos_cotizacion"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=False, index=True)
    categoria_id = Column(Integer, ForeignKey("categorias_cotizacion.id", ondelete="CASCADE"), nullable=True, index=True)

    nombre = Column(String, nullable=True)          # producto / opción
    descripcion = Column(Text, nullable=True)       # detalle de qué incluye
    observaciones = Column(Text, nullable=True)     # disponibilidad, condiciones
    variables = Column(Text, nullable=True)         # qué hace variar el precio

    # Precio fijo del portafolio. `precio_empacado` es la presentación para llevar
    # (biodegradable); si es NULL el producto solo tiene una presentación.
    precio = Column(Float, nullable=False)
    precio_empacado = Column(Float, nullable=True)

    tipo_montaje = Column(String, nullable=True)    # EMPACADO EN BOLSA / VASO DOMO...
    # Incrementos por unidad que el portafolio cobra aparte (refrigerios)
    incremento_empaque = Column(Float, nullable=True)
    incremento_bebida = Column(Float, nullable=True)
    incremento_jugo = Column(Float, nullable=True)

    cantidad_minima = Column(Integer, nullable=True)  # mínimo de despacho
    cantidad_maxima = Column(Integer, nullable=True)  # NULL / 0 = no tiene

    activo = Column(Boolean, default=True, server_default=false())
    orden = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    categoria = relationship("CategoriaCotizacion", back_populates="productos")


class Cotizacion(Base):
    __tablename__ = "cotizaciones"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String, unique=True, index=True)   # COT-2026-0001
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=False, index=True)

    # Datos del cliente (independientes de `solicitudes`)
    cliente = Column(String, nullable=False)
    nit_cliente = Column(String, nullable=True)
    contacto = Column(String, nullable=True)
    telefono_email = Column(String, nullable=True)
    ciudad = Column(String, nullable=True)
    direccion = Column(String, nullable=True)

    fecha_evento = Column(String, nullable=True)      # "YYYY-MM-DD"
    hora = Column(String, nullable=True)              # "HH:MM"
    cantidad_personas = Column(Integer, nullable=True)

    estado = Column(String, default="borrador")       # borrador|enviada|aprobada|rechazada|anulada
    observaciones = Column(Text, nullable=True)
    condiciones = Column(Text, nullable=True)

    # Totales calculados siempre en el servidor
    subtotal = Column(Float, default=0)
    total = Column(Float, default=0)

    creado_por_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    proveedor = relationship("Proveedor", lazy="selectin")
    creado_por = relationship("User", foreign_keys=[creado_por_id], lazy="selectin")
    items = relationship(
        "CotizacionItem",
        back_populates="cotizacion",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="CotizacionItem.orden",
    )


class CotizacionItem(Base):
    """Línea de la cotización: copia del producto en el momento de cotizar."""
    __tablename__ = "cotizacion_items"

    id = Column(Integer, primary_key=True, index=True)
    cotizacion_id = Column(Integer, ForeignKey("cotizaciones.id", ondelete="CASCADE"), nullable=False, index=True)
    producto_id = Column(Integer, ForeignKey("productos_cotizacion.id"), nullable=True)

    categoria = Column(String, nullable=True)        # snapshot de la categoría
    descripcion = Column(String, nullable=False)      # snapshot del producto
    presentacion = Column(String, nullable=True)      # 'servido' | 'empacado'

    precio_unitario = Column(Float, nullable=False)   # snapshot del precio del portafolio
    cantidad = Column(Integer, nullable=False, default=1)

    # Incrementos aplicados por unidad (0 cuando no aplican)
    inc_empaque = Column(Float, default=0)
    inc_bebida = Column(Float, default=0)
    inc_jugo = Column(Float, default=0)

    subtotal = Column(Float, default=0)
    notas = Column(String, nullable=True)
    orden = Column(Integer, default=0)

    cotizacion = relationship("Cotizacion", back_populates="items")
