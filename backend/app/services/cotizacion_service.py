"""Lógica de cotizaciones y catálogo de proveedores.

Reglas aplicadas:
* El precio unitario SIEMPRE sale del portafolio (no se acepta del cliente), con
  la salvedad de las líneas libres (domicilio, loza, transporte) que no existen
  en el catálogo y por eso sí llevan precio explícito.
* La presentación "empacado" usa `precio_empacado` cuando el portafolio la define.
* Los incrementos de refrigerios (empaque, bebida, jugo) se aplican solo si la
  línea los pide, y se guardan como monto unitario para que el histórico no cambie
  si el portafolio se actualiza.
* Los totales se recalculan en el servidor; nunca se confía en el navegador.
* Si la cantidad pedida es menor al mínimo de despacho, la línea se marca con un
  aviso (el portafolio indica que en ese caso el domicilio se cobra aparte).
"""
from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.cotizacion import (
    CategoriaCotizacion,
    Cotizacion,
    CotizacionItem,
    Producto,
    Proveedor,
)
from app.models.user import User

PAGE_SIZE_DEFAULT = 10
PAGE_SIZE_MAX = 100
ESTADOS_COTIZACION = ("borrador", "enviada", "aprobada", "rechazada", "anulada")


# ── Catálogo ─────────────────────────────────────────────────────────────────
def listar_proveedores(db: Session, solo_activos: bool = False) -> List[Dict[str, Any]]:
    q = db.query(Proveedor)
    if solo_activos:
        q = q.filter(Proveedor.activo == True)  # noqa: E712
    conteos = dict(
        db.query(Producto.proveedor_id, func.count(Producto.id))
        .group_by(Producto.proveedor_id)
        .all()
    )
    return [
        {
            "id": p.id, "nombre": p.nombre, "nit": p.nit, "contacto": p.contacto,
            "telefono": p.telefono, "email": p.email, "notas": p.notas,
            "activo": bool(p.activo), "productos": conteos.get(p.id, 0),
        }
        for p in q.order_by(Proveedor.nombre).all()
    ]


