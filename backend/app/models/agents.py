from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, JSON, Column
from sqlalchemy import Text
from pgvector.sqlalchemy import Vector
from datetime import datetime

class AgentRun(SQLModel, table=True):
    __tablename__ = "agent_runs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    status: str = Field(default="idle", index=True)  # idle, running, completed, failed
    mode: str = Field(default="auto")  # auto, manual, full
    limit_categories: int = Field(default=5)
    target_account_id: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(default=None)
    total_cost_tokens: int = Field(default=0)

class AgentState(SQLModel, table=True):
    __tablename__ = "agent_states"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)
    agent_name: str = Field(index=True)  # CategorySelector, ListingAnalyzer, LotGenerator
    status: str = Field(default="pending", index=True)  # pending, running, completed, failed
    current_task: Optional[str] = Field(default=None)
    tokens_used: int = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AgentLog(SQLModel, table=True):
    __tablename__ = "agent_logs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)
    agent_name: str = Field(index=True)
    message: str = Field(nullable=False)
    level: str = Field(default="info")  # info, warning, error
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GeneratedLot(SQLModel, table=True):
    __tablename__ = "generated_lots"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)
    game_name: str = Field(nullable=False, index=True)
    subcategory_name: str = Field(nullable=False)
    title: str = Field(nullable=False)
    description: str = Field(sa_column=Column(Text, nullable=False))
    price: float = Field(default=0.0)
    amount: int = Field(default=1)
    fields_json: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    ai_reasoning: str = Field(sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AgentInsight(SQLModel, table=True):
    __tablename__ = "agent_insights"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)
    game_name: str = Field(nullable=False, index=True)
    subcategory_name: str = Field(nullable=False)
    insight_type: str = Field(nullable=False, index=True)  # trend, demand, automation_potential, competitor_strategy
    content: str = Field(sa_column=Column(Text, nullable=False))
    # Вектор эмбеддингов Fireworks qwen3-embedding-8b размерности 4096
    embedding: Any = Field(sa_column=Column(Vector(4096), nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
