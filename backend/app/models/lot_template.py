from datetime import datetime
from typing import Optional, Dict, Any
from sqlmodel import SQLModel, Field, JSON
from sqlalchemy import Column

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


class LotCreationTemplate(SQLModel, table=True):
    __tablename__ = "lot_creation_templates"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False)
    name: str = Field(nullable=False) # Название шаблона публикации (например, "Roblox Ключи Розыгрыш")
    node_id: str = Field(nullable=False) # ID категории на Funpay
    game_name: str = Field(nullable=False) # Название игры
    subcategory_name: str = Field(nullable=False) # Название подкатегории
    fields: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON)) # Заполненные поля формы в формате JSON
    created_at: datetime = Field(default_factory=datetime.utcnow)

