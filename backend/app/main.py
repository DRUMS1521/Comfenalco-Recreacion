import logging
import secrets
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.core.migrations import aplicar_migraciones
from app.routes import auth, solicitudes, stats, empresas, users, horas_extra, viaticos, cotizaciones

logger = logging.getLogger("comfenalco")


def _password_de_sembrado() -> str:
    """Contraseña para los usuarios sembrados.

    Ya no hay contraseñas en el código: se toma de SEED_PASSWORD_DEFAULT y, si no
    está definida, se genera una aleatoria que se escribe una sola vez en el log
    (así no quedan credenciales públicas en el repositorio y el sistema tampoco se
    queda sin acceso).
    """
    if settings.SEED_PASSWORD_DEFAULT:
        return settings.SEED_PASSWORD_DEFAULT
    return secrets.token_urlsafe(12)


def _seed_users_if_empty():
    from app.models.user import User
    from app.core.security import get_password_hash

    USUARIOS = [
        {"username": "adriana.barbosa", "email": "adriana.barbosa@comfenalcotolima.com", "full_name": "Adriana Barbosa", "cargo": "Jefe de Recreación", "is_super_admin": True, "is_admin": True, "is_recreador": False, "is_promotor": False},
        {"username": "jennifer", "email": "jennifer@comfenalcotolima.com", "full_name": "Jennifer", "cargo": "Secretaria de Recreación", "is_super_admin": False, "is_admin": True, "is_recreador": False, "is_promotor": False},
        {"username": "promotor1", "email": "promotor1@comfenalcotolima.com", "full_name": "Laura Gómez", "cargo": "Promotor Comercial", "is_super_admin": False, "is_admin": False, "is_recreador": False, "is_promotor": True},
        {"username": "gabriel.vaquiro", "email": "gabriel.vaquiro@comfenalcotolima.com", "full_name": "Gabriel Vaquiro", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "andres.garcia", "email": "andres.garcia@comfenalcotolima.com", "full_name": "Andres Garcia", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "sebastian.leguizamon", "email": "sebastian.leguizamon@comfenalcotolima.com", "full_name": "Sebastian Leguizamon", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "dalma.suarez", "email": "dalma.suarez@comfenalcotolima.com", "full_name": "Dalma Suarez", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "johny.fandino", "email": "johny.fandino@comfenalcotolima.com", "full_name": "Johny Fandiño Guia", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "mercedes.leal", "email": "mercedes.leal@comfenalcotolima.com", "full_name": "Mercedes Leal", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "nestor.villa", "email": "nestor.villa@comfenalcotolima.com", "full_name": "Nestor Villa", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "angie.rojas", "email": "angie.rojas@comfenalcotolima.com", "full_name": "Angie Rojas", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "camilo.pena", "email": "camilo.pena@comfenalcotolima.com", "full_name": "Camilo Peña", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "issa.paez", "email": "issa.paez@comfenalcotolima.com", "full_name": "Issa Paez", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "juan.daniel", "email": "juan.daniel@comfenalcotolima.com", "full_name": "Juan Daniel", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "mauricio.arias", "email": "mauricio.arias@comfenalcotolima.com", "full_name": "Mauricio Arias", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "daniel.rincon", "email": "daniel.rincon@comfenalcotolima.com", "full_name": "Daniel Rincon", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "daniel.ruiz", "email": "daniel.ruiz@comfenalcotolima.com", "full_name": "Daniel Ruiz", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "brayan.botero", "email": "brayan.botero@comfenalcotolima.com", "full_name": "Brayan Botero", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
    ]

    db = SessionLocal()
    try:
        count = db.query(User).count()
        if count > 0:
            return
        password_comun = _password_de_sembrado()
        if settings.SEED_PASSWORD_DEFAULT:
            logger.info(
                "Sembrando %d usuarios con la contraseña de SEED_PASSWORD_DEFAULT",
                len(USUARIOS),
            )
        else:
            logger.warning(
                "Sembrando %d usuarios con una contraseña ALEATORIA: %s  ·  define "
                "SEED_PASSWORD_DEFAULT para controlarla y cámbiala al primer acceso.",
                len(USUARIOS), password_comun,
            )
        for u in USUARIOS:
            db.add(User(
                username=u["username"], email=u["email"],
                hashed_password=get_password_hash(password_comun),
                full_name=u["full_name"], empresa="Comfenalco Tolima",
                cargo=u["cargo"], is_active=True,
                is_admin=u["is_admin"], is_recreador=u["is_recreador"],
                is_promotor=u["is_promotor"], is_super_admin=u["is_super_admin"],
            ))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:  # noqa: BLE001
        logger.warning("create_all no pudo completarse: %s", e)

    # Migraciones portables (SQLite/PostgreSQL), idempotentes y con log real de
    # lo aplicado y lo fallido. Antes era un try/except: pass silencioso.
    resumen = aplicar_migraciones(engine)
    if resumen["aplicadas"]:
        logger.info("Migraciones aplicadas: %s", ", ".join(resumen["aplicadas"]))
    if resumen["errores"]:
        logger.error("Migraciones con error: %s", "; ".join(resumen["errores"]))

    _seed_users_if_empty()

    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="API para gestión de solicitudes de servicios de recreación",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "https://comfenalco-frontend-production.up.railway.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(solicitudes.router)
app.include_router(stats.router)
app.include_router(empresas.router)
app.include_router(users.router)
app.include_router(horas_extra.router)
app.include_router(viaticos.router)
app.include_router(cotizaciones.router)
app.include_router(cotizaciones.catalogo_router)


@app.get("/")
def root():
    return {"message": f"API {settings.APP_NAME} funcionando correctamente", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
