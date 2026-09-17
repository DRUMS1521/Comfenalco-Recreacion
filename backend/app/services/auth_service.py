from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.models.user import User
from app.core.security import verify_password, create_access_token, decode_token
from app.schemas.auth import TokenResponse
from app.core.database import get_db

security = HTTPBearer()


def authenticate_user(db: Session, username: str, password: str):
    user = db.query(User).filter(User.username == username.strip()).first()
    if not user or not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None

    token = create_access_token({"sub": str(user.id), "username": user.username})
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
        empresa=user.empresa,
        is_admin=user.is_admin,
        is_recreador=user.is_recreador,
        is_promotor=user.is_promotor,
        is_super_admin=user.is_super_admin,
        is_cotizador=user.is_cotizador,
        cargo=user.cargo,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado",
        )
    return user
