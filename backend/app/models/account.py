from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Relationship, JSON
from sqlalchemy import Column

class FanpayAccount(SQLModel, table=True):
    __tablename__ = "fanpay_accounts"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", nullable=False)
    name: str = Field(nullable=False) # Название для удобства
    
    # Токен golden_key. Должен быть скрыт для менеджеров!
    golden_key: str = Field(nullable=False)
    
    # Прокси опционален для dev среды, но обязателен для продакшена
    proxy_url: Optional[str] = Field(default=None)
    
    is_active: bool = Field(default=False)
    telegram_chat_id: Optional[str] = Field(default=None)
    user_agent: Optional[str] = Field(default=None)
    
    # Сессионные куки сохраняются в формате JSON
    cookies: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    
    last_status: Optional[str] = Field(default="Not Started")
    system_prompt: str = Field(default="Ты вежливый менеджер магазина. Отвечай кратко и помогай клиенту.")
    fallback_template: str = Field(default="В данный момент линия поддержки перегружена. Оператор ответит вам в течение нескольких минут.")
    
    # Гео-данные прокси/подключения
    ip_address: Optional[str] = Field(default=None)
    geo_location: Optional[str] = Field(default=None)
    
    # Статистика аккаунта с Funpay
    funpay_user_id: Optional[str] = Field(default=None)
    balance: float = Field(default=0.0)
    rating: float = Field(default=0.0)
    reviews_count: int = Field(default=0)
    last_raised: Optional[datetime] = Field(default=None)
    
    # Таймстамп последнего ручного ответа оператора в чате Funpay для засыпания ИИ на 20 минут
    last_operator_activity: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Отношения
    user: "User" = Relationship(back_populates="accounts")
    lot_settings: List["LotSettings"] = Relationship(back_populates="account", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    delivery_items: List["AutoDeliveryItem"] = Relationship(back_populates="account", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    review_templates: List["AutoReviewTemplate"] = Relationship(back_populates="account", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    blacklist_competitors: List["CompetitorBlacklist"] = Relationship(back_populates="account", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    logs: List["SystemLogs"] = Relationship(back_populates="account", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
