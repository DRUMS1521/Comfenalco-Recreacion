"""Importa el portafolio 2026 del proveedor EVALB (alimentos, Comfenalco Tolima).

El Excel trae 8 hojas con estructuras DISTINTAS, así que cada una se lee con sus
propias posiciones:

  CAIKE / CRU ....... PRODUCTO · DESCRIPCIÓN · OBSERVACIONES · precio · precio empacado
  TOMOGO ............ PRODUCTO · DESCRIPCIÓN · OBSERVACIONES · precio
  CENAS / DESAYUNOS ESPECIALES ... dos pares (DESCRIPCIÓN · VALOR) por fila
  CENAS NAVIDEÑAS ... OPCIÓN · DESCRIPCIÓN · PRECIO · OBSERVACIONES · VARIABLES
  REFRIGERIOS ESTÁNDAR ... DESCRIPCIÓN · TARIFA · MONTAJE · inc. empaque · inc. bebida · mín · máx · inc. jugo
  REFRIGERIOS PREMIUM .... DESCRIPCIÓN · MONTAJE · TARIFA · mín · máx · inc. empaque

Cada hoja se guarda como CATEGORÍA y cada fila como PRODUCTO. La nota de las hojas
de refrigerios (mínimos de despacho y cobro de domicilio) se conserva en la
categoría, y los mínimos/máximos en cada producto.

Uso:
    python importar_portafolio_evalb.py                 # simulación
    python importar_portafolio_evalb.py --aplicar       # escribe (respalda la BD)
    python importar_portafolio_evalb.py --aplicar --reemplazar   # borra el catálogo previo
"""
import argparse
import os
import shutil
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import openpyxl  # noqa: E402

from app.core.database import SessionLocal, engine  # noqa: E402
from app.models.cotizacion import CategoriaCotizacion, Producto, Proveedor  # noqa: E402
from app.models.user import User  # noqa: E402,F401  (registra el mapper que usa Cotizacion)

RUTA_POR_DEFECTO = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "data", "portafolio_evalb_2026.xlsx")
PROVEEDOR = "EVALB"
NOTA_ALIMENTOS = "Departamento de alimentos de Comfenalco Tolima"


# ── utilidades de lectura ────────────────────────────────────────────────────
def _texto(valor):
    if valor is None:
        return None
    if isinstance(valor, str):
        limpio = " ".join(valor.split())
        return limpio or None
    return str(valor)


def _nombre_corto(texto, limite=70):
    """Para las hojas que no traen nombre de producto, se usa la descripción."""
    t = _texto(texto) or ""
    return t if len(t) <= limite else t[:limite].rstrip() + "…"


def _numero(valor):
    if valor is None or isinstance(valor, str):
        if isinstance(valor, str):
            v = valor.strip().replace("$", "").replace(".", "").replace(",", ".")
            try:
                return float(v)
            except ValueError:
                return None
        return None
    try:
        n = float(valor)
    except (TypeError, ValueError):
        return None
    return None if n == -1 else n


def _entero(valor):
    n = _numero(valor)
    if n is None:
        return None
    entero = int(round(n))
    return entero if entero > 0 else None


def _celda(ws, fila, columna):
    return ws.cell(row=fila, column=columna).value


# ── lectores por hoja ────────────────────────────────────────────────────────
def _leer_restaurante(ws, fila_inicio, con_empacado=True):
    """CAIKE, CRU y TOMOGO: nombre en B, descripción en C, observaciones en D,
    precio en E y (si aplica) precio empacado en F."""
    productos = []
    for fila in range(fila_inicio, ws.max_row + 1):
        nombre = _texto(_celda(ws, fila, 2))
        descripcion = _texto(_celda(ws, fila, 3))
        precio = _numero(_celda(ws, fila, 5))
        if not nombre and not descripcion:
            continue
        if precio is None:
            continue
        productos.append({
            "nombre": nombre or _nombre_corto(descripcion),
            "descripcion": descripcion,
            "observaciones": _texto(_celda(ws, fila, 4)),
            "precio": precio,
            "precio_empacado": _numero(_celda(ws, fila, 6)) if con_empacado else None,
        })
    return productos


