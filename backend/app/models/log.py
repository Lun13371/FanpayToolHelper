from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship

class SystemLogs(SQLModel, table=True):
    __tablename__ = "system_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="fanpay_accounts.id", nullable=False)
    
    level: str = Field(default="INFO") # INFO, WARNING, ERROR
    message: str = Field(nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Отношения
    account: "FanpayAccount" = Relationship(back_populates="logs")
