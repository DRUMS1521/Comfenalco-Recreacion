import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.core.migrations import aplicar_migraciones
from app.routes import auth, solicitudes, stats, empresas, users, horas_extra, viaticos

logger = logging.getLogger("comfenalco")


def _seed_users_if_empty():
    from app.models.user import User
    from app.core.security import get_password_hash

    USUARIOS = [
        {"username": "adriana.barbosa", "email": "adriana.barbosa@comfenalcotolima.com", "password": "adriana123", "full_name": "Adriana Barbosa", "cargo": "Jefe de Recreación", "is_super_admin": True, "is_admin": True, "is_recreador": False, "is_promotor": False},
        {"username": "jennifer", "email": "jennifer@comfenalcotolima.com", "password": "admin123", "full_name": "Jennifer", "cargo": "Secretaria de Recreación", "is_super_admin": False, "is_admin": True, "is_recreador": False, "is_promotor": False},
        {"username": "promotor1", "email": "promotor1@comfenalcotolima.com", "password": "promotor123", "full_name": "Laura Gómez", "cargo": "Promotor Comercial", "is_super_admin": False, "is_admin": False, "is_recreador": False, "is_promotor": True},
        {"username": "gabriel.vaquiro", "email": "gabriel.vaquiro@comfenalcotolima.com", "password": "recreador123", "full_name": "Gabriel Vaquiro", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "andres.garcia", "email": "andres.garcia@comfenalcotolima.com", "password": "recreador123", "full_name": "Andres Garcia", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "sebastian.leguizamon", "email": "sebastian.leguizamon@comfenalcotolima.com", "password": "recreador123", "full_name": "Sebastian Leguizamon", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "dalma.suarez", "email": "dalma.suarez@comfenalcotolima.com", "password": "recreador123", "full_name": "Dalma Suarez", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "johny.fandino", "email": "johny.fandino@comfenalcotolima.com", "password": "recreador123", "full_name": "Johny Fandiño Guia", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "mercedes.leal", "email": "mercedes.leal@comfenalcotolima.com", "password": "recreador123", "full_name": "Mercedes Leal", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "nestor.villa", "email": "nestor.villa@comfenalcotolima.com", "password": "recreador123", "full_name": "Nestor Villa", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "angie.rojas", "email": "angie.rojas@comfenalcotolima.com", "password": "recreador123", "full_name": "Angie Rojas", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "camilo.pena", "email": "camilo.pena@comfenalcotolima.com", "password": "recreador123", "full_name": "Camilo Peña", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "issa.paez", "email": "issa.paez@comfenalcotolima.com", "password": "recreador123", "full_name": "Issa Paez", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "juan.daniel", "email": "juan.daniel@comfenalcotolima.com", "password": "recreador123", "full_name": "Juan Daniel", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "mauricio.arias", "email": "mauricio.arias@comfenalcotolima.com", "password": "recreador123", "full_name": "Mauricio Arias", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "daniel.rincon", "email": "daniel.rincon@comfenalcotolima.com", "password": "recreador123", "full_name": "Daniel Rincon", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "daniel.ruiz", "email": "daniel.ruiz@comfenalcotolima.com", "password": "recreador123", "full_name": "Daniel Ruiz", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
        {"username": "brayan.botero", "email": "brayan.botero@comfenalcotolima.com", "password": "recreador123", "full_name": "Brayan Botero", "cargo": "Recreador", "is_super_admin": False, "is_admin": False, "is_recreador": True, "is_promotor": False},
    ]

    db = SessionLocal()
    try:
        count = db.query(User).count()
        if count > 0:
            return
        # Contraseña común para el sembrado: si SEED_PASSWORD_DEFAULT está
        # definida se usa esa (recomendado fuera de desarrollo); si no, se usan
        # las de siempre pero queda constancia en el log, porque son públicas.
        password_comun = settings.SEED_PASSWORD_DEFAULT
        if password_comun:
            logger.info("Sembrando %d usuarios con SEED_PASSWORD_DEFAULT", len(USUARIOS))
        else:
            logger.warning(
                "Sembrando %d usuarios con contraseñas por defecto (adriana123/admin123/"
                "promotor123/recreador123). Define SEED_PASSWORD_DEFAULT y cambia las "
                "contraseñas antes de exponer el sistema.",
                len(USUARIOS),
            )
        for u in USUARIOS:
            db.add(User(
                username=u["username"], email=u["email"],
                hashed_password=get_password_hash(password_comun or u["password"]),
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


@app.get("/")
def root():
    return {"message": f"API {settings.APP_NAME} funcionando correctamente", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
