from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship

class AutoReviewTemplate(SQLModel, table=True):
    __tablename__ = "auto_review_templates"

    id: Optional[int] = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="fanpay_accounts.id", nullable=False)
    
    # Текст отзыва покупателю (например: "Спасибо за покупку! Ждем вас снова.")
    text: str = Field(nullable=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Отношения
    account: "FanpayAccount" = Relationship(back_populates="review_templates")
