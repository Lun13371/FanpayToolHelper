from datetime import datetime
from enum import Enum
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

class UserRole(str, Enum):
    ADMIN = "admin"       # Главный супер-администратор
    OWNER = "owner"       # Владелец магазина
    MANAGER = "manager"   # Наемный сотрудник / менеджер

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True, nullable=False)
    hashed_password: str = Field(nullable=False)
    role: UserRole = Field(default=UserRole.OWNER, nullable=False)
    
    # ID владельца, к которому привязан данный менеджер (для роли manager)
    parent_id: Optional[int] = Field(default=None, foreign_key="users.id")
    
    # Новые пользователи висят в ожидания одобрения (pending), если не админ
    is_approved: bool = Field(default=False)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Отношения
    accounts: List["FanpayAccount"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
