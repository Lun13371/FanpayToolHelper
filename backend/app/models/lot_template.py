from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class LotTemplate(SQLModel, table=True):
    __tablename__ = "lot_templates"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False)
    name: str = Field(nullable=False) # Название шаблона (например, "Steam Дешевые Ключи")
    
    # Дефолтные значения демпинга
    min_price: float = Field(nullable=False)
    undercut_value: float = Field(default=0.01, nullable=False)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
