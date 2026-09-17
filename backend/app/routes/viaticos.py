from fastapi import APIRouter, Depends, HTTPException, status
from app.services.auth_service import get_current_user
from app.services.viaticos_service import (
    get_viaticos,
    ArgusNoConfigurado,
    ArgusSesionExpirada,
    ArgusError,
)
from app.models.user import User

router = APIRouter(prefix="/viaticos", tags=["viaticos"])


@router.get("/")
def listar_viaticos(current_user: User = Depends(get_current_user)):
    if not current_user.is_super_admin:
        raise HTTPException(status_code=403, detail="No autorizado")
    try:
        return get_viaticos()
    except ArgusNoConfigurado as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ArgusSesionExpirada as e:
        raise HTTPException(status_code=502, detail=str(e))
    except ArgusError as e:
        # Fallo del proveedor: se responde 502 con el motivo en vez de un 500 opaco.
        raise HTTPException(status_code=502, detail=str(e))
    except ConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))
