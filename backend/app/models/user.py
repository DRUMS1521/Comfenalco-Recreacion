from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    empresa = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    is_recreador = Column(Boolean, default=False)
    is_promotor = Column(Boolean, default=False)
    # Rol dedicado a cotizaciones de proveedores (departamento de alimentos)
    is_cotizador = Column(Boolean, default=False)
    is_super_admin = Column(Boolean, default=False)
    cargo = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
