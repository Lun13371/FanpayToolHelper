"""
Единая точка вызова LLM / embeddings через Syntee Gateway (OpenAI-compatible).

ВСЕ обращения к ИИ в FanpayToolHelper идут исключительно через этот модуль.
Прямые вызовы Fireworks AI полностью удалены.

Гейтвей (https://syntee.fun):
  POST {gateway_url}/chat/completions  — OpenAI-совместимый чат
  POST {gateway_url}/embeddings        — OpenAI-совместимые эмбеддинги
  GET  {gateway_url}/models            — список групп моделей (цены, статусы, capabilities)

Авторизация: Bearer sk-syntee-... (ключи хранятся в таблице ai_keys,
ротация round-robin через AIService.get_next_key).
"""
import logging
import time
from typing import Any, Dict, List, Optional

import httpx
import litellm
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.models.ai_key import AIKey
from app.models.ai_settings import AISettings

logger = logging.getLogger("fanpay.llm")

# In-memory кэш списка моделей гейтвея (TTL 60 c) — чтобы не дёргать
# GET /models перед каждым LLM-вызовом
_MODELS_CACHE_TTL = 60.0
_models_cache: Dict[str, Any] = {"ts": 0.0, "data": []}


def invalidate_models_cache() -> None:
    """Сброс кэша списка моделей (вызывается после изменения настроек)."""
    _models_cache["ts"] = 0.0
    _models_cache["data"] = []


async def get_ai_settings(db: AsyncSession) -> AISettings:
    """Возвращает singleton-строку настроек ИИ (id=1), создаёт при первом обращении."""
    res = await db.execute(select(AISettings).where(AISettings.id == 1))
    row = res.scalar_one_or_none()
    if row is None:
        row = AISettings(id=1, gateway_url=app_settings.SYNTEE_GATEWAY_URL)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def _pick_key(db: AsyncSession) -> Optional[AIKey]:
    """
    Round-robin выбор активного ключа (аналог AIService.get_next_key).
    Локальная копия — чтобы избежать циклического импорта с app.services.ai.
    """
    query = (
        select(AIKey)
        .where(AIKey.is_active == True)  # noqa: E712
        .where(AIKey.error_count < 5)
        .order_by(AIKey.last_used_at.asc())
    )
    res = await db.execute(query)
    return res.scalars().first()


async def fetch_gateway_models(db: AsyncSession, force: bool = False) -> List[dict]:
    """
    Список групп моделей с гейтвея (GET {gateway_url}/models).
    Возвращает список записей OpenAI-формата с расширениями Syntee:
    status, pricing, supports_vision, supports_tools, display_name и т.д.
    """
    now = time.monotonic()
    if not force and _models_cache["data"] and (now - _models_cache["ts"]) < _MODELS_CACHE_TTL:
        return _models_cache["data"]

    cfg = await get_ai_settings(db)
    key = await _pick_key(db)
    if not key:
        raise RuntimeError(
            "Нет активных ключей ИИ — добавьте ключи sk-syntee-... во вкладке «Глобальные ключи»"
        )

    url = cfg.gateway_url.rstrip("/") + "/models"
    headers = {"Authorization": f"Bearer {key.key_value}"}
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, timeout=15.0)
        resp.raise_for_status()
        data = resp.json().get("data", [])

    _models_cache["ts"] = now
    _models_cache["data"] = data
    return data


def _available(models: List[dict]) -> List[dict]:
    return [m for m in models if m.get("status") == "available"]


async def resolve_chat_models(db: AsyncSession, kind: str = "text") -> List[str]:
    """
    Кандидат-модели (группы гейтвея) для чат-вызовов.

    kind:
      "text"   — основная модель (ответы покупателям, smart-агенты)
      "vision" — модель с поддержкой скриншотов (supports_vision)
      "cheap"  — дешёвая модель (классификация отзывов, cheap-агенты)

    Приоритет: явно заданное значение в AISettings → авто-выбор из
    доступных групп гейтвея (GET /models, status == available).
    """
    cfg = await get_ai_settings(db)

    if kind == "vision" and cfg.vision_model:
        return [cfg.vision_model] + ([cfg.text_model] if cfg.text_model else [])
    if kind == "cheap" and cfg.cheap_model:
        return [cfg.cheap_model] + ([cfg.text_model] if cfg.text_model else [])
    if kind == "text" and cfg.text_model:
        return [cfg.text_model]

    # Авто-выбор из списка групп гейтвея
    try:
        models = _available(await fetch_gateway_models(db))
    except Exception as e:
        logger.warning(f"Не удалось получить список моделей гейтвея: {e}")
        models = []

    if not models:
        # Последний шанс — любые явно заданные модели из настроек
        fallback = [m for m in (cfg.text_model, cfg.vision_model, cfg.cheap_model) if m]
        return fallback

    if kind == "vision":
        vision = [m["id"] for m in models if m.get("supports_vision")]
        if vision:
            return vision
        logger.warning("На гейтвее нет групп с supports_vision — используем обычные")
    return [m["id"] for m in models]


async def resolve_embedding_model(db: AsyncSession) -> Optional[str]:
    """
    Модель эмбеддингов: значение из AISettings → первая группа с "embed" в имени.
    """
    cfg = await get_ai_settings(db)
    if cfg.embedding_model:
        return cfg.embedding_model

    try:
        models = _available(await fetch_gateway_models(db))
    except Exception as e:
        logger.warning(f"Не удалось получить список моделей гейтвея: {e}")
        return None

    for m in models:
        name = (m.get("id") or "").lower()
        display = (m.get("display_name") or "").lower()
        if "embed" in name or "embed" in display:
            return m["id"]
    return None


async def gateway_completion(
    db: AsyncSession,
    model: str,
    messages: List[dict],
    api_key: str,
    **kwargs: Any,
):
    """
    Чат-запрос через Syntee Gateway (OpenAI-compatible).
    Вся retry-логика / ротация ключей остаются на стороне вызывающего кода.
    """
    cfg = await get_ai_settings(db)
    return await litellm.acompletion(
        model=model,
        custom_llm_provider="openai",
        api_base=cfg.gateway_url.rstrip("/"),
        messages=messages,
        api_key=api_key,
        **kwargs,
    )
