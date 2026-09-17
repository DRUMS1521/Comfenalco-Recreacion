"""Clasifica el origen de las solicitudes migradas del cronograma de Excel.

Contexto: `migrar_cronograma_excel.py` insertó las 5.730 filas de `solicitudes`
"todo sin filtrar": cada bloque de texto de la celda EVENTO se volvió una
solicitud, mezclando eventos reales de recreación con tareas administrativas
internas (novedades de personal, exámenes médicos, bodega, papelería,
capacitaciones) y con la operación interna de Comfenalco (escuelas deportivas
CRU, gym, años dorados, comedor).

Este script NO borra ni reescribe datos: escribe la clasificación en columnas
nuevas y ortogonales al flujo de `estado`:

    categoria_origen         'real' | 'administrativo' | 'dudoso'
    categoria_origen_motivo  regla que la clasificó (trazabilidad)
    categoria_revisada       se respeta: las filas ya revisadas por una persona
                             no se vuelven a tocar

Decisiones de negocio aplicadas (confirmadas por el usuario):
  * Los programas internos de Comfenalco (CRU, escuelas deportivas, gym, años
    dorados, comedor) se clasifican como **administrativo** (son operación
    interna, no solicitud de una empresa).
  * El exceso de horas NO se toca aquí: las tareas administrativas siguen siendo
    jornada laboral y siguen contando para horas extra y viáticos.

Uso:
    python clasificar_solicitudes.py             # simulación (no escribe)
    python clasificar_solicitudes.py --aplicar   # escribe (hace respaldo antes)
"""
import argparse
import os
import shutil
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, engine
from app.models.solicitud import Solicitud  # noqa: E402
from app.models.user import User  # noqa: E402,F401  (registra el mapper de la relación recreadores)


# ── Normalización ────────────────────────────────────────────────────────────
_ACENTOS = str.maketrans("ÁÉÍÓÚÑÜ", "AEIOUNU")
_PUNTUACION_W = str.maketrans({c: " " for c in ".,;/:-"})


def bloque_de(observaciones: str) -> str:
    """Texto del bloque original: lo que sigue al primer ']' de '[HOJA · DÍA] ...'."""
    if not observaciones:
        return ""
    if "]" in observaciones:
        return observaciones.split("]", 1)[1]
    return observaciones


def normalizar(texto: str) -> str:
    r = texto.upper().translate(_ACENTOS)
    while "  " in r:
        r = r.replace("  ", " ")
    return r.strip()


def _word(padded: str, *terminos: str) -> bool:
    return any(f" {t} " in padded for t in terminos)


def _pref(padded: str, *terminos: str) -> bool:
    return any(padded.startswith(f" {t} ") for t in terminos)


def _lit(r: str, *etiquetas: str) -> bool:
    return any(f"{etiqueta}:" in r for etiqueta in etiquetas)


