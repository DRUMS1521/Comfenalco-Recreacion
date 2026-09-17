from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import UserResponse, UserManageCreate, UserManageUpdate
from app.services.auth_service import get_current_user
from app.core.security import get_password_hash

router = APIRouter(prefix="/users", tags=["users"])

# Cargo → roles automáticos
CARGO_ROLES = {
    "Jefe de Recreación": {
        "is_super_admin": True, "is_admin": True,
        "is_recreador": False, "is_promotor": False,
    },
    "Secretaria de Recreación": {
        "is_super_admin": False, "is_admin": True,
        "is_recreador": False, "is_promotor": False,
    },
    "Recreador": {
        "is_super_admin": False, "is_admin": False,
        "is_recreador": True,  "is_promotor": False,
    },
    "Promotor Comercial": {
        "is_super_admin": False, "is_admin": False,
        "is_recreador": False, "is_promotor": True,
    },
    "Gestor Comercial": {
        "is_super_admin": False, "is_admin": False,
        "is_recreador": False, "is_promotor": True,
    },
    # Rol dedicado: mantiene el catálogo de proveedores y gestiona las cotizaciones
    "Persona de Cotizaciones": {
        "is_super_admin": False, "is_admin": False,
        "is_recreador": False, "is_promotor": False,
        "is_cotizador": True,
    },
}


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el Jefe de Recreación puede administrar usuarios",
        )
    return current_user


@router.get("/", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return db.query(User).order_by(User.cargo, User.full_name).all()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserManageCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    roles = CARGO_ROLES.get(payload.cargo, {
        "is_super_admin": False, "is_admin": False,
        "is_recreador": False, "is_promotor": False, "is_cotizador": False,
    })

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        empresa="Comfenalco Tolima",
        cargo=payload.cargo,
        is_active=True,
        **roles,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserManageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes modificarte a ti mismo")

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.email is not None:
        existing = db.query(User).filter(User.email == payload.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email ya registrado por otro usuario")
        user.email = payload.email
    if payload.password:
        user.hashed_password = get_password_hash(payload.password)
    if payload.cargo is not None:
        user.cargo = payload.cargo
        roles = CARGO_ROLES.get(payload.cargo, {
            "is_super_admin": False, "is_admin": False,
            "is_recreador": False, "is_promotor": False, "is_cotizador": False,
        })
        for k, v in roles.items():
            setattr(user, k, v)

    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/toggle-active", response_model=UserResponse)
def toggle_active(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes desactivarte a ti mismo")

    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user
