from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class AIKey(SQLModel, table=True):
    __tablename__ = "ai_keys"

    id: Optional[int] = Field(default=None, primary_key=True)
    key_value: str = Field(nullable=False, unique=True)
    
    is_active: bool = Field(default=True)
    total_calls: int = Field(default=0)
    error_count: int = Field(default=0) # Ключ автоматически выключается, если набралось много ошибок подряд
    
    last_used_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
