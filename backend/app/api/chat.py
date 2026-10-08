"""API AI-чата: сессии, список моделей, SSE-стриминг диалога с тулами."""
import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session, async_session_maker
from app.api.deps import get_current_user
from app.models.user import User
from app.models.chat import ChatSession, ChatMessage
from app.services import llm_client, chat_engine

logger = logging.getLogger("fanpay.chat_api")

router = APIRouter(prefix="/chat", tags=["AI Чат"])


# ---------------------------------------------------------------------------
# Схемы
# ---------------------------------------------------------------------------

class ChatModelInfo(BaseModel):
    id: str
    display_name: Optional[str] = None
    status: Optional[str] = None
    supports_tools: Optional[bool] = None
    supports_streaming: Optional[bool] = None
    pricing: Optional[dict] = None


class ChatSessionCreate(BaseModel):
    title: str = Field(default="Новый чат")
    model: str = Field(default="")


class ChatSessionResponse(BaseModel):
    id: int
    title: str
    model: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatMessageResponse(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    tool_name: Optional[str] = None
    tool_payload: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatStreamPayload(BaseModel):
    session_id: Optional[int] = None
    message: str = Field(..., min_length=1, max_length=8000)
    model: Optional[str] = None


# ---------------------------------------------------------------------------
# Модели гейтвея (доступно всем аутентифицированным)
# ---------------------------------------------------------------------------

@router.get("/models", response_model=List[ChatModelInfo])
async def list_chat_models(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Доступные модели гейтвея для чата (только status=available)."""
    try:
        models = await llm_client.fetch_gateway_models(db)
    except Exception as e:
        logger.warning(f"Не удалось получить список моделей: {e}")
        # Fallback — модели из настроек
        cfg = await llm_client.get_ai_settings(db)
        fallback = [m for m in (cfg.text_model, cfg.vision_model, cfg.cheap_model) if m]
        return [ChatModelInfo(id=m, display_name=m, status="available", supports_tools=True) for m in fallback]

    available = [m for m in models if m.get("status") == "available"]
    return [
        ChatModelInfo(
            id=m.get("id", ""),
            display_name=m.get("display_name"),
            status=m.get("status"),
            supports_tools=m.get("supports_tools"),
            supports_streaming=m.get("supports_streaming"),
            pricing=m.get("pricing"),
        )
        for m in available
    ]


# ---------------------------------------------------------------------------
# Сессии
# ---------------------------------------------------------------------------

async def _get_owned_session(db: AsyncSession, user: User, session_id: int) -> ChatSession:
    session = await db.get(ChatSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(status_code=404, detail="Чат не найден")
    return session


@router.get("/sessions", response_model=List[ChatSessionResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Any:
    res = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc())
    )
    return res.scalars().all()


@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    data: ChatSessionCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Any:
    session = ChatSession(
        user_id=current_user.id,
        title=data.title or "Новый чат",
        model=data.model or "",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    session = await _get_owned_session(db, current_user, session_id)
    # Удаляем сообщения сессии
    res = await db.execute(select(ChatMessage).where(ChatMessage.session_id == session_id))
    for msg in res.scalars().all():
        await db.delete(msg)
    await db.delete(session)
    await db.commit()
    return None


@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageResponse])
async def list_messages(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Any:
    await _get_owned_session(db, current_user, session_id)
    res = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.asc())
    )
    return res.scalars().all()


class LotEditDecision(BaseModel):
    confirm: bool


@router.post("/lot-edits/{message_id}/decision")
async def decide_lot_edit(
    message_id: int,
    payload: LotEditDecision,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Any:
    from app.api.accounts import verify_account_access
    from app.models.account import FanpayAccount
    from app.services.fanpay_client import FanpayClient
    from app.services.lot_patch import validate_lot_patch, validate_existing_lot_form

    res = await db.execute(select(ChatMessage).where(ChatMessage.id == message_id).with_for_update())
    msg = res.scalar_one_or_none()
    if not msg:
        raise HTTPException(404, "Предложение не найдено")
    await _get_owned_session(db, current_user, msg.session_id)
    ui = (msg.tool_payload or {}).get("ui") or {}
    request = ui.get("request") or {}
    if ui.get("type") != "update_lot_request" or request.get("action") != "update_lot":
        raise HTTPException(400, "Это не предложение редактирования лота")
    if request.get("status") != "pending":
        raise HTTPException(409, "Предложение уже обработано. Для повтора создай новое")
    await verify_account_access(db, current_user, request["account_id"])
    account = await db.get(FanpayAccount, request["account_id"])
    if not account or not account.cookies:
        raise HTTPException(400, "Нужен верифицированный аккаунт")

    async def persist(state: str, error: Optional[str] = None) -> None:
        updated = {**request, "status": state, **({"error": error} if error else {})}
        msg.tool_payload = {**msg.tool_payload, "ui": {**ui, "request": updated}}
        db.add(msg)
        await db.commit()

    if not payload.confirm:
        await persist("cancelled")
        return {"status": "cancelled"}
    # Durable claim prevents a double-click/reloaded history from saving twice.
    await persist("executing")
    try:
        client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
        details = await client.get_lot_details(request["lot_id"])
        fields = details.get("fields") or {}
        validate_existing_lot_form(details, request["lot_id"])
        changes = request["changes"]
        patch = validate_lot_patch(details, {c["key"]: c["after"] for c in changes})
        for c in changes:
            if str(fields.get(c["key"], "")) != str(c["before"]):
                raise ValueError(f"Поле {c['label']} изменилось после предложения. Запроси новое подтверждение")
        checkbox_keys = {f["name"] for f in details.get("form_fields", []) if f.get("type") == "checkbox"}
        save_patch = {k: (v == "1" if k in checkbox_keys else v) for k, v in patch.items()}
        ok = await client.save_lot_settings(request["lot_id"], fields, custom_fields=save_patch)
        if not ok:
            raise ValueError("Funpay не подтвердил сохранение лота")
        # Refresh cached summaries without making a second remote write.
        cache = [dict(lot) for lot in (account.lots_cache or [])]
        for lot in cache:
            if str(lot.get("id") or lot.get("lot_id")) == request["lot_id"]:
                if "price" in patch:
                    lot["price"] = float(patch["price"])
                if "amount" in patch:
                    lot["amount"] = int(patch["amount"])
                if "fields[summary][ru]" in patch:
                    lot["name"] = patch["fields[summary][ru]"]
        account.lots_cache = cache
        account.last_synced = None
        db.add(account)
        await persist("confirmed")
    except Exception as e:
        await persist("failed", str(e))
        raise HTTPException(400, str(e)) from e
    return {"status": "confirmed", "lot_id": request["lot_id"], "changes": patch}


# ---------------------------------------------------------------------------
# SSE-стриминг диалога
# ---------------------------------------------------------------------------

@router.post("/stream")
async def stream_chat(
    payload: ChatStreamPayload,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Один ход диалога: стриминг токенов, тул-вызовов и UI-событий через SSE."""
    # Валидация и подготовка — до старта генератора
    if payload.session_id:
        session = await _get_owned_session(db, current_user, payload.session_id)
    else:
        title = payload.message.strip()[:50] or "Новый чат"
        session = ChatSession(
            user_id=current_user.id,
            title=title,
            model=payload.model or "",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

    session_id = session.id
    session_title = session.title
    user = current_user

    async def event_generator():
        q: asyncio.Queue[str] = asyncio.Queue()

        def emit(event: dict) -> None:
            try:
                q.put_nowait(f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n")
            except Exception:
                pass

        async def run_turn() -> None:
            try:
                async with async_session_maker() as gen_db:
                    # Сохраняем сообщение пользователя
                    await chat_engine.save_message(gen_db, session_id, "user", payload.message)
                    await chat_engine.run_chat_turn(
                        gen_db, user, await gen_db.get(ChatSession, session_id),
                        payload.message, payload.model, emit,
                    )
            except Exception as e:
                logger.exception(f"Ошибка хода чата (session {session_id}): {e}")
                emit({"type": "error", "message": f"Ошибка: {e}"})
            finally:
                emit({"type": "done"})

        emit({"type": "session", "session_id": session_id, "title": session_title})

        task = asyncio.create_task(run_turn())
        try:
            while True:
                if task.done() and q.empty():
                    break
                try:
                    line = await asyncio.wait_for(q.get(), timeout=0.25)
                    yield line
                except asyncio.TimeoutError:
                    continue
            await task
        except asyncio.CancelledError:
            # Клиент отключился (кнопка «Стоп» / закрытие вкладки)
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
            raise

    return StreamingResponse(event_generator(), media_type="text/event-stream")
