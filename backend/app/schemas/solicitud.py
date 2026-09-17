from pydantic import BaseModel, validator
from typing import Optional, List, Dict
from datetime import datetime

ESTADOS_VALIDOS = ["pendiente", "programado", "por corregir", "eliminado", "finalizado"]


class RecreadorInfo(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None

    class Config:
        from_attributes = True


class SolicitudCreate(BaseModel):
    empresa: str
    fecha_evento: str
    hora_inicio: str
    hora_fin: str
    ciudad: str
    direccion: str
    cantidad_recreadores: int
    cantidad_personas: int
    tipo_publico: str
    tipo_servicio: str
    contacto: str
    telefono_email: str
    telefono_email_2: Optional[str] = None
    observaciones: Optional[str] = None

    @validator("cantidad_recreadores", "cantidad_personas")
    def must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Debe ser mayor a 0")
        return v


class SolicitudResponse(BaseModel):
    id: int
    empresa: str
    fecha_evento: str
    hora_inicio: str
    hora_fin: str
    ciudad: str
    direccion: str
    cantidad_recreadores: int
    cantidad_personas: int
    tipo_publico: str
    tipo_servicio: str
    contacto: str
    telefono_email: str
    telefono_email_2: Optional[str] = None
    observaciones: Optional[str] = None
    observacion_final: Optional[str] = None
    fecha_finalizacion: Optional[datetime] = None
    estado: str
    tipo_hora_extra: Optional[str] = None
    # Clasificación del origen (ver models/solicitud.py)
    categoria_origen: Optional[str] = None
    categoria_origen_motivo: Optional[str] = None
    categoria_revisada: bool = False
    user_id: int
    user_username: Optional[str] = None
    user_full_name: Optional[str] = None
    user_empresa: Optional[str] = None
    user_email: Optional[str] = None
    recreador_id: Optional[int] = None
    recreador_username: Optional[str] = None
    recreador_full_name: Optional[str] = None
    # Lista completa de recreadores asignados
    recreadores_asignados: List[RecreadorInfo] = []
    created_at: datetime

    class Config:
        from_attributes = True


class PaginaSolicitudes(BaseModel):
    """Envelope del listado paginado en servidor."""
    items: List[SolicitudResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ResumenSolicitudes(BaseModel):
    """Conteos agregados para los contadores del dashboard."""
    total: int
    por_estado: Dict[str, int]
    finalizadas_semana: int
    semana_desde: str
    semana_hasta: str
    # Cuántas quedan fuera por estar clasificadas como administrativas (para que
    # el filtro nunca oculte datos en silencio).
    administrativas: int = 0


class ConflictoHorario(BaseModel):
    solicitud_id: int
    empresa: str
    hora_inicio: str
    hora_fin: str


class ValidacionRecreador(BaseModel):
    id: int
    nombre: str
    horas_semana: float      # horas ya programadas esa semana (sin contar esta solicitud)
    horas_nuevas: float      # horas que aporta esta solicitud
    total: float
    excede_limite: bool
    conflictos: List[ConflictoHorario] = []


class ValidacionAsignacion(BaseModel):
    """Resultado de validar una asignación de recreadores en el servidor."""
    solicitud_id: int
    semana_desde: str
    semana_hasta: str
    limite_horas: int
    recreadores: List[ValidacionRecreador]
    hay_exceso: bool
    hay_conflicto: bool


class FinalizarRequest(BaseModel):
    observacion: Optional[str] = ""


class SolicitudUpdate(BaseModel):
    estado: str
    recreador_ids: Optional[List[int]] = None   # lista de recreadores (reemplaza recreador_id)
    tipo_hora_extra: Optional[str] = None

    @validator("estado")
    def estado_valido(cls, v):
        if v not in ESTADOS_VALIDOS:
            raise ValueError(f"Estado inválido. Opciones: {ESTADOS_VALIDOS}")
        return v
