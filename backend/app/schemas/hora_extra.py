from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


class HoraExtraManualCreate(BaseModel):
    recreador_id: int
    fecha: str
    empresa: str
    hora_inicio: str
    hora_fin: str
    tipo: Literal["ordinaria", "festiva"]


class HoraExtraManualUpdate(BaseModel):
    fecha: Optional[str] = None
    empresa: Optional[str] = None
    hora_inicio: Optional[str] = None
    hora_fin: Optional[str] = None
    tipo: Optional[Literal["ordinaria", "festiva"]] = None


class HoraExtraManualResponse(BaseModel):
    id: int
    recreador_id: int
    recreador_nombre: str
    fecha: str
    empresa: str
    hora_inicio: str
    hora_fin: str
    tipo: str
    horas: float
    creado_por_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class RegistroHorasExtra(BaseModel):
    """Un registro individual (de Solicitud finalizada o manual) ya clasificado."""
    origen: Literal["solicitud", "manual"]
    id: int
    fecha: str
    hora_inicio: str
    hora_fin: str
    empresa: str
    lugar: Optional[str] = None
    categoria: Literal["ordinarias", "recargo_nocturno", "extra_ordinaria", "extra_festiva"]
    horas: float


class TotalesHorasExtra(BaseModel):
    ordinarias: float = 0
    recargo_nocturno: float = 0
    extra_ordinaria: float = 0
    extra_festiva: float = 0


class HorasExtraRecreadorResponse(BaseModel):
    recreador_id: int
    recreador_nombre: str
    totales: TotalesHorasExtra
    registros: list[RegistroHorasExtra]


class ResumenRecreadorAdmin(BaseModel):
    recreador_id: int
    recreador_nombre: str
    totales: TotalesHorasExtra
