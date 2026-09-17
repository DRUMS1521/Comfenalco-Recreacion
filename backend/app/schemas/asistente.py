from typing import List, Optional

from pydantic import BaseModel, Field


class ConsultaAsistenteRequest(BaseModel):
    pregunta: str = Field(..., min_length=1, max_length=300)


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


class RespuestaAsistente(BaseModel):
    respuesta: str
    tipo: str = "texto"                 # texto | actividades | personas | conteos | cotizaciones
    items: List[BloqueAsistente] = []
    conteos: List[ConteoAsistente] = []
    extra: Optional[str] = None
    sugerencias: List[str] = []
    contexto: Optional[str] = None      # p. ej. "hoy, jueves 17 de septiembre de 2026"