def catalogo_de(
    db: Session,
    proveedor_id: int,
    busqueda: Optional[str] = None,
    categoria_id: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    proveedor = db.query(Proveedor).filter(Proveedor.id == proveedor_id).first()
    if not proveedor:
        return None

    categorias = (
        db.query(CategoriaCotizacion)
        .filter(CategoriaCotizacion.proveedor_id == proveedor_id)
        .order_by(CategoriaCotizacion.orden, CategoriaCotizacion.nombre)
        .all()
    )

    termino = (busqueda or "").strip().lower()
    resultado = []
    for cat in categorias:
        if categoria_id and cat.id != categoria_id:
            continue
        productos = [p for p in cat.productos if p.activo]
        if termino:
            productos = [
                p for p in productos
                if termino in (p.nombre or "").lower()
                or termino in (p.descripcion or "").lower()
                or termino in (p.observaciones or "").lower()
            ]
        if categoria_id or not termino or productos:
            resultado.append({
                "id": cat.id, "proveedor_id": cat.proveedor_id, "nombre": cat.nombre,
                "notas": cat.notas, "orden": cat.orden or 0,
                "productos": [producto_to_dict(p) for p in productos],
            })

    return {
        "proveedor": {
            "id": proveedor.id, "nombre": proveedor.nombre, "nit": proveedor.nit,
            "contacto": proveedor.contacto, "telefono": proveedor.telefono,
            "email": proveedor.email, "notas": proveedor.notas,
            "activo": bool(proveedor.activo),
            "productos": sum(len(c["productos"]) for c in resultado),
        },
        "categorias": resultado,
    }


def producto_to_dict(p: Producto) -> Dict[str, Any]:
    return {
        "id": p.id, "proveedor_id": p.proveedor_id, "categoria_id": p.categoria_id,
        "nombre": p.nombre, "descripcion": p.descripcion, "observaciones": p.observaciones,
        "variables": p.variables, "precio": p.precio, "precio_empacado": p.precio_empacado,
        "tipo_montaje": p.tipo_montaje,
        "incremento_empaque": p.incremento_empaque,
        "incremento_bebida": p.incremento_bebida,
        "incremento_jugo": p.incremento_jugo,
        "cantidad_minima": p.cantidad_minima,
        "cantidad_maxima": p.cantidad_maxima,
        "activo": bool(p.activo), "orden": p.orden or 0,
    }


# ── Cotizaciones ─────────────────────────────────────────────────────────────
def _siguiente_numero(db: Session) -> str:
    anio = date.today().year
    prefijo = f"COT-{anio}-"
    ultimo = (
        db.query(func.max(Cotizacion.numero))
        .filter(Cotizacion.numero.like(f"{prefijo}%"))
        .scalar()
    )
    correlativo = 1
    if ultimo:
        try:
            correlativo = int(ultimo.split("-")[-1]) + 1
        except ValueError:
            correlativo = 1
    return f"{prefijo}{correlativo:04d}"


def _construir_item(
    db: Session,
    cotizacion: Cotizacion,
    data,
    orden: int,
    cache_productos: Dict[int, Producto],
) -> CotizacionItem:
    """Resuelve una línea a partir del portafolio o como línea libre."""
    if data.producto_id:
        producto = cache_productos.get(data.producto_id)
        if not producto:
            producto = db.query(Producto).filter(Producto.id == data.producto_id).first()
            if producto:
                cache_productos[producto.id] = producto
        if not producto:
            raise ValueError(f"El producto {data.producto_id} no existe en el portafolio")
        if producto.proveedor_id != cotizacion.proveedor_id:
            raise ValueError(
                f"El producto '{producto.nombre or producto.descripcion}' no pertenece al proveedor de la cotización"
            )

        presentacion = data.presentacion
        if presentacion == "empacado" and producto.precio_empacado:
            precio = producto.precio_empacado
        else:
            presentacion = presentacion or ("empacado" if producto.precio_empacado else "servido")
            precio = producto.precio

        descripcion = producto.nombre or producto.descripcion or f"Producto {producto.id}"
        categoria = producto.categoria.nombre if producto.categoria else None
        inc_empaque = (producto.incremento_empaque or 0) if data.inc_empaque else 0
        inc_bebida = (producto.incremento_bebida or 0) if data.inc_bebida else 0
        inc_jugo = (producto.incremento_jugo or 0) if data.inc_jugo else 0
    else:
        if not (data.descripcion or "").strip():
            raise ValueError("Una línea sin producto del portafolio necesita descripción")
        if data.precio_unitario is None or data.precio_unitario < 0:
            raise ValueError(f"La línea libre '{data.descripcion}' necesita un precio válido")
        producto = None
        presentacion = data.presentacion
        precio = float(data.precio_unitario)
        descripcion = data.descripcion.strip()
        categoria = "Otros"
        inc_empaque = inc_bebida = inc_jugo = 0

    unitario = precio + inc_empaque + inc_bebida + inc_jugo
    return CotizacionItem(
        producto_id=producto.id if producto else None,
        categoria=categoria,
        descripcion=descripcion,
        presentacion=presentacion,
        precio_unitario=round(float(precio), 2),
        cantidad=int(data.cantidad),
        inc_empaque=round(float(inc_empaque), 2),
        inc_bebida=round(float(inc_bebida), 2),
        inc_jugo=round(float(inc_jugo), 2),
        subtotal=round(unitario * int(data.cantidad), 2),
        notas=data.notas,
        orden=orden,
    )


def _recalcular(cotizacion: Cotizacion) -> None:
    cotizacion.subtotal = round(sum(i.subtotal or 0 for i in cotizacion.items), 2)
    cotizacion.total = cotizacion.subtotal


def _enrich(db: Session, cot: Cotizacion) -> Dict[str, Any]:
    """Añade nombres y el aviso de mínimo de despacho por línea."""
    ids = [i.producto_id for i in cot.items if i.producto_id]
    productos = {}
    if ids:
        productos = {
            p.id: p for p in db.query(Producto).filter(Producto.id.in_(ids)).all()
        }

    items = []
    for i in cot.items:
        prod = productos.get(i.producto_id) if i.producto_id else None
        aviso = None
        if prod and prod.cantidad_minima and i.cantidad < prod.cantidad_minima:
            aviso = (
                f"Mínimo de despacho {prod.cantidad_minima}; con menos unidades el "
                "domicilio se cobra aparte"
            )
        elif prod and prod.cantidad_maxima and i.cantidad > prod.cantidad_maxima:
            aviso = f"Máximo sugerido {prod.cantidad_maxima} unidades por despacho"

        items.append({
            "id": i.id, "producto_id": i.producto_id, "categoria": i.categoria,
            "descripcion": i.descripcion, "presentacion": i.presentacion,
            "precio_unitario": i.precio_unitario, "cantidad": i.cantidad,
            "inc_empaque": i.inc_empaque or 0, "inc_bebida": i.inc_bebida or 0,
            "inc_jugo": i.inc_jugo or 0, "subtotal": i.subtotal,
            "notas": i.notas, "aviso_minimo": aviso,
        })

    return {
        "id": cot.id, "numero": cot.numero, "proveedor_id": cot.proveedor_id,
        "proveedor_nombre": cot.proveedor.nombre if cot.proveedor else None,
        "cliente": cot.cliente, "nit_cliente": cot.nit_cliente, "contacto": cot.contacto,
        "telefono_email": cot.telefono_email, "ciudad": cot.ciudad, "direccion": cot.direccion,
        "fecha_evento": cot.fecha_evento, "hora": cot.hora,
        "cantidad_personas": cot.cantidad_personas, "estado": cot.estado,
        "observaciones": cot.observaciones, "condiciones": cot.condiciones,
        "subtotal": cot.subtotal, "total": cot.total,
        "creado_por_id": cot.creado_por_id,
        "creado_por_nombre": (cot.creado_por.full_name or cot.creado_por.username)
        if cot.creado_por else None,
        "items": items,
        "created_at": cot.created_at, "updated_at": cot.updated_at,
    }


def crear_cotizacion(db: Session, data, user_id: int) -> Dict[str, Any]:
    proveedor = db.query(Proveedor).filter(Proveedor.id == data.proveedor_id).first()
    if not proveedor:
        raise ValueError("El proveedor indicado no existe")

    cot = Cotizacion(
        numero=_siguiente_numero(db),
        proveedor_id=data.proveedor_id,
        cliente=data.cliente,
        nit_cliente=data.nit_cliente,
        contacto=data.contacto,
        telefono_email=data.telefono_email,
        ciudad=data.ciudad,
        direccion=data.direccion,
        fecha_evento=data.fecha_evento,
        hora=data.hora,
        cantidad_personas=data.cantidad_personas,
        observaciones=data.observaciones,
        condiciones=data.condiciones,
        estado="borrador",
        creado_por_id=user_id,
    )

    cache: Dict[int, Producto] = {}
    cot.items = [
        _construir_item(db, cot, item, orden, cache)
        for orden, item in enumerate(data.items or [])
    ]
    _recalcular(cot)

    db.add(cot)
    try:
        db.commit()
    except IntegrityError:
        # Colisión de numeración: se reintenta una vez con el siguiente correlativo
        db.rollback()
        cache.clear()
        cot = Cotizacion(**{
            **{c.name: getattr(cot, c.name) for c in Cotizacion.__table__.columns
               if c.name not in ("id", "numero", "created_at", "updated_at")},
            "numero": _siguiente_numero(db),
        })
        cot.items = [
            _construir_item(db, cot, item, orden, cache)
            for orden, item in enumerate(data.items or [])
        ]
        _recalcular(cot)
        db.add(cot)
        db.commit()

    db.refresh(cot)
    return _enrich(db, cot)


def obtener_cotizacion(db: Session, cotizacion_id: int) -> Optional[Cotizacion]:
    return db.query(Cotizacion).filter(Cotizacion.id == cotizacion_id).first()


def actualizar_cotizacion(db: Session, cot: Cotizacion, data) -> Dict[str, Any]:
    campos = data.model_dump(exclude_unset=True, exclude={"items"})
    for campo, valor in campos.items():
        setattr(cot, campo, valor)

    if cot.proveedor_id and not db.query(Proveedor).filter(Proveedor.id == cot.proveedor_id).first():
        raise ValueError("El proveedor indicado no existe")

    if data.items is not None:
        cache: Dict[int, Producto] = {}
        cot.items = [
            _construir_item(db, cot, item, orden, cache)
            for orden, item in enumerate(data.items)
        ]
    _recalcular(cot)
    db.commit()
    db.refresh(cot)
    return _enrich(db, cot)


def cambiar_estado(db: Session, cot: Cotizacion, estado: str) -> Dict[str, Any]:
    cot.estado = estado
    db.commit()
    db.refresh(cot)
    return _enrich(db, cot)


def eliminar_cotizacion(db: Session, cot: Cotizacion) -> None:
    db.delete(cot)
    db.commit()


def _scope(db: Session, user: User):
    q = db.query(Cotizacion)
    # El rol de cotizaciones y los administradores ven todas; un promotor, las suyas.
    if user.is_admin or getattr(user, "is_cotizador", False):
        return q
    return q.filter(Cotizacion.creado_por_id == user.id)


def listar_cotizaciones(
    db: Session,
    user: User,
    estado: Optional[str] = None,
    busqueda: Optional[str] = None,
    page: int = 1,
    page_size: int = PAGE_SIZE_DEFAULT,
) -> Dict[str, Any]:
    q = _scope(db, user)
    if estado:
        q = q.filter(Cotizacion.estado == estado)
    if busqueda and busqueda.strip():
        like = f"%{busqueda.strip()}%"
        q = q.filter(or_(
            Cotizacion.cliente.ilike(like),
            Cotizacion.numero.ilike(like),
            Cotizacion.contacto.ilike(like),
            Cotizacion.ciudad.ilike(like),
        ))

    page = max(1, int(page))
    page_size = min(max(1, int(page_size)), PAGE_SIZE_MAX)
    total = q.with_entities(func.count(Cotizacion.id)).scalar() or 0
    pages = max(1, -(-total // page_size))
    page = min(page, pages)

    filas = (
        q.order_by(Cotizacion.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [_enrich(db, c) for c in filas],
        "total": total, "page": page, "page_size": page_size, "pages": pages,
    }


def resumen_cotizaciones(db: Session, user: User) -> Dict[str, Any]:
    q = _scope(db, user)
    filas = q.with_entities(Cotizacion.estado, func.count(Cotizacion.id)).group_by(Cotizacion.estado).all()
    por_estado = {estado or "sin_estado": n for estado, n in filas}
    valor = (
        q.filter(Cotizacion.estado != "anulada").with_entities(func.sum(Cotizacion.total)).scalar() or 0
    )
    return {
        "total": sum(por_estado.values()),
        "por_estado": por_estado,
        "valor_total": round(float(valor), 2),
    }
