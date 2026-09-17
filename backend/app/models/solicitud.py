from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


# Tabla asociativa muchos-a-muchos solicitud ↔ recreador
solicitud_recreadores = Table(
    "solicitud_recreadores",
    Base.metadata,
    Column("solicitud_id", Integer, ForeignKey("solicitudes.id"), primary_key=True),
    Column("recreador_id", Integer, ForeignKey("users.id"),       primary_key=True),
)


class Solicitud(Base):
    __tablename__ = "solicitudes"

    id = Column(Integer, primary_key=True, index=True)
    empresa = Column(String, nullable=False)
    fecha_evento = Column(String, nullable=False)
    hora_inicio = Column(String, nullable=False)
    hora_fin = Column(String, nullable=False)
    tipo_hora_extra = Column(String, nullable=True)
    ciudad = Column(String, nullable=False)
    direccion = Column(String, nullable=False)
    cantidad_recreadores = Column(Integer, nullable=False)
    cantidad_personas = Column(Integer, nullable=False)
    tipo_publico = Column(String, nullable=False)
    tipo_servicio = Column(String, nullable=False)
    contacto = Column(String, nullable=False)
    telefono_email = Column(String, nullable=False)
    telefono_email_2 = Column(String, nullable=True)
    observaciones = Column(Text, nullable=True)
    observacion_final = Column(Text, nullable=True)
    fecha_finalizacion = Column(DateTime(timezone=True), nullable=True)
    estado = Column(String, default="pendiente")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recreador_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # primario
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relación many-to-many con todos los recreadores asignados
    recreadores = relationship(
        "User",
        secondary=solicitud_recreadores,
        primaryjoin="Solicitud.id == solicitud_recreadores.c.solicitud_id",
        secondaryjoin="solicitud_recreadores.c.recreador_id == User.id",
        # "selectin" carga la relación con una consulta IN extra en vez de un JOIN
        # que multiplica filas: con miles de solicitudes el JOIN era el principal
        # costo del listado.
        lazy="selectin",
    )
