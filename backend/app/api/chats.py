from typing import Any, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
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
        cookies=account.cookies
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
        cookies=account.cookies
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
        cookies=account.cookies
    )

    success = await client.send_message(node_id, data.text)
    if not success:
        raise HTTPException(status_code=400, detail="Не удалось отправить сообщение на Funpay")

    # Обновляем таймстамп активности оператора (ИИ засыпает на 20 минут)
    account.last_operator_activity = datetime.utcnow()
    db.add(account)
    await db.commit()

    return {"success": True, "message": "Сообщение успешно отправлено, ИИ автоответчик приостановлен на 20 минут"}
