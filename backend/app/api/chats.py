from typing import Any, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.models.account import FanpayAccount
from app.services.fanpay_client import FanpayClient
from app.api.accounts import check_manager_permission, verify_account_access

router = APIRouter(prefix="/accounts/{account_id}/chats", tags=["Кабинет: Мессенджер"])

class ChatResponse(BaseModel):
    node_id: str
    username: str
    avatar_url: str | None
    last_message: str
    is_unread: bool
    unread_count: int

class MessageResponse(BaseModel):
    author: str
    text: str
    is_me: bool
    time: str
    is_system: bool = False

class MessageSend(BaseModel):
    text: str = Field(..., description="Текст сообщения для отправки")


@router.get("", response_model=List[ChatResponse])
async def list_chats(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить список всех активных диалогов аккаунта."""
    await verify_account_access(db, current_user, account_id)
    
    account = await db.get(FanpayAccount, account_id)
    if not account or not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию аккаунта")

    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies,
        account_id=account_id
    )

    try:
        chats = await client.get_chats()
        return chats
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка парсинга чатов: {str(e)}")


@router.get("/{node_id}/messages", response_model=List[MessageResponse])
async def list_chat_messages(
    account_id: int,
    node_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить историю сообщений для конкретного диалога (node_id)."""
    await verify_account_access(db, current_user, account_id)
    
    account = await db.get(FanpayAccount, account_id)
    if not account or not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию аккаунта")

    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies,
        account_id=account_id
    )

    try:
        messages = await client.get_chat_messages(node_id)
        return messages
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка получения переписки: {str(e)}")


@router.post("/{node_id}/send")
async def send_operator_message(
    account_id: int,
    node_id: str,
    data: MessageSend,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Отправить ручной ответ оператора. При ответе ИИ-автоответчик засыпает на 20 минут."""
    await verify_account_access(db, current_user, account_id)
    
    account = await db.get(FanpayAccount, account_id)
    if not account or not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию аккаунта")

    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies,
        account_id=account_id
    )

    success = await client.send_message(node_id, data.text)
    if not success:
        raise HTTPException(status_code=400, detail="Не удалось отправить сообщение на Funpay")

    # Обновляем таймстамп активности оператора (ИИ засыпает на 20 минут)
    account.last_operator_activity = datetime.utcnow()
    db.add(account)
    await db.commit()

    return {"success": True, "message": "Сообщение успешно отправлено, ИИ автоответчик приостановлен на 20 минут"}


# =========================================================================
# WEBSOCKET ЭНДПОИНТ ДЛЯ ЖИВЫХ СООБЩЕНИЙ ЧАТА
# =========================================================================

@router.websocket("/ws")
async def websocket_chats_endpoint(
    websocket: WebSocket,
    account_id: int,
    db: AsyncSession = Depends(get_session)
):
    """
    WebSocket-подключение для получения обновлений чатов и переписок в реальном времени.
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4003)  # Forbidden
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
    from sqlmodel import select
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

    # Подключаем клиента к менеджеру трансляций чата
    from app.services.chat_broadcast import chat_broadcast_manager
    await chat_broadcast_manager.connect(websocket, account_id)
    
    try:
        while True:
            # Удерживаем сокет открытым
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        chat_broadcast_manager.disconnect(websocket, account_id)

