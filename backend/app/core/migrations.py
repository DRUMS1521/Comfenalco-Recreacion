"""Migraciones ligeras y portables (SQLite / PostgreSQL).

El arranque anterior ejecutaba una lista de `ALTER TABLE ... BOOLEAN DEFAULT 0`
dentro de un `try/except: pass`: en PostgreSQL esa sintaxis es inválida, el error
se descartaba en silencio y la columna nunca se creaba (`create_all` tampoco
altera tablas existentes). Aquí las columnas se comprueban antes con el
inspector de SQLAlchemy, el DDL se genera según el dialecto y todo lo que se
salta o falla queda registrado en el log.

No sustituye a Alembic (que ya está en requirements pero sin usar): es la red de
seguridad para que un despliegue existente no se quede sin columnas nuevas.
"""
import logging

from sqlalchemy import inspect, text

logger = logging.getLogger("comfenalco.migraciones")


# (tabla, columna, tipo SQLite, tipo PostgreSQL)
_COLUMNAS = [
    ("users", "is_promotor", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
    ("users", "is_super_admin", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
    ("users", "cargo", "TEXT", "TEXT"),
    ("solicitudes", "categoria_origen", "VARCHAR", "VARCHAR"),
    ("solicitudes", "categoria_origen_motivo", "VARCHAR", "VARCHAR"),
    ("solicitudes", "categoria_revisada", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
]

_INDICES = [
    ("ix_solicitudes_categoria_origen", "solicitudes", "categoria_origen"),
]


def _tipo_para(dialecto: str, sqlite_tipo: str, postgres_tipo: str) -> str:
    return postgres_tipo if dialecto.startswith("postgres") else sqlite_tipo


def aplicar_migraciones(engine) -> dict:
    """Crea las columnas/índices que falten. Devuelve un resumen de lo aplicado."""
    resumen = {"aplicadas": [], "omitidas": [], "errores": []}
    dialecto = engine.dialect.name

    inspector = inspect(engine)
    tablas = set(inspector.get_table_names())

    def columnas_de(tabla):
        try:
            return {c["name"] for c in inspector.get_columns(tabla)}
        except Exception:
            return set()

    def indices_de(tabla):
        try:
            return {i["name"] for i in inspector.get_indexes(tabla)}
        except Exception:
            return set()

    with engine.connect() as conn:
        for tabla, columna, sqlite_tipo, postgres_tipo in _COLUMNAS:
            if tabla not in tablas:
                resumen["omitidas"].append(f"{tabla}.{columna} (la tabla no existe)")
                continue
            if columna in columnas_de(tabla):
                resumen["omitidas"].append(f"{tabla}.{columna} (ya existe)")
                continue
            ddl = (
                f"ALTER TABLE {tabla} ADD COLUMN {columna} "
                f"{_tipo_para(dialecto, sqlite_tipo, postgres_tipo)}"
            )
            try:
                conn.execute(text(ddl))
                conn.commit()
                resumen["aplicadas"].append(f"{tabla}.{columna}")
                logger.info("Columna creada: %s", ddl)
            except Exception as e:  # ya no se silencia
                resumen["errores"].append(f"{tabla}.{columna}: {e}")
                logger.error("No se pudo crear %s.%s: %s", tabla, columna, e)

        for nombre, tabla, columna in _INDICES:
            if tabla not in tablas:
                continue
            if columna not in columnas_de(tabla):
                continue
            if nombre in indices_de(tabla):
                resumen["omitidas"].append(f"{nombre} (ya existe)")
                continue
            try:
                conn.execute(text(f"CREATE INDEX {nombre} ON {tabla} ({columna})"))
                conn.commit()
                resumen["aplicadas"].append(nombre)
                logger.info("Índice creado: %s", nombre)
            except Exception as e:
                resumen["errores"].append(f"{nombre}: {e}")
                logger.error("No se pudo crear el índice %s: %s", nombre, e)

    return resumen
