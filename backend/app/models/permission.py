from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class ManagerPermission(SQLModel, table=True):
    __tablename__ = "manager_permissions"

    id: Optional[int] = Field(default=None, primary_key=True)
    manager_id: int = Field(foreign_key="users.id", nullable=False)
    account_id: int = Field(foreign_key="fanpay_accounts.id", nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
