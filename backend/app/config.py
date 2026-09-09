import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # Загружаем настройки из файла .env в корне проекта
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Environment
    ENVIRONMENT: str = "prod"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://fanpay_user:fanpay_pass_9d3091@db:5432/fanpay_helper"

    # Security
    JWT_SECRET: str = "super_secret_jwt_key_9d3091"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 часа

    # Telegram
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_ADMIN_CHAT_ID: Optional[str] = None

    # AI Configuration (Fallback)
    DEFAULT_FALLBACK_TEMPLATE: str = "В данный момент линия поддержки перегружена. Оператор ответит вам в течение нескольких минут."

    # Syntee Gateway (OpenAI-compatible) — все вызовы LLM / embeddings идут через него
    SYNTEE_GATEWAY_URL: str = "https://syntee.fun/v1"

settings = Settings()