# ── Vocabularios de las reglas ───────────────────────────────────────────────
NOVEDAD_RRHH = (
    "INCAPACIDAD", "VACACIONES", "LICENCIA", "PERMISO", "CALAMIDAD", "AUSENCIA", "REPOSO",
    "ENCARGO", "DIA COMPENSATORIO", "DIA OTORGADO", "MEDIO DIA", "CITA MEDICA", "NO ASISTE",
    "NO DISPONIBLE", "LIBRE", "DESCANSO", "SUSPENSION", "JURADO DE VOTACION", "VOTACIONES",
    "CUMPLEANOS",
)
ESTRUCTURA_ETIQUETA = ("LUGAR", "HORA", "SERVICIO", "FECHA")
ESTRUCTURA_WORD = ("SERVICIO SOLICITADO", "FECHA EVENTO")
SERVICIO_RECREATIVO = (
    "CARDIO RUMBA", "PAUSA ACTIVA", "PAUSAS ACTIVAS", "ACTIVIDAD RECREATIVA",
    "ACTIVIDADES RECREATIVAS", "RECREADOR", "RECREADORES", "RECREACIONISTA",
    "RECREACIONISTAS", "ANIMADOR", "ANIMADORES", "CON SONIDO", "CAMINATA", "ROMPE HIELO",
    "RUMBA", "LUDICA", "LUDICAS", "FIESTA INFANTIL", "BABY SHOWER", "DIA DE LA FAMILIA",
    "CELEBRACION", "EVENTO", "DESAYUNO", "INTEGRACION",
)
EXAMEN_MEDICO = (
    "EXAMEN", "EXAMENES", "OCUPACIONAL", "OCUPACIONALES", "AUDIOMETRIA", "OPTOMETRIA",
    "ALTURAS", "IPS", "ARL", "LABORATORIO", "VACUNACION",
)
BODEGA = (
    "BODEGA", "ARREGLO", "DECORACION", "DECORACIONES", "DECORAR", "DESMONTAR",
    "ALISTAMIENTO", "ALISTAMIENDO", "DESARMAR", "EMBOLSAR", "FORRAR", "INVENTARIO",
    "MUDANZA", "SILLAS", "MONTAJE", "EMPAQUETAR", "ORGANIZAR",
)
APOYO_INTERNO = (
    "CUSTODIA", "PORTERIA", "APOYO ESTADISTICAS", "APOYO TURISMO", "APOYO ADMINISTRATIVO",
    "APOYO A EVER", "APOYO LOGISTICO", "APOYO OFICINA", "RECOGER VIAJE", "APOYO CALIDAD",
)
CAPACITACION = (
    "CAPACITACION", "CAPACITACIONES", "TALLER", "TALLERES", "INDUCCION", "ENTRENAMIENTO",
    "CERTIFICACION", "CERTIFICACIONES", "SOCIALIZACION", "CURSO",
)
PAPELERIA = (
    "REUNION", "REUNIONES", "COMITE", "PLANEACION", "INFORME", "INFORMES", "PAPELERIA",
    "ARCHIVO", "RADICAR", "LEGALIZAR", "PLANILLA", "EVALUACION", "EVALUACIONES", "FIRMA",
    "TRAMITE", "TRAMITES", "COTIZACION", "COTIZACIONES", "FACTURACION", "CERTIFICADO",
    "CERTIFICADOS",
)
# Operación interna de Comfenalco: el usuario decidió tratarla como administrativa.
PROGRAMA_INTERNO = (
    "ANOS DORADOS", "TARDES DORADAS", "INGRESOS GYM", "GYM", "ESCUELAS DEPORTIVAS",
    "NATACION", "COMEDOR", "SALON AUGUSTO", "CRU", "OFICINA DE RECREACION", "EDIFICIO SEDE",
)