def _leer_pares(ws, fila_inicio, pares):
    """CENAS ESPECIALES y DESAYUNOS ESPECIALES: dos pares (descripción, valor)."""
    productos = []
    for fila in range(fila_inicio, ws.max_row + 1):
        for col_desc, col_valor in pares:
            descripcion = _texto(_celda(ws, fila, col_desc))
            precio = _numero(_celda(ws, fila, col_valor))
            if not descripcion or precio is None:
                continue
            productos.append({
                "nombre": _nombre_corto(descripcion),
                "descripcion": descripcion,
                "precio": precio,
            })
    return productos


def _leer_cenas_navidenas(ws, fila_inicio):
    productos = []
    for fila in range(fila_inicio, ws.max_row + 1):
        descripcion = _texto(_celda(ws, fila, 3))
        precio = _numero(_celda(ws, fila, 4))
        if not descripcion or precio is None:
            continue
        opcion = _texto(_celda(ws, fila, 2))
        productos.append({
            "nombre": _nombre_corto(descripcion),
            "descripcion": descripcion,
            "precio": precio,
            "observaciones": _texto(_celda(ws, fila, 5)),
            "variables": _texto(_celda(ws, fila, 6)),
            "opcion": opcion,
        })
    return productos


def _leer_refrigerios_estandar(ws, fila_inicio):
    productos = []
    for fila in range(fila_inicio, ws.max_row + 1):
        descripcion = _texto(_celda(ws, fila, 4))
        precio = _numero(_celda(ws, fila, 5))
        if not descripcion or precio is None:
            continue
        productos.append({
            "opcion": _texto(_celda(ws, fila, 3)),
            "nombre": _nombre_corto(descripcion),
            "descripcion": descripcion,
            "precio": precio,
            "tipo_montaje": _texto(_celda(ws, fila, 6)),
            "incremento_empaque": _numero(_celda(ws, fila, 7)),
            "incremento_bebida": _numero(_celda(ws, fila, 8)),
            "cantidad_minima": _entero(_celda(ws, fila, 9)),
            "cantidad_maxima": _entero(_celda(ws, fila, 10)),
            "incremento_jugo": _numero(_celda(ws, fila, 11)),
        })
    return productos


def _leer_refrigerios_premium(ws, fila_inicio):
    productos = []
    for fila in range(fila_inicio, ws.max_row + 1):
        descripcion = _texto(_celda(ws, fila, 4))
        precio = _numero(_celda(ws, fila, 6))
        if not descripcion or precio is None:
            continue
        productos.append({
            "opcion": _texto(_celda(ws, fila, 3)),
            "nombre": _nombre_corto(descripcion),
            "descripcion": descripcion,
            "tipo_montaje": _texto(_celda(ws, fila, 5)),
            "precio": precio,
            "cantidad_minima": _entero(_celda(ws, fila, 7)),
            "cantidad_maxima": _entero(_celda(ws, fila, 8)),
            "incremento_empaque": _numero(_celda(ws, fila, 9)),
        })
    return productos


# hoja → (orden, fila de inicio de datos, lector)
HOJAS = [
    ("CAIKE", 1, lambda ws: _leer_restaurante(ws, 4, con_empacado=True)),
    ("CRU", 2, lambda ws: _leer_restaurante(ws, 4, con_empacado=True)),
    ("TOMOGO", 3, lambda ws: _leer_restaurante(ws, 3, con_empacado=False)),
    ("CENAS ESPECIALES", 4, lambda ws: _leer_pares(ws, 5, [(3, 4), (5, 6)])),
    ("DESAYUNOS ESPECIALES", 5, lambda ws: _leer_pares(ws, 5, [(2, 3), (4, 5)])),
    ("MENU CENAS NAVIDEÑAS", 6, lambda ws: _leer_cenas_navidenas(ws, 5)),
    ("REFRIGERIOS ESTANDAR EVALB", 7, lambda ws: _leer_refrigerios_estandar(ws, 6)),
    ("REFRIGERIOS PREMIUM", 8, lambda ws: _leer_refrigerios_premium(ws, 6)),
]

