"""Cálculo de horas compartido.

Antes la misma función estaba duplicada en `stats_service` y en
`horas_extra_service`, y el límite semanal (42 h) estaba escrito a mano en el
frontend sin ninguna comprobación en el servidor. Aquí queda una única fuente
de verdad, en minutos y con las mismas reglas de negocio:

- Un turno con rango positivo dura como mínimo 1 hora (acuerdo operativo).
- Un turno invertido o inválido dura 0.
"""
from datetime import date, datetime, timedelta
from typing import List, Optional

# Límite de horas semanales de un recreador antes de requerir clasificación
# como hora extra (mismo valor que usaba el frontend).
LIMITE_HORAS_SEMANALES = 42


def to_minutes(hhmm: str) -> int:
    """Convierte "HH:MM" a minutos desde medianoche."""
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def calc_hours(hora_inicio: str, hora_fin: str) -> float:
    """Horas de un turno, con mínimo de 1 hora si el rango es positivo."""
    try:
        mins = to_minutes(hora_fin) - to_minutes(hora_inicio)
        return max(mins / 60.0, 1.0) if mins > 0 else 0.0
    except Exception:
        return 0.0


def horas_solapadas(hora_inicio: str, hora_fin: str, limite_inicio: str, limite_fin: str) -> float:
    """Horas del turno que caen dentro de la ventana [limite_inicio, limite_fin]."""
    ini, fin = to_minutes(hora_inicio), to_minutes(hora_fin)
    lim_ini, lim_fin = to_minutes(limite_inicio), to_minutes(limite_fin)
    solape = min(fin, lim_fin) - max(ini, lim_ini)
    return max(solape, 0) / 60.0


def _parse_fecha(fecha_iso: str) -> date:
    return datetime.strptime(fecha_iso, "%Y-%m-%d").date()


def lunes_de(fecha_iso: str) -> str:
    """Lunes de la semana de `fecha_iso` ("YYYY-MM-DD"), en formato ISO.

    Se calcula sobre fechas locales (sin `toISOString`) para no desplazar un día
    por la zona horaria, que es el error clásico de este cálculo.
    """
    d = _parse_fecha(fecha_iso)
    return (d - timedelta(days=d.weekday())).isoformat()


def dias_de_semana(fecha_iso: str) -> List[str]:
    """Los 7 días (lunes→domingo) de la semana de `fecha_iso`."""
    lunes = _parse_fecha(lunes_de(fecha_iso))
    return [(lunes + timedelta(days=i)).isoformat() for i in range(7)]


def rango_semana(fecha_iso: str) -> tuple:
    """(lunes, domingo) de la semana de `fecha_iso`."""
    dias = dias_de_semana(fecha_iso)
    return dias[0], dias[-1]


def turnos_se_solapan(inicio_a: str, fin_a: str, inicio_b: str, fin_b: str) -> bool:
    """True si dos turnos del mismo día comparten algún minuto."""
    try:
        return inicio_a < fin_b and inicio_b < fin_a
    except TypeError:
        return False
