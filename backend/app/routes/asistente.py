"""Rutas del asistente flotante.

Solo requiere estar autenticado: el propio servicio aplica el alcance por rol, de
modo que un recreador no puede consultar la agenda de otro ni un promotor las
cotizaciones ajenas.
"""
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.schemas.asistente import ConsultaAsistenteRequest, RespuestaAsistente
from app.services import asistente_service as svc
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/asistente", tags=["asistente"])

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def _contexto() -> str:
    hoy = date.today()
    return f"hoy es {DIAS[hoy.weekday()]} {hoy.day} de {MESES[hoy.month - 1]} de {hoy.year}"


@router.get("/saludo", response_model=RespuestaAsistente)
def saludo(current_user: User = Depends(get_current_user)):
    """Saludo inicial personalizado con ejemplos según el rol."""
    data = svc._ayuda(current_user)
    data["contexto"] = _contexto()
    return data


@router.post("/consultar", response_model=RespuestaAsistente)
def consultar(
    data: ConsultaAsistenteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    respuesta = svc.responder(db, current_user, data.pregunta, data.contexto)
    respuesta["contexto"] = _contexto()
    return respuesta
