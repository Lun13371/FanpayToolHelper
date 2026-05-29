from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship

class AutoDeliveryItem(SQLModel, table=True):
    __tablename__ = "auto_delivery_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="fanpay_accounts.id", nullable=False)
    
    # Можно сопоставлять по ID категории или по точному названию лота
    category_id: Optional[str] = Field(default=None, index=True)
    lot_name: Optional[str] = Field(default=None, index=True)
    
    # Текст выдачи (ключ, ссылка, файл, инструкция)
    content: str = Field(nullable=False)
    
    # Флаг многоразового товара (многоразовые ссылки выдаются бесконечно, одноразовые ключи списываются)
    is_multi_use: bool = Field(default=False)
    
    # Помечен ли уникальный товар как проданный
    is_sold: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Отношения
    account: "FanpayAccount" = Relationship(back_populates="delivery_items")
