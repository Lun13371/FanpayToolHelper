import logging
import json
import asyncio
from datetime import datetime
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError

from app.database import get_session
from app.config import settings
from app.api.deps import get_current_user
from app.models.user import User
from app.models.agents import AgentRun, AgentState, AgentLog, GeneratedLot, AgentInsight
from app.models.lot_template import LotCreationTemplate
from app.models.global_category import FunpayGlobalCategory
from app.services.agents.orchestrator import AgentOrchestrator

logger = logging.getLogger("fanpay.api.agents")

router = APIRouter(prefix="/agents", tags=["AI Agents Market Analyzer"])

async def get_current_user_from_param(
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_session)
) -> User:
    """
    Извлекает и верифицирует пользователя из токена в параметрах URL (для SSE стримов).
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось верифицировать учетные данные"
    )
    if not token:
        raise credentials_exception
        
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    query = select(User).where(User.username == username)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_exception

    return user

class AgentRunCreate(BaseModel):
    mode: str = "auto"  # auto, manual, full
    limit_categories: int = 5
    target_account_id: Optional[int] = None
    tavily_api_key: Optional[str] = None

class AgentRunResponse(BaseModel):
    id: int
    status: str
    mode: str
    limit_categories: int
    target_account_id: Optional[int]
    total_cost_tokens: int
    created_at: datetime
    completed_at: Optional[datetime]

@router.post("/runs", response_model=AgentRunResponse, status_code=status.HTTP_201_CREATED)
async def start_agents_analysis(
    payload: AgentRunCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Запустить новую сессию агентного анализа рынка.
    Запускает фоновую задачу оркестратора и сразу возвращает ID сессии.
    """
    # Проверяем, нет ли уже запущенной сессии
    stmt_active = select(AgentRun).where(AgentRun.status == "running")
    res_active = await db.execute(stmt_active)
    active_run = res_active.scalar_one_or_none()
    
    if active_run:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Уже запущена активная сессия анализа (ID: {active_run.id}). Дождитесь её окончания."
        )
        
    # Создаем новую запись запуска в БД
    run = AgentRun(
        status="idle",
        mode=payload.mode,
        limit_categories=payload.limit_categories,
        target_account_id=payload.target_account_id
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    
    # Запускаем фоновую задачу оркестратора через asyncio.create_task
    # Передаем отдельную сессию БД внутрь оркестратора (он сам создаст сессии при необходимости, 
    # но мы передаем фабрику или используем async_session_maker)
    from app.database import async_session_maker
    
    async def run_in_background():
        async with async_session_maker() as background_db:
            await AgentOrchestrator.run_analysis_flow(background_db, run.id, payload.tavily_api_key)
            
    asyncio.create_task(run_in_background())
    
    return run

@router.get("/runs/active")
async def get_active_run(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Получить текущую запущенную сессию (если есть).
    Используется для восстановления состояния интерфейса при перезагрузке страницы.
    """
    stmt = select(AgentRun).where(AgentRun.status == "running")
    res = await db.execute(stmt)
    active_run = res.scalar_one_or_none()
    
    if not active_run:
        return {"active": False, "run": None}
        
    # Подтягиваем состояния 3-х агентов для этой сессии
    state_stmt = select(AgentState).where(AgentState.run_id == active_run.id)
    state_res = await db.execute(state_stmt)
    states = state_res.scalars().all()
    
    states_dict = {s.agent_name: {"status": s.status, "current_task": s.current_task, "tokens_used": s.tokens_used} for s in states}
    
    return {
        "active": True,
        "run": active_run,
        "agent_states": states_dict
    }

@router.get("/runs", response_model=List[AgentRunResponse])
async def list_analysis_runs(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Получить список всех сессий запуска агентов (история).
    """
    stmt = select(AgentRun).order_by(AgentRun.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.get("/runs/{run_id}")
async def get_run_details(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Получить подробные сведения о конкретной сессии запуска.
    Включает общую информацию, статусы агентов и общее количество логов.
    """
    run = await db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Сессия анализа не найдена.")
        
    state_stmt = select(AgentState).where(AgentState.run_id == run_id)
    state_res = await db.execute(state_stmt)
    states = state_res.scalars().all()
    
    states_dict = {s.agent_name: {"status": s.status, "current_task": s.current_task, "tokens_used": s.tokens_used, "updated_at": s.updated_at} for s in states}
    
    # Также посчитаем число сгенерированных товаров
    lot_stmt = select(GeneratedLot).where(GeneratedLot.run_id == run_id)
    lot_res = await db.execute(lot_stmt)
    lots_count = len(lot_res.scalars().all())
    
    return {
        "run": run,
        "agent_states": states_dict,
        "lots_count": lots_count
    }

@router.get("/runs/{run_id}/lots", response_model=List[GeneratedLot])
async def get_generated_lots(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Получить каталог сгенерированных прибыльных лотов для конкретной сессии.
    """
    stmt = select(GeneratedLot).where(GeneratedLot.run_id == run_id).order_by(GeneratedLot.game_name.asc(), GeneratedLot.price.desc())
    res = await db.execute(stmt)
    return res.scalars().all()

@router.get("/runs/{run_id}/stream")
async def stream_analysis_progress(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user_from_param)
) -> Any:
    """
    SSE-трансляция логов и изменений состояний агентов в реальном времени.
    Клиент подключается к этому потоку и слушает обновления без перезагрузок.
    """
    async def event_generator():
        last_log_id = 0
        run_obj = await db.get(AgentRun, run_id)
        if not run_obj:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Сессия не найдена'}, ensure_ascii=False)}\n\n"
            return
            
        logger.info(f"SSE клиент подключен к потоку сессии {run_id}")
        
        while True:
            # Создаем свежую сессию внутри цикла для предотвращения кэширования транзакций SQLAlchemy
            from app.database import async_session_maker
            async with async_session_maker() as stream_db:
                # Обновляем инфо о сессии
                run_obj = await stream_db.get(AgentRun, run_id)
                if not run_obj:
                    break
                    
                # 1. Извлекаем новые логи
                log_stmt = select(AgentLog).where(AgentLog.run_id == run_id, AgentLog.id > last_log_id).order_by(AgentLog.id.asc())
                log_res = await stream_db.execute(log_stmt)
                new_logs = log_res.scalars().all()
                
                for log in new_logs:
                    log_data = {
                        "type": "log",
                        "id": log.id,
                        "agent_name": log.agent_name,
                        "message": log.message,
                        "level": log.level,
                        "created_at": log.created_at.strftime("%H:%M:%S")
                    }
                    yield f"data: {json.dumps(log_data, ensure_ascii=False)}\n\n"
                    last_log_id = log.id
                    
                # 2. Получаем актуальные состояния агентов
                state_stmt = select(AgentState).where(AgentState.run_id == run_id)
                state_res = await stream_db.execute(state_stmt)
                agent_states = state_res.scalars().all()
                
                states_dict = {
                    s.agent_name: {
                        "status": s.status,
                        "current_task": s.current_task,
                        "tokens_used": s.tokens_used
                    } for s in agent_states
                }
                
                state_update = {
                    "type": "state",
                    "run_status": run_obj.status,
                    "total_cost_tokens": run_obj.total_cost_tokens,
                    "agent_states": states_dict
                }
                yield f"data: {json.dumps(state_update, ensure_ascii=False)}\n\n"
                
                # 3. Если сессия завершена или дала сбой — посылаем сигнал и выходим
                if run_obj.status in ("completed", "failed"):
                    # Yield final list of lots if completed
                    if run_obj.status == "completed":
                        lot_stmt = select(GeneratedLot).where(GeneratedLot.run_id == run_id)
                        lot_res = await stream_db.execute(lot_stmt)
                        lots_count = len(lot_res.scalars().all())
                        yield f"data: {json.dumps({'type': 'done', 'lots_count': lots_count}, ensure_ascii=False)}\n\n"
                    break
                    
            await asyncio.sleep(1.0)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/lots/{lot_id}/export-template", status_code=status.HTTP_200_OK)
async def export_generated_lot_to_template(
    lot_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Экспортировать сгенерированный ИИ лот в реальный шаблон публикации лотов.
    Позволяет опубликовать лот на FunPay в 1 клик!
    """
    lot = await db.get(GeneratedLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Сгенерированный лот не найден.")
        
    # Ищем подходящую категорию на Funpay, чтобы узнать node_id
    cat_stmt = select(FunpayGlobalCategory).where(
        FunpayGlobalCategory.game_name == lot.game_name,
        FunpayGlobalCategory.subcategory_name == lot.subcategory_name
    )
    cat_res = await db.execute(cat_stmt)
    category = cat_res.scalar_one_or_none()
    
    node_id = category.node_id if category else "81" # fallback
    
    # Создаем рабочий шаблон публикации лотов
    creation_template = LotCreationTemplate(
        user_id=current_user.id,
        name=f"[AI] {lot.title}",
        node_id=node_id,
        game_name=lot.game_name,
        subcategory_name=lot.subcategory_name,
        fields=lot.fields_json
    )
    
    db.add(creation_template)
    await db.commit()
    await db.refresh(creation_template)
    
    return {
        "success": True,
        "message": f"Шаблон '{lot.title}' успешно создан и готов к публикации в разделе Шаблоны!",
        "template_id": creation_template.id
    }
