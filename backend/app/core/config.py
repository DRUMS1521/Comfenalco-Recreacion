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
    # ARGUS_PDATOS (empresa-empleado) es obligatorio. ARGUS_COOKIE es opcional:
    # se verificó que la consulta devuelve lo mismo con cookie válido, inválido o
    # ausente, así que su caducidad no rompe la integración.
    ARGUS_COOKIE: str = ""
    ARGUS_PDATOS: str = ""

    # Sembrado inicial de usuarios: si SEED_PASSWORD_DEFAULT está definida, todos
    # los usuarios sembrados usan esa contraseña en vez de las de desarrollo
    # (que son públicas y están escritas en el código).
    SEED_PASSWORD_DEFAULT: str = ""

    # Orígenes adicionales permitidos por CORS, separados por coma
    # (por ejemplo el dominio de un túnel o una IP concreta de la red).
    CORS_EXTRA_ORIGINS: str = ""

    # Permitir orígenes de la red local (192.168.x.x, 10.x.x.x, 172.16-31.x.x y
    # localhost). Es lo que permite usar la aplicación desde el celular o una
    # tablet en la misma red durante el desarrollo.
    CORS_PERMITIR_RED_LOCAL: bool = True

    # Excluir por defecto de calendarios, listados y estadísticas las solicitudes
    # clasificadas como administrativas (ruido de la migración del cronograma).
    EXCLUIR_ADMINISTRATIVAS_POR_DEFECTO: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
