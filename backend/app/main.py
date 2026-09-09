import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.services.scheduler import scheduler_manager
from app.api.auth import router as auth_router
from app.api.accounts import router as accounts_router
from app.api.lots import router as lots_router, accounts_lots_router
from app.api.analytics import router as analytics_router
from app.api.lot_templates import router as templates_router
from app.api.chats import router as chats_router
from app.api.delivery import router as delivery_router
from app.api.ai_keys import router as ai_keys_router
from app.api.ai_settings import router as ai_settings_router
from app.api.logs import router as logs_router, ws_router as logs_ws_router
from app.api.agents import router as agents_router
from app.api.chat import router as chat_router

# Настраиваем логирование для приложения
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("fanpay.main")

app = FastAPI(
    title="Fanpay Helper API",
    description="Многопользовательская премиальная панель управления автоматизацией Funpay",
    version="1.0.0"
)

# Настройка CORS для взаимодействия с React-фронтендом (Vite)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роуты REST API
app.include_router(auth_router, prefix="/api/v1")
app.include_router(accounts_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(lots_router, prefix="/api/v1")
app.include_router(accounts_lots_router, prefix="/api/v1")
app.include_router(templates_router, prefix="/api/v1")
app.include_router(chats_router, prefix="/api/v1")
app.include_router(delivery_router, prefix="/api/v1")
app.include_router(ai_keys_router, prefix="/api/v1")
app.include_router(ai_settings_router, prefix="/api/v1")
app.include_router(agents_router, prefix="/api/v1")
app.include_router(chat_router, prefix="/api/v1")
app.include_router(logs_router, prefix="/api/v1")     # REST /api/v1/logs
app.include_router(logs_ws_router)                    # WebSocket /ws/logs/{account_id}


# =========================================================================
# ЖИЗНЕННЫЙ ЦИКЛ ПРИЛОЖЕНИЯ (Startup / Shutdown)
# =========================================================================

@app.on_event("startup")
async def startup_event():
    """Событие запуска приложения."""
    logger.info("Инициализация базы данных...")
    await init_db()

    logger.info("Запуск фонового планировщика задач...")
    scheduler_manager.start()

    logger.info("Синхронизация и запуск ботов для активных аккаунтов...")
    await scheduler_manager.sync_all_active_accounts()

    # Фиксим зависшие agent_runs со статусом 'running' после рестарта
    # (ACTIVE_TASKS очищается при перезапуске процесса, задачи теряются)
    from app.database import async_session_maker
    from app.models.agents import AgentRun
    from app.models.ai_key import AIKey
    from sqlmodel import select
    from datetime import datetime as _dt
    async with async_session_maker() as session:
        # Сбрасываем зависшие runs
        res = await session.execute(select(AgentRun).where(AgentRun.status == "running"))
        stale_runs = res.scalars().all()
        if stale_runs:
            logger.warning(f"Найдено {len(stale_runs)} зависших запусков — сбрасываем статус в 'failed'")
            for r in stale_runs:
                r.status = "failed"
                r.completed_at = _dt.utcnow()
                session.add(r)
            await session.commit()

        # Сбрасываем error_count у деактивированных ключей — могли накопить ошибки из-за rate limit
        key_res = await session.execute(select(AIKey).where(AIKey.is_active == False))
        deactivated_keys = key_res.scalars().all()
        if deactivated_keys:
            logger.info(f"Сброс error_count для {len(deactivated_keys)} деактивированных ключей")
            for k in deactivated_keys:
                k.error_count = 0
                k.is_active = True
                session.add(k)
            await session.commit()

    logger.info("Приложение Fanpay Helper успешно запущено и готово к работе!")


@app.on_event("shutdown")
async def shutdown_event():
    """Событие остановки приложения."""
    logger.info("Остановка планировщика фоновых задач...")
    scheduler_manager.shutdown()
    logger.info("Приложение Fanpay Helper остановлено.")
