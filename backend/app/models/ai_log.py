from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class AILog(SQLModel, table=True):
    __tablename__ = "ai_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    key_id: Optional[int] = Field(default=None, foreign_key="ai_keys.id", nullable=True)
    model: str = Field(nullable=False)
    action_type: str = Field(nullable=False) # 'chat_reply', 'profile_audit', 'review_classification', etc.
    
    prompt: str = Field(nullable=False)
    response: Optional[str] = Field(default=None, nullable=True)
    status: str = Field(default="success") # 'success', 'error'
    
    prompt_tokens: int = Field(default=0)
    completion_tokens: int = Field(default=0)
    total_tokens: int = Field(default=0)
    
    error_message: Optional[str] = Field(default=None, nullable=True)
    account_id: Optional[int] = Field(default=None, foreign_key="fanpay_accounts.id", nullable=True)
