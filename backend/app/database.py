from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel
from app.config import settings

# Инициализируем асинхронный движок SQLAlchemy через SQLModel
# echo=False для продакшена, чтобы не засорять логи SQL-запросами
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_size=20,
    max_overflow=10,
    pool_recycle=3600
)

# Фабрика асинхронных сессий
async_session_maker = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Асинхронный генератор сессий для эндпоинтов FastAPI (FastAPI Depend)
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session

# Функция для автоматического создания таблиц (при первом запуске без Alembic)
# ВНИМАНИЕ: Для управления схемой используйте Alembic миграции:
#   cd backend && alembic revision --autogenerate -m "description"
#   cd backend && alembic upgrade head
async def init_db() -> None:
    from sqlalchemy import text
    # Включаем расширение pgvector для работы векторных эмбеддингов
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception:
        pass

    async with engine.begin() as conn:
        # Импортируем все модели перед созданием, чтобы SQLModel знал о них
        from app.models.user import User
        from app.models.account import FanpayAccount
        from app.models.permission import ManagerPermission
        from app.models.lot import LotSettings
        from app.models.lot_template import LotTemplate, LotCreationTemplate
        from app.models.delivery import AutoDeliveryItem
        from app.models.review import AutoReviewTemplate
        from app.models.competitor import CompetitorBlacklist
        from app.models.ai_key import AIKey
        from app.models.ai_log import AILog
        from app.models.log import SystemLogs
        from app.models.global_category import FunpayGlobalCategory
        from app.models.agents import AgentRun, AgentState, AgentLog, GeneratedLot, AgentInsight

        await conn.run_sync(SQLModel.metadata.create_all)
