"""API настроек ИИ — подключение к Syntee Gateway и выбор моделей."""
from typing import Any, Dict, List, Optional
from datetime import datetime
import time as _time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.api.deps import get_current_admin
from app.models.user import User
from app.services import llm_client

router = APIRouter(prefix="/ai-settings", tags=["Настройки ИИ (Syntee Gateway)"])


class AISettingsResponse(BaseModel):
    gateway_url: str
    text_model: str
    vision_model: str
    cheap_model: str
    embedding_model: str
    updated_at: datetime


class AISettingsUpdate(BaseModel):
    gateway_url: str
    text_model: str = ""
    vision_model: str = ""
    cheap_model: str = ""
    embedding_model: str = ""


class GatewayModelInfo(BaseModel):
    id: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    supports_vision: Optional[bool] = None
    supports_tools: Optional[bool] = None
    supports_streaming: Optional[bool] = None
    max_tokens: Optional[int] = None
    pricing: Optional[dict] = None


@router.get("", response_model=AISettingsResponse)
async def get_ai_settings(
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin),
) -> Any:
    """Текущие настройки ИИ (Syntee Gateway). Только для админа."""
    cfg = await llm_client.get_ai_settings(db)
    return AISettingsResponse(
        gateway_url=cfg.gateway_url,
        text_model=cfg.text_model,
        vision_model=cfg.vision_model,
        cheap_model=cfg.cheap_model,
        embedding_model=cfg.embedding_model,
        updated_at=cfg.updated_at,
    )


@router.put("", response_model=AISettingsResponse)
async def update_ai_settings(
    data: AISettingsUpdate,
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin),
) -> Any:
    """Сохранить URL гейтвея и выбранные модели. Только для админа."""
    url = data.gateway_url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL гейтвея должен начинаться с http:// или https://")

    cfg = await llm_client.get_ai_settings(db)
    cfg.gateway_url = url
    cfg.text_model = (data.text_model or "").strip()
    cfg.vision_model = (data.vision_model or "").strip()
    cfg.cheap_model = (data.cheap_model or "").strip()
    cfg.embedding_model = (data.embedding_model or "").strip()
    cfg.updated_at = datetime.utcnow()

    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)

    # Сбрасываем кэш списка моделей — URL мог измениться
    llm_client.invalidate_models_cache()

    return AISettingsResponse(
        gateway_url=cfg.gateway_url,
        text_model=cfg.text_model,
        vision_model=cfg.vision_model,
        cheap_model=cfg.cheap_model,
        embedding_model=cfg.embedding_model,
        updated_at=cfg.updated_at,
    )


@router.get("/models", response_model=List[GatewayModelInfo])
async def list_gateway_models(
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin),
) -> Any:
    """Список групп моделей с гейтвея (цены, статусы, capabilities). Только для админа."""
    try:
        models = await llm_client.fetch_gateway_models(db, force=True)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось получить список моделей гейтвея: {e}",
        )
    return [
        GatewayModelInfo(
            id=m.get("id", ""),
            display_name=m.get("display_name"),
            description=m.get("description"),
            status=m.get("status"),
            supports_vision=m.get("supports_vision"),
            supports_tools=m.get("supports_tools"),
            supports_streaming=m.get("supports_streaming"),
            max_tokens=m.get("max_tokens"),
            pricing=m.get("pricing"),
        )
        for m in models
    ]


@router.post("/test")
async def test_gateway(
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin),
) -> Dict[str, Any]:
    """
    Проверка соединения с Syntee Gateway:
    1) GET /models с активным ключом (проверка авторизации)
    2) Мини-запрос chat/completions (проверка inference-пути)
    """
    key = await llm_client._pick_key(db)
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Нет активных ключей ИИ — добавьте ключи sk-syntee-... во вкладке «Глобальные ключи»",
        )

    try:
        models = await llm_client.fetch_gateway_models(db, force=True)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось получить список моделей (проверьте URL и ключ): {e}",
        )

    cfg = await llm_client.get_ai_settings(db)
    available = [m for m in models if m.get("status") == "available"]
    model = cfg.text_model or (available[0]["id"] if available else None)
    if not model:
        raise HTTPException(status_code=502, detail="На гейтвее нет доступных групп моделей")

    start = _time.monotonic()
    try:
        resp = await llm_client.gateway_completion(
            db,
            model=model,
            messages=[{"role": "user", "content": "Ответь одним словом: pong"}],
            api_key=key.key_value,
            max_tokens=16,
            timeout=30.0,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Список моделей получен, но тестовый запрос к модели «{model}» не прошёл: {e}",
        )
    latency_ms = int((_time.monotonic() - start) * 1000)

    return {
        "success": True,
        "message": f"Гейтвей работает. Модель «{model}» ответила за {latency_ms} мс.",
        "model": model,
        "latency_ms": latency_ms,
        "reply": (resp.choices[0].message.content or "").strip()[:200],
        "models_total": len(models),
        "models_available": len(available),
    }
