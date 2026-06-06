from typing import Any, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.models.log import SystemLogs
from app.api.accounts import verify_account_access
from app.services.log_broadcast import log_broadcast_manager

router = APIRouter(tags=["Логи ботов"])
ws_router = APIRouter(tags=["WebSocket логи"])

class LogResponse(BaseModel):
    id: int
    account_id: int
    level: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/logs", response_model=List[LogResponse])
async def get_account_logs(
    account_id: int,
    limit: int = 100,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить историю логов для выбранного аккаунта (Лимит: по умолчанию 100)."""
    await verify_account_access(db, current_user, account_id)

    query = (
        select(SystemLogs)
        .where(SystemLogs.account_id == account_id)
        .order_by(SystemLogs.created_at.desc())
        .limit(limit)
    )
    res = await db.execute(query)
    
    # Так как мы получили их от новых к старым (desc), развернем обратно, чтобы лог шел по порядку
    logs = res.scalars().all()
    logs.reverse()
    return logs


# =========================================================================
# WEBSOCKET ЭНДПОИНТ ДЛЯ ЖИВЫХ ЛОГОВ
# =========================================================================

# WebSocket эндпоинт на отдельном роутере (без /api/v1 prefix)
@ws_router.websocket("/ws/logs/{account_id}")
async def websocket_logs_endpoint(
    websocket: WebSocket,
    account_id: int,
    db: AsyncSession = Depends(get_session)
):
    """
    WebSocket-подключение для получения логов работы выбранного бота в реальном времени.
    """
    # 1. Мы не можем использовать Depends(get_current_user) стандартным способом OAuth2 в WebSockets,
    # поэтому мы извлекаем токен из query параметров (token=...) или заголовков.
    # Для максимальной простоты и надежности извлечем токен из query параметров: ?token=...
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4003) # Forbidden
        return

    try:
        from jose import jwt
        from app.config import settings
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        username: str = payload.get("sub")
        if not username:
             await websocket.close(code=4003)
             return
    except Exception:
        await websocket.close(code=4003)
        return

    # Подгружаем юзера из БД
    query_user = select(User).where(User.username == username)
    res_user = await db.execute(query_user)
    user = res_user.scalar_one_or_none()
    
    if not user or not user.is_active or (not user.is_approved and user.role != UserRole.ADMIN):
        await websocket.close(code=4003)
        return

    # Проверяем права доступа к аккаунту
    try:
        await verify_account_access(db, user, account_id)
    except HTTPException:
        await websocket.close(code=4003)
        return

    # 2. Подключаем клиента к менеджеру трансляций
    await log_broadcast_manager.connect(websocket, account_id)
    
    try:
        # Удерживаем соединение открытым, слушая входящие данные (если есть) или пинг-понги
        while True:
            # Нам не нужно получать данные от клиента, но этот вызов необходим,
            # чтобы вовремя обнаружить разрыв соединения
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        # 3. При отключении убираем клиента из трансляций
        log_broadcast_manager.disconnect(websocket, account_id)
