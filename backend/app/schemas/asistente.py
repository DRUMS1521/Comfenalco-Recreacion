from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ConsultaAsistenteRequest(BaseModel):
    pregunta: str = Field(..., min_length=1, max_length=300)
    # Contexto del turno anterior (recreador, fecha, tema) para poder seguir la
    # conversación: "¿y mañana?", "¿y cuántas horas?"
    contexto: Optional[Dict[str, Any]] = None


class BloqueAsistente(BaseModel):
    """Tarjeta de resultado (una actividad, una persona, una cotización)."""
    titulo: str
    subtitulo: Optional[str] = None
    meta: Optional[str] = None
    estado: Optional[str] = None
    horas: Optional[float] = None


class ConteoAsistente(BaseModel):
    etiqueta: str
    valor: float


class AccionAsistente(BaseModel):
    tab: str
    etiqueta: str


class FiltroAsistente(BaseModel):
    campo: str
    valor: str


class RespuestaAsistente(BaseModel):
    respuesta: str
    tipo: str = "texto"                 # texto | actividades | personas | conteos | cotizaciones
    items: List[BloqueAsistente] = []
    conteos: List[ConteoAsistente] = []
    extra: Optional[str] = None
    sugerencias: List[str] = []
    contexto: Optional[str] = None      # p. ej. "hoy, jueves 17 de septiembre de 2026"
    acciones: List[AccionAsistente] = []
    filtros: List[FiltroAsistente] = []
    contexto_conversacion: Dict[str, Any] = {}
