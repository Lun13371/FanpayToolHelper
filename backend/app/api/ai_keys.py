from typing import Any, List, Dict, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy import func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.api.deps import get_current_admin
from app.models.user import User
from app.models.ai_key import AIKey
from app.models.ai_log import AILog
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


# Дополнительные схемы Pydantic для статистики и логов
class AIModelStats(BaseModel):
    model: str
    total_calls: int
    success_calls: int
    error_calls: int
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int
    estimated_cost_usd: float

class AIKeyStats(BaseModel):
    key_id: Optional[int]
    key_value: str
    total_calls: int
    error_count: int
    is_active: bool
    total_tokens: int
    estimated_cost_usd: float

class GeneralAIStats(BaseModel):
    total_requests: int
    success_requests: int
    error_requests: int
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int
    estimated_cost_usd: float
    models_stats: List[AIModelStats]
    keys_stats: List[AIKeyStats]


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Оценивает примерную стоимость запроса к Fireworks AI (в USD за 1 млн токенов)."""
    model_lower = model.lower()
    if "kimi" in model_lower:
        rate_input = 0.50
        rate_output = 0.50
    elif "llama-3-3" in model_lower or "llama-3.3" in model_lower:
        rate_input = 0.90
        rate_output = 0.90
    elif "qwen" in model_lower:
        rate_input = 0.40
        rate_output = 0.40
    elif "deepseek" in model_lower or "gpt-oss" in model_lower:
        rate_input = 1.00
        rate_output = 1.00
    else:
        rate_input = 0.60
        rate_output = 0.60
        
    cost_prompt = (prompt_tokens / 1_000_000) * rate_input
    cost_completion = (completion_tokens / 1_000_000) * rate_output
    return cost_prompt + cost_completion


@router.get("/stats", response_model=GeneralAIStats)
async def get_ai_stats(
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin)
) -> Any:
    """Получить агрегированную статистику ИИ (Только для Админа)."""
    # 1. Общие показатели
    total_requests_query = select(func.count(AILog.id)).select_from(AILog)
    total_requests = (await db.execute(total_requests_query)).scalar() or 0
    
    success_requests_query = select(func.count(AILog.id)).where(AILog.status == "success")
    success_requests = (await db.execute(success_requests_query)).scalar() or 0
    
    error_requests_query = select(func.count(AILog.id)).where(AILog.status == "error")
    error_requests = (await db.execute(error_requests_query)).scalar() or 0
    
    tokens_query = select(
        func.sum(AILog.prompt_tokens),
        func.sum(AILog.completion_tokens),
        func.sum(AILog.total_tokens)
    ).select_from(AILog)
    tokens_res = (await db.execute(tokens_query)).first()
    
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0
    if tokens_res:
        prompt_tokens = tokens_res[0] or 0
        completion_tokens = tokens_res[1] or 0
        total_tokens = tokens_res[2] or 0

    # 2. Модели
    models_query = select(
        AILog.model,
        func.count(AILog.id).label("total_calls"),
        func.sum(case((AILog.status == "success", 1), else_=0)).label("success_calls"),
        func.sum(case((AILog.status == "error", 1), else_=0)).label("error_calls"),
        func.sum(AILog.prompt_tokens).label("prompt_tokens"),
        func.sum(AILog.completion_tokens).label("completion_tokens"),
        func.sum(AILog.total_tokens).label("total_tokens")
    ).group_by(AILog.model)
    
    models_res = (await db.execute(models_query)).all()
    models_stats = []
    total_cost_usd = 0.0
    
    for row in models_res:
        p_tok = row.prompt_tokens or 0
        c_tok = row.completion_tokens or 0
        cost = estimate_cost(row.model, p_tok, c_tok)
        total_cost_usd += cost
        models_stats.append(AIModelStats(
            model=row.model,
            total_calls=row.total_calls or 0,
            success_calls=row.success_calls or 0,
            error_calls=row.error_calls or 0,
            total_tokens=row.total_tokens or 0,
            prompt_tokens=p_tok,
            completion_tokens=c_tok,
            estimated_cost_usd=cost
        ))

    # 3. Ключи
    keys_query = select(AIKey)
    keys_res = (await db.execute(keys_query)).scalars().all()
    
    keys_stats = []
    for key in keys_res:
        key_logs_query = select(
            func.count(AILog.id).label("total_calls"),
            func.sum(AILog.prompt_tokens).label("prompt_tokens"),
            func.sum(AILog.completion_tokens).label("completion_tokens"),
            func.sum(AILog.total_tokens).label("total_tokens")
        ).where(AILog.key_id == key.id)
        
        k_res = (await db.execute(key_logs_query)).first()
        k_calls = k_res[0] or 0 if k_res else 0
        k_prompt = k_res[1] or 0 if k_res else 0
        k_compl = k_res[2] or 0 if k_res else 0
        k_total = k_res[3] or 0 if k_res else 0
        
        key_logs_all = (await db.execute(select(AILog.model, AILog.prompt_tokens, AILog.completion_tokens).where(AILog.key_id == key.id))).all()
        k_cost = sum(estimate_cost(r.model, r.prompt_tokens or 0, r.completion_tokens or 0) for r in key_logs_all)
        
        masked_val = key.key_value
        if len(masked_val) > 10:
            masked_val = f"{masked_val[:6]}...{masked_val[-4:]}"
            
        keys_stats.append(AIKeyStats(
            key_id=key.id,
            key_value=masked_val,
            total_calls=k_calls,
            error_count=key.error_count,
            is_active=key.is_active,
            total_tokens=k_total,
            estimated_cost_usd=k_cost
        ))

    return GeneralAIStats(
        total_requests=total_requests,
        success_requests=success_requests,
        error_requests=error_requests,
        total_tokens=total_tokens,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        estimated_cost_usd=total_cost_usd,
        models_stats=models_stats,
        keys_stats=keys_stats
    )


@router.get("/logs")
async def get_ai_logs(
    limit: int = 50,
    offset: int = 0,
    status: Optional[str] = None,
    action_type: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin)
) -> Any:
    """Получить детальные логи ИИ (Только для Админа)."""
    query = select(AILog).order_by(AILog.created_at.desc())
    if status:
        query = query.where(AILog.status == status)
    if action_type:
        query = query.where(AILog.action_type == action_type)
        
    count_query = select(func.count()).select_from(query.subquery())
    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0
    
    query = query.offset(offset).limit(limit)
    res = await db.execute(query)
    logs = res.scalars().all()
    
    log_responses = []
    for log in logs:
        cost = estimate_cost(log.model, log.prompt_tokens, log.completion_tokens)
        
        log_responses.append({
            "id": log.id,
            "created_at": log.created_at.isoformat() + "Z",
            "key_id": log.key_id,
            "model": log.model,
            "action_type": log.action_type,
            "prompt": log.prompt,
            "response": log.response,
            "status": log.status,
            "prompt_tokens": log.prompt_tokens,
            "completion_tokens": log.completion_tokens,
            "total_tokens": log.total_tokens,
            "error_message": log.error_message,
            "account_id": log.account_id,
            "estimated_cost_usd": cost
        })
        
    return {
        "total": total,
        "logs": log_responses
    }


@router.post("/logs/clear")
async def clear_ai_logs(
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin)
) -> Any:
    """Очистить все логи ИИ из базы данных (Только для Админа)."""
    from sqlalchemy import delete
    await db.execute(delete(AILog))
    await db.commit()
    return {
        "success": True,
        "message": "Все логи взаимодействия с ИИ успешно удалены."
    }
