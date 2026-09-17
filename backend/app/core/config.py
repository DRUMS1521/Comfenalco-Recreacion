from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./comfenalco.db"
    SECRET_KEY: str = "dev_secret_key_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = ""
    EMAIL_RECREACION: str = "recreacion@comfenalcotolima.com"

    APP_NAME: str = "Comfenalco Tolima - Servicios de Recreación"
    FRONTEND_URL: str = "http://localhost:5173"

    # Integración Argus (portal self-service Comfenalco) para consultar viáticos.
    # La cookie de sesión expira periódicamente y debe renovarse en .env.
    ARGUS_COOKIE: str = ""
    ARGUS_PDATOS: str = ""

    # Sembrado inicial de usuarios: si SEED_PASSWORD_DEFAULT está definida, todos
    # los usuarios sembrados usan esa contraseña en vez de las de desarrollo
    # (que son públicas y están escritas en el código).
    SEED_PASSWORD_DEFAULT: str = ""

    # Excluir por defecto de calendarios, listados y estadísticas las solicitudes
    # clasificadas como administrativas (ruido de la migración del cronograma).
    EXCLUIR_ADMINISTRATIVAS_POR_DEFECTO: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
