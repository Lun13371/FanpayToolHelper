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
from app.api.logs import router as logs_router
from app.api.agents import router as agents_router

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
app.include_router(agents_router, prefix="/api/v1")
app.include_router(logs_router) # Роутер логов содержит WebSockets, подключаем напрямую


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
    
    logger.info("Приложение Fanpay Helper успешно запущено и готово к работе!")


@app.on_event("shutdown")
async def shutdown_event():
    """Событие остановки приложения."""
    logger.info("Остановка планировщика фоновых задач...")
    scheduler_manager.shutdown()
    logger.info("Приложение Fanpay Helper остановлено.")
