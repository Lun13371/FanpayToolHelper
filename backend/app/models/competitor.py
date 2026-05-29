from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship

class CompetitorBlacklist(SQLModel, table=True):
    __tablename__ = "competitor_blacklist"

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="fanpay_accounts.id", nullable=False)
    
    # Никнейм конкурента на Fanpay
    username: str = Field(nullable=False, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Отношения
    account: "FanpayAccount" = Relationship(back_populates="blacklist_competitors")
