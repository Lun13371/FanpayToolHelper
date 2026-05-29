from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship

class LotSettings(SQLModel, table=True):
    __tablename__ = "lot_settings"

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="fanpay_accounts.id", nullable=False)
    
    # ID лота на Fanpay (например, "123456")
    lot_id: str = Field(nullable=False, index=True)
    lot_name: str = Field(nullable=False)
    
    # Минимальная цена демпинга (меньше нее не опускаемся)
    min_price: float = Field(nullable=False)
    
    # На сколько копеек/рублей снижать цену (например, 0.01 или 1)
    undercut_value: float = Field(default=0.01, nullable=False)
    
    is_active: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Отношения
    account: "FanpayAccount" = Relationship(back_populates="lot_settings")
