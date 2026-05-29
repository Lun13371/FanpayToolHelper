from typing import Any, List, Dict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.api.deps import get_current_admin
from app.models.user import User
from app.models.ai_key import AIKey
from app.services.ai import AIService

router = APIRouter(prefix="/ai-keys", tags=["Глобальные ИИ Ключи"])

# Схемы Pydantic
class AIKeyBulkImport(BaseModel):
    keys_string: str = Field(..., description="Строка с ключами, разделенными запятыми или переносами строк")

class AIKeyResponse(BaseModel):
    id: int
    key_value: str
    is_active: bool
    total_calls: int
    error_count: int
    last_used_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[AIKeyResponse])
async def list_ai_keys(
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin)
) -> Any:
    """Получить список всех глобальных ключей API (Только для Админа)."""
    query = select(AIKey).order_by(AIKey.created_at.desc())
    res = await db.execute(query)
    return res.scalars().all()


@router.post("/import", response_model=Dict[str, Any])
async def import_ai_keys(
    data: AIKeyBulkImport,
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin)
) -> Any:
    """Пакетный импорт ключей API через запятые или переносы строк (Только для Админа)."""
    added_count = await AIService.import_batch_keys(db, data.keys_string)
    return {
        "success": True,
        "message": f"Успешно добавлено {added_count} новых ключей ИИ в базу.",
        "added_count": added_count
    }


@router.put("/{key_id}/toggle", response_model=AIKeyResponse)
async def toggle_ai_key(
    key_id: int,
    active: bool,
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin)
) -> Any:
    """Включение/выключение определенного ключа API (Только для Админа)."""
    key_obj = await db.get(AIKey, key_id)
    if not key_obj:
        raise HTTPException(status_code=404, detail="Ключ API не найден")

    key_obj.is_active = active
    # Если мы вручную активируем ключ, сбрасываем счетчик ошибок
    if active:
        key_obj.error_count = 0

    db.add(key_obj)
    await db.commit()
    await db.refresh(key_obj)
    return key_obj


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_ai_key(
    key_id: int,
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin)
) -> Any:
    """Удалить ключ API из системы (Только для Админа)."""
    key_obj = await db.get(AIKey, key_id)
    if not key_obj:
        raise HTTPException(status_code=404, detail="Ключ не найден")

    await db.delete(key_obj)
    await db.commit()
    return None
