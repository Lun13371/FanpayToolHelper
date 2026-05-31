from typing import Optional
from sqlmodel import SQLModel, Field

class FunpayGlobalCategory(SQLModel, table=True):
    __tablename__ = "funpay_global_categories"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    game_name: str = Field(nullable=False, index=True)
    subcategory_name: str = Field(nullable=False)
    node_id: str = Field(nullable=False, unique=True, index=True)
    category_type: str = Field(nullable=False) # "lots" or "chips"
