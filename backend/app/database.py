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
async def init_db() -> None:
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

        await conn.run_sync(SQLModel.metadata.create_all)
        
    # Добавляем колонки динамически, каждая в СВОЕЙ изолированной транзакции
    from sqlalchemy import text
    
    # 1. ip_address
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN ip_address VARCHAR(255)"))
    except Exception:
        pass # Колонка уже существует или другая ошибка
        
    # 2. geo_location
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN geo_location VARCHAR(255)"))
    except Exception:
        pass
        
    # 3. last_synced
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN last_synced TIMESTAMP"))
    except Exception:
        pass
        
    # 4. lots_cache
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN lots_cache JSON"))
    except Exception:
        pass
        
    # 5. next_raise
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN next_raise TIMESTAMP"))
    except Exception:
        pass

    # 6. ai_audit_cache
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN ai_audit_cache TEXT"))
    except Exception:
        pass

    # 7. ai_audit_created_at
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN ai_audit_created_at TIMESTAMP"))
    except Exception:
        pass

    # 8. reviews_cache
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN reviews_cache JSON"))
    except Exception:
        pass

    # 9. sales_stats_cache
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN sales_stats_cache JSON"))
    except Exception:
        pass

    # 10. global_damping_active
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN global_damping_active BOOLEAN DEFAULT FALSE"))
    except Exception:
        pass

    # 11. global_undercut_value
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN global_undercut_value FLOAT DEFAULT 0.01"))
    except Exception:
        pass

    # 12. global_min_price
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN global_min_price FLOAT DEFAULT 0.0"))
    except Exception:
        pass

    # 13. always_online
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN always_online BOOLEAN DEFAULT TRUE"))
    except Exception:
        pass

    # 14. auto_raise_active
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN auto_raise_active BOOLEAN DEFAULT TRUE"))
    except Exception:
        pass

    # 15. auto_delivery_active
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN auto_delivery_active BOOLEAN DEFAULT TRUE"))
    except Exception:
        pass

    # 16. ai_reply_active
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN ai_reply_active BOOLEAN DEFAULT TRUE"))
    except Exception:
        pass

    # 17. operator_snooze_minutes
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN operator_snooze_minutes INTEGER DEFAULT 20"))
    except Exception:
        pass

    # 18. review_followup_active
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE fanpay_accounts ADD COLUMN review_followup_active BOOLEAN DEFAULT TRUE"))
    except Exception:
        pass
