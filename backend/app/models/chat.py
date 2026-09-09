"""Модели AI-чата: сессии и сообщения (включая tool-вызовы)."""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, JSON, Column
from sqlalchemy import Text


class ChatSession(SQLModel, table=True):
    __tablename__ = "chat_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True, nullable=False)
    title: str = Field(default="Новый чат", nullable=False)
    model: str = Field(default="", nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ChatMessage(SQLModel, table=True):
    __tablename__ = "chat_messages"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="chat_sessions.id", index=True, nullable=False)
    # user | assistant | tool
    role: str = Field(nullable=False, index=True)
    content: str = Field(default="", sa_column=Column(Text, nullable=False))
    # Имя вызванного тула (для role="tool")
    tool_name: Optional[str] = Field(default=None)
    # Для assistant: {"tool_calls": [...]} — вызовы тулов в OpenAI-формате
    # Для tool: {"tool_call_id": "..."} + опционально "ui": {...} — данные для UI-карточки
    tool_payload: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