# notas que el Excel deja en celdas combinadas y que son reglas de negocio
NOTAS_HOJA = {
    "REFRIGERIOS ESTANDAR EVALB": (
        "Tener en cuenta las cantidades mínimas de despacho: si se piden menos, "
        "el domicilio se cobra aparte."
    ),
    "REFRIGERIOS PREMIUM": (
        "Tener en cuenta las cantidades mínimas de despacho: si se piden menos, "
        "el domicilio se cobra aparte."
    ),
}


def leer_portafolio(ruta):
    wb = openpyxl.load_workbook(ruta, data_only=True)
    faltantes = [h for h, _, _ in HOJAS if h not in wb.sheetnames]
    if faltantes:
        raise SystemExit(f"El archivo no tiene las hojas esperadas: {faltantes}")

    categorias = []
    for hoja, orden, lector in HOJAS:
        productos = lector(wb[hoja])
        categorias.append({
            "nombre": hoja,
            "orden": orden,
            "notas": NOTAS_HOJA.get(hoja),
            "productos": productos,
        })
    return categorias


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archivo", default=RUTA_POR_DEFECTO)
    parser.add_argument("--aplicar", action="store_true")
    parser.add_argument("--reemplazar", action="store_true",
                        help="Borra el catálogo previo del proveedor antes de importar")
    args = parser.parse_args()

    if not os.path.exists(args.archivo):
        raise SystemExit(f"No se encontró el archivo: {args.archivo}")

    categorias = leer_portafolio(args.archivo)
    total = sum(len(c["productos"]) for c in categorias)
    print(f"Archivo: {args.archivo}")
    print(f"Categorías: {len(categorias)} · productos: {total}\n")
    for c in categorias:
        print(f"  {c['nombre']:32s} {len(c['productos']):3d} productos")
        for p in c["productos"][:2]:
            extra = []
            if p.get("precio_empacado"):
                extra.append(f"empacado {p['precio_empacado']:.0f}")
            if p.get("cantidad_minima"):
                extra.append(f"mín {p['cantidad_minima']}")
            if p.get("incremento_empaque"):
                extra.append(f"+empaque {p['incremento_empaque']:.0f}")
            print(f"      · {p['nombre'][:58]:58s} {p['precio']:>9.0f}  {' '.join(extra)}")

    if not args.aplicar:
        print("\n(simulación: añade --aplicar para escribir en la base de datos)")
        return

    if engine.dialect.name == "sqlite":
        ruta_db = engine.url.database
        if ruta_db and os.path.exists(ruta_db):
            respaldo = f"{ruta_db}.backup-{datetime.now():%Y%m%d-%H%M%S}"
            shutil.copy2(ruta_db, respaldo)
            print(f"\nRespaldo: {respaldo}")

    db = SessionLocal()
    try:
        proveedor = db.query(Proveedor).filter(Proveedor.nombre == PROVEEDOR).first()
        if not proveedor:
            proveedor = Proveedor(nombre=PROVEEDOR, notas=NOTA_ALIMENTOS)
            db.add(proveedor)
            db.flush()
            print(f"Proveedor creado: {PROVEEDOR} (id {proveedor.id})")
        else:
            print(f"Proveedor existente: {PROVEEDOR} (id {proveedor.id})")

        if args.reemplazar:
            borrados = db.query(Producto).filter(Producto.proveedor_id == proveedor.id).delete()
            db.query(CategoriaCotizacion).filter(
                CategoriaCotizacion.proveedor_id == proveedor.id
            ).delete()
            print(f"Catálogo previo borrado: {borrados} productos")

        creados = 0
        for cat in categorias:
            existente = db.query(CategoriaCotizacion).filter(
                CategoriaCotizacion.proveedor_id == proveedor.id,
                CategoriaCotizacion.nombre == cat["nombre"],
            ).first()
            if not existente:
                existente = CategoriaCotizacion(
                    proveedor_id=proveedor.id, nombre=cat["nombre"],
                    notas=cat["notas"], orden=cat["orden"],
                )
                db.add(existente)
                db.flush()
            elif cat["notas"] and not existente.notas:
                existente.notas = cat["notas"]

            for orden, p in enumerate(cat["productos"]):
                db.add(Producto(
                    proveedor_id=proveedor.id,
                    categoria_id=existente.id,
                    orden=orden,
                    **{k: v for k, v in p.items() if k != "opcion"},
                ))
                creados += 1

        db.commit()
        print(f"\nProductos importados: {creados}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
