from typing import Optional
from sqlmodel import SQLModel, Field
from datetime import datetime


class AISettings(SQLModel, table=True):
    """
    Singleton-настройки ИИ (всегда одна строка с id=1).
    Все вызовы LLM / embeddings идут через Syntee Gateway (OpenAI-compatible).
    """
    __tablename__ = "ai_settings"

    id: Optional[int] = Field(default=None, primary_key=True)
    # Base URL гейтвея, напр. https://syntee.fun/v1
    gateway_url: str = Field(default="https://syntee.fun/v1", nullable=False)
    # Группа моделей для чат-ответов покупателям (основная)
    text_model: str = Field(default="", nullable=False)
    # Группа моделей с поддержкой Vision (скриншоты)
    vision_model: str = Field(default="", nullable=False)
    # Дешёвая группа для массовых задач (классификация отзывов, cheap-агенты)
    cheap_model: str = Field(default="", nullable=False)
    # Группа моделей эмбеддингов (семантическая память агентов)
    embedding_model: str = Field(default="", nullable=False)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
