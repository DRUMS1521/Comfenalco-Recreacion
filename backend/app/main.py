from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.routes import auth, solicitudes, stats, empresas, users, horas_extra


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
        for u in USUARIOS:
            db.add(User(
                username=u["username"], email=u["email"],
                hashed_password=get_password_hash(u["password"]),
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
    except Exception:
        pass

    _migrations = [
        "ALTER TABLE users ADD COLUMN is_promotor BOOLEAN DEFAULT 0",
        "ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN DEFAULT 0",
        "ALTER TABLE users ADD COLUMN cargo TEXT",
    ]
    with engine.connect() as conn:
        for sql in _migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                pass

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


@app.get("/")
def root():
    return {"message": f"API {settings.APP_NAME} funcionando correctamente", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