def clasificar(observaciones: str) -> tuple:
    """Devuelve (categoria, motivo). Primera regla que coincide gana."""
    r = normalizar(bloque_de(observaciones))
    if not r:
        return "dudoso", "SIN_TEXTO"
    w = r.translate(_PUNTUACION_W)
    padded = f" {w} "

    # R1 · Novedad de personal / ausencia (anclada al inicio del bloque)
    if _pref(padded, *NOVEDAD_RRHH):
        return "administrativo", "R1_NOVEDAD_RRHH"

    # R2 · Solicitud estructurada (PAX + empresa/servicio/lugar/hora)
    if (_word(padded, "PAX") or _lit(r, "NO. DE PERSONAS", "NO DE PERSONAS")) and (
        _word(padded, "EMPRESA", *ESTRUCTURA_WORD) or _lit(r, *ESTRUCTURA_ETIQUETA)
    ):
        return "real", "R2_SOLICITUD_ESTRUCTURADA"

    # R3 · Pasadía / plan promocional
    if _word(padded, "PASADIA", "PLAN PROMOCIONAL"):
        return "real", "R3_PASADIA_PLAN"

    # R4 · Servicio recreativo con marcador de estructura
    if _word(padded, *SERVICIO_RECREATIVO) and (
        _word(padded, *ESTRUCTURA_WORD) or _lit(r, *ESTRUCTURA_ETIQUETA)
    ):
        return "real", "R4_SERVICIO_CON_ESTRUCTURA"

    # R5 · Examen médico ocupacional
    if _word(padded, *EXAMEN_MEDICO):
        return "administrativo", "R5_EXAMEN_MEDICO"

    # R6 · Bodega / decoración / montaje
    if _word(padded, *BODEGA):
        return "administrativo", "R6_BODEGA_MONTAJE"

    # R7 · Apoyo interno (turismo, calidad, custodia, logística)
    if _word(padded, *APOYO_INTERNO):
        return "administrativo", "R7_APOYO_INTERNO"

    # R8 · Capacitación / inducción interna (salvo que sea programa interno)
    if _word(padded, *CAPACITACION) and not _word(padded, *PROGRAMA_INTERNO):
        return "administrativo", "R8_CAPACITACION_INTERNA"

    # R9 · Papelería / reunión / legalización
    if _word(padded, *PAPELERIA):
        return "administrativo", "R9_PAPELERIA_LEGALIZACION"

    # R10 · Programa interno de Comfenalco → administrativo (decisión del usuario)
    if _word(padded, *PROGRAMA_INTERNO):
        return "administrativo", "R10_PROGRAMA_INTERNO"

    # R11 · Menciona servicio recreativo pero sin estructura de solicitud
    if _word(padded, *SERVICIO_RECREATIVO):
        return "dudoso", "R11_SERVICIO_SIN_ESTRUCTURA"

    # R12 · Sin patrón reconocible
    return "dudoso", "R12_SIN_PATRON"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--aplicar", action="store_true", help="Escribe en la base de datos")
    args = parser.parse_args()

    if args.aplicar and engine.dialect.name == "sqlite":
        ruta = engine.url.database
        if ruta and os.path.exists(ruta):
            respaldo = f"{ruta}.backup-{datetime.now():%Y%m%d-%H%M%S}"
            shutil.copy2(ruta, respaldo)
            print(f"Respaldo creado: {respaldo}")

    db = SessionLocal()
    try:
        solicitudes = db.query(Solicitud).all()
        print(f"Solicitudes analizadas: {len(solicitudes)}")
        print(f"Modo: {'APLICAR (escribe)' if args.aplicar else 'simulación (no escribe)'}\n")

        por_categoria, por_motivo, actualizadas = {}, {}, 0
        ejemplos = {}
        for s in solicitudes:
            if s.categoria_revisada:
                continue
            categoria, motivo = clasificar(s.observaciones)
            por_categoria[categoria] = por_categoria.get(categoria, 0) + 1
            por_motivo[motivo] = por_motivo.get(motivo, 0) + 1
            ejemplos.setdefault(f"{categoria}:{motivo}", (s.id, (s.observaciones or "")[:90]))

            if args.aplicar and (
                s.categoria_origen != categoria
                or s.categoria_origen_motivo != motivo
            ):
                s.categoria_origen = categoria
                s.categoria_origen_motivo = motivo
                actualizadas += 1

        print("Por regla (cascada):")
        for motivo, total in sorted(por_motivo.items(), key=lambda x: -x[1]):
            print(f"  {motivo:34s} {total:5d}")
        print("\nPor categoría:")
        total = sum(por_categoria.values()) or 1
        for categoria, n in sorted(por_categoria.items(), key=lambda x: -x[1]):
            print(f"  {categoria:16s} {n:5d}  ({n * 100 / total:.1f}%)")

        print("\nEjemplos:")
        for clave, (sid, texto) in sorted(ejemplos.items()):
            print(f"  [{clave}] id={sid} · {texto}")

        if args.aplicar:
            db.commit()
            print(f"\nFilas actualizadas: {actualizadas}")
        else:
            print("\n(simulación: añade --aplicar para escribir)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
