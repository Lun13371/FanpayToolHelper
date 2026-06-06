from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, JSON, Column
from sqlalchemy import Text, Integer
from pgvector.sqlalchemy import Vector
from datetime import datetime


class AgentRun(SQLModel, table=True):
    __tablename__ = "agent_runs"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    status: str = Field(default="idle", index=True)   # idle | running | completed | failed
    mode: str = Field(default="auto")                  # auto | manual
    limit_categories: int = Field(default=5)
    target_account_id: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(default=None)
    total_cost_tokens: int = Field(default=0)
    # Прогресс категорий: сколько обработано / всего
    categories_done: int = Field(default=0)
    categories_total: int = Field(default=0)

    # ─── Настройки анализа ───────────────────────────────────────────────────
    # Типы лотов через запятую: "classic,digital,resell,service"
    lot_types: str = Field(default="classic,digital,resell,service")
    focus_mode: str = Field(default="balanced")         # balanced|profit|volume|speed
    price_strategy: str = Field(default="auto")         # auto|undercut|median|premium
    min_margin_pct: float = Field(default=10.0)
    generate_seo: bool = Field(default=True)
    prefer_no_account: bool = Field(default=False)
    max_price: Optional[float] = Field(default=None)
    min_competition: Optional[int] = Field(default=None)

    @property
    def lot_types_list(self) -> list:
        return [t.strip() for t in self.lot_types.split(",") if t.strip()]


class AgentState(SQLModel, table=True):
    __tablename__ = "agent_states"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)

    # Иерархия: главный агент / суб-агент
    agent_name: str = Field(index=True)          # "MarketScraper", "CopywriterAgent" …
    parent_agent: Optional[str] = Field(default=None, index=True)  # "ListingAnalyzer"
    # Контекст (какая категория обрабатывается)
    category_context: Optional[str] = Field(default=None)          # "Dota 2 / Услуги"

    status: str = Field(default="pending", index=True)  # pending | running | completed | failed | skipped
    current_task: Optional[str] = Field(default=None)
    progress: int = Field(default=0)             # 0-100 внутри суб-агента
    tokens_used: int = Field(default=0)
    retry_count: int = Field(default=0)
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AgentLog(SQLModel, table=True):
    __tablename__ = "agent_logs"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)
    agent_name: str = Field(index=True)
    parent_agent: Optional[str] = Field(default=None, index=True)
    category_context: Optional[str] = Field(default=None)
    message: str = Field(nullable=False)
    level: str = Field(default="info")           # info | warning | error | success
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
    # Ценовые данные от PricingAgent
    price_min_market: Optional[float] = Field(default=None)
    price_max_market: Optional[float] = Field(default=None)
    price_avg_market: Optional[float] = Field(default=None)
    price_strategy: Optional[str] = Field(default=None)   # "undercut" | "premium" | "median"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # --- Тип лота ---
    # "classic"  — обычный (валюта, аккаунт, буст) — нужен игровой ресурс
    # "digital"  — цифровой файл/гайд — нужно только создать файл, не нужен аккаунт в игре
    # "resell"   — перепродажа: купил у другого продавца дешевле → продаёшь дороже
    # "service"  — услуга без аккаунта (консультация, помощь, скрипт)
    lot_type: str = Field(default="classic", index=True)

    # --- RESELL: источник поставки ---
    resell_source_url: Optional[str] = Field(default=None)
    resell_source_price: Optional[float] = Field(default=None)
    resell_margin_pct: Optional[float] = Field(default=None)  # маржа % после комиссии FunPay (7%)

    # --- DIGITAL: идея и сложность создания ---
    digital_content_idea: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    digital_difficulty: Optional[str] = Field(default=None)  # "easy" | "medium" | "hard"


class AgentInsight(SQLModel, table=True):
    __tablename__ = "agent_insights"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: int = Field(foreign_key="agent_runs.id", index=True)
    game_name: str = Field(nullable=False, index=True)
    subcategory_name: str = Field(nullable=False)
    insight_type: str = Field(nullable=False, index=True)
    content: str = Field(sa_column=Column(Text, nullable=False))
    embedding: Any = Field(sa_column=Column(Vector(4096), nullable=True))
    created_at: datetime = Field(default_factory=datetime.utcnow)
