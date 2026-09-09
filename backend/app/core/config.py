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

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
