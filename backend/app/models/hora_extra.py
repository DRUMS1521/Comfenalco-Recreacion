from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class HoraExtraManual(Base):
    __tablename__ = "horas_extra_manuales"

    id = Column(Integer, primary_key=True, index=True)
    recreador_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    fecha = Column(String, nullable=False, index=True)  # "YYYY-MM-DD"
    empresa = Column(String, nullable=False)
    hora_inicio = Column(String, nullable=False)  # "HH:MM"
    hora_fin = Column(String, nullable=False)  # "HH:MM"
    tipo = Column(String, nullable=False)  # "ordinaria" | "festiva"
    creado_por_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    recreador = relationship("User", foreign_keys=[recreador_id])
    creado_por = relationship("User", foreign_keys=[creado_por_id])
