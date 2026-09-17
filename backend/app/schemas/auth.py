from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    full_name: Optional[str] = None
    empresa: Optional[str] = None
    is_admin: bool = False
    is_recreador: bool = False
    is_promotor: bool = False
    is_super_admin: bool = False
    is_cotizador: bool = False
    cargo: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    full_name: Optional[str] = None
    empresa: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    empresa: Optional[str] = None
    is_admin: bool
    is_recreador: bool = False
    is_promotor: bool = False
    is_super_admin: bool = False
    is_cotizador: bool = False
    is_active: bool = True
    cargo: Optional[str] = None

    class Config:
        from_attributes = True


# Schemas para gestión de usuarios (super admin)
class UserManageCreate(BaseModel):
    username: str
    email: str
    password: str
    full_name: Optional[str] = None
    cargo: str  # determina los roles automáticamente


class UserManageUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    cargo: Optional[str] = None
