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
from app.services.agents.orchestrator import AgentOrchestrator, ACTIVE_TASKS

logger = logging.getLogger("fanpay.api.agents")
router = APIRouter(prefix="/agents", tags=["AI Agents Market Analyzer"])


async def get_current_user_from_param(
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_session)
) -> User:
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Не удалось верифицировать токен")
    if not token:
        raise exc
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        username: str = payload.get("sub")
        if not username:
            raise exc
    except JWTError:
        raise exc
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise exc
    return user


class AgentRunCreate(BaseModel):
    mode: str = "auto"
    limit_categories: int = 5
    target_account_id: Optional[int] = None
    tavily_api_key: Optional[str] = None
    manual_node_ids: Optional[List[str]] = None   # для ручного режима


class AgentRunResponse(BaseModel):
    id: int
    status: str
    mode: str
    limit_categories: int
    target_account_id: Optional[int]
    total_cost_tokens: int
    created_at: datetime
    completed_at: Optional[datetime]
    lots_count: Optional[int] = None   # число лотов — добавлено в список истории


# ── POST /runs ────────────────────────────────────────────────────────────────

@router.post("/runs", response_model=AgentRunResponse, status_code=status.HTTP_201_CREATED)
async def start_agents_analysis(
    payload: AgentRunCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Запустить новую сессию анализа. Изолировано по user_id."""
    # Проверяем активную сессию только для текущего пользователя
    stmt_active = select(AgentRun).where(
        AgentRun.status == "running",
        AgentRun.user_id == current_user.id
    )
    res_active = await db.execute(stmt_active)
    active_run = res_active.scalar_one_or_none()

    if active_run:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"У вас уже запущена сессия анализа (ID: {active_run.id}). Дождитесь завершения или остановите её."
        )

    run = AgentRun(
        status="idle",
        mode=payload.mode,
        limit_categories=payload.limit_categories,
        target_account_id=payload.target_account_id,
        user_id=current_user.id
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    from app.database import async_session_maker

    async def run_in_background():
        async with async_session_maker() as background_db:
            await AgentOrchestrator.run_analysis_flow(
                background_db, run.id, payload.tavily_api_key, payload.manual_node_ids
            )

    task = asyncio.create_task(run_in_background())
    ACTIVE_TASKS[run.id] = task

    return run


# ── POST /runs/{run_id}/stop ─────────────────────────────────────────────────

@router.post("/runs/{run_id}/stop", status_code=status.HTTP_200_OK)
async def stop_analysis(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Остановить активную сессию анализа (реальная отмена asyncio-задачи)."""
    run = await db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Сессия не найдена.")
    if run.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Нет доступа к этой сессии.")
    if run.status != "running":
        raise HTTPException(status_code=400, detail=f"Сессия не активна (статус: {run.status}).")

    task = ACTIVE_TASKS.get(run_id)
    if task and not task.done():
        task.cancel()
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
        ACTIVE_TASKS.pop(run_id, None)

    # На случай если задача уже завершилась, но статус не обновился
    await db.refresh(run)
    if run.status == "running":
        run.status = "failed"
        run.completed_at = datetime.utcnow()
        db.add(run)
        await db.commit()

    return {"success": True, "message": "Анализ остановлен."}


# ── GET /runs/active ──────────────────────────────────────────────────────────

@router.get("/runs/active")
async def get_active_run(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить текущую активную сессию текущего пользователя."""
    stmt = select(AgentRun).where(
        AgentRun.status == "running",
        AgentRun.user_id == current_user.id
    )
    res = await db.execute(stmt)
    active_run = res.scalar_one_or_none()
    if not active_run:
        return {"active": False, "run": None}

    state_stmt = select(AgentState).where(AgentState.run_id == active_run.id)
    state_res = await db.execute(state_stmt)
    states = state_res.scalars().all()
    states_dict = {s.agent_name: {"status": s.status, "current_task": s.current_task, "tokens_used": s.tokens_used} for s in states}

    return {"active": True, "run": active_run, "agent_states": states_dict}


# ── GET /runs ─────────────────────────────────────────────────────────────────

@router.get("/runs")
async def list_analysis_runs(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """История запусков текущего пользователя с количеством лотов."""
    stmt = select(AgentRun).where(AgentRun.user_id == current_user.id).order_by(AgentRun.created_at.desc())
    res = await db.execute(stmt)
    runs = res.scalars().all()

    result = []
    for run in runs:
        lot_stmt = select(GeneratedLot).where(GeneratedLot.run_id == run.id)
        lot_res = await db.execute(lot_stmt)
        lots_count = len(lot_res.scalars().all())
        run_dict = {
            "id": run.id, "status": run.status, "mode": run.mode,
            "limit_categories": run.limit_categories, "target_account_id": run.target_account_id,
            "total_cost_tokens": run.total_cost_tokens, "created_at": run.created_at,
            "completed_at": run.completed_at, "lots_count": lots_count
        }
        result.append(run_dict)
    return result


# ── GET /runs/{run_id} ────────────────────────────────────────────────────────

@router.get("/runs/{run_id}")
async def get_run_details(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    run = await db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Сессия не найдена.")
    state_stmt = select(AgentState).where(AgentState.run_id == run_id)
    state_res = await db.execute(state_stmt)
    states = state_res.scalars().all()
    states_dict = {s.agent_name: {"status": s.status, "current_task": s.current_task,
                                   "tokens_used": s.tokens_used, "updated_at": s.updated_at} for s in states}
    lot_stmt = select(GeneratedLot).where(GeneratedLot.run_id == run_id)
    lot_res = await db.execute(lot_stmt)
    lots_count = len(lot_res.scalars().all())
    return {"run": run, "agent_states": states_dict, "lots_count": lots_count}


# ── GET /runs/{run_id}/lots ───────────────────────────────────────────────────

@router.get("/runs/{run_id}/lots", response_model=List[GeneratedLot])
async def get_generated_lots(
    run_id: int,
    game_name: Optional[str] = Query(None, description="Фильтр по игре"),
    sort_by: str = Query("game_name", description="game_name | price | amount | revenue"),
    sort_dir: str = Query("asc", description="asc | desc"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Лоты с фильтром по игре и сортировкой."""
    stmt = select(GeneratedLot).where(GeneratedLot.run_id == run_id)
    if game_name:
        stmt = stmt.where(GeneratedLot.game_name == game_name)

    # Сортировка
    sort_map = {
        "game_name": GeneratedLot.game_name,
        "price": GeneratedLot.price,
        "amount": GeneratedLot.amount,
    }
    sort_col = sort_map.get(sort_by, GeneratedLot.game_name)
    stmt = stmt.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

    res = await db.execute(stmt)
    lots = res.scalars().all()

    # revenue сортировка — post-process
    if sort_by == "revenue":
        lots = sorted(lots, key=lambda l: l.price * l.amount, reverse=(sort_dir == "desc"))

    return lots


# ── GET /runs/{run_id}/stream (SSE) ──────────────────────────────────────────

@router.get("/runs/{run_id}/stream")
async def stream_analysis_progress(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user_from_param)
) -> Any:
    async def event_generator():
        last_log_id = 0
        run_obj = await db.get(AgentRun, run_id)
        if not run_obj:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Сессия не найдена'}, ensure_ascii=False)}\n\n"
            return

        from app.database import async_session_maker
        while True:
            async with async_session_maker() as stream_db:
                run_obj = await stream_db.get(AgentRun, run_id)
                if not run_obj:
                    break

                log_stmt = select(AgentLog).where(
                    AgentLog.run_id == run_id, AgentLog.id > last_log_id
                ).order_by(AgentLog.id.asc())
                log_res = await stream_db.execute(log_stmt)
                new_logs = log_res.scalars().all()

                for log in new_logs:
                    yield f"data: {json.dumps({'type': 'log', 'id': log.id, 'agent_name': log.agent_name, 'message': log.message, 'level': log.level, 'created_at': log.created_at.strftime('%H:%M:%S')}, ensure_ascii=False)}\n\n"
                    last_log_id = log.id

                state_stmt = select(AgentState).where(AgentState.run_id == run_id)
                state_res = await stream_db.execute(state_stmt)
                agent_states = state_res.scalars().all()
                states_dict = {s.agent_name: {"status": s.status, "current_task": s.current_task, "tokens_used": s.tokens_used} for s in agent_states}

                # Прогресс: сколько категорий обработано
                lot_stmt = select(GeneratedLot).where(GeneratedLot.run_id == run_id)
                lot_res = await stream_db.execute(lot_stmt)
                current_lots = len(lot_res.scalars().all())

                yield f"data: {json.dumps({'type': 'state', 'run_status': run_obj.status, 'total_cost_tokens': run_obj.total_cost_tokens, 'agent_states': states_dict, 'current_lots': current_lots}, ensure_ascii=False)}\n\n"

                if run_obj.status in ("completed", "failed"):
                    final_type = "done" if run_obj.status == "completed" else "error"
                    yield f"data: {json.dumps({'type': final_type, 'lots_count': current_lots, 'message': 'Анализ завершён' if final_type == 'done' else 'Анализ завершён с ошибкой'}, ensure_ascii=False)}\n\n"
                    break

            await asyncio.sleep(1.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ── GET /insights ─────────────────────────────────────────────────────────────

@router.get("/insights")
async def get_insights(
    game_name: Optional[str] = Query(None),
    insight_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить реальные инсайты из семантической памяти агентов."""
    stmt = select(AgentInsight).order_by(AgentInsight.created_at.desc()).limit(limit)
    if game_name:
        stmt = stmt.where(AgentInsight.game_name == game_name)
    if insight_type:
        stmt = stmt.where(AgentInsight.insight_type == insight_type)
    res = await db.execute(stmt)
    insights = res.scalars().all()
    return [
        {
            "id": ins.id, "run_id": ins.run_id, "game_name": ins.game_name,
            "subcategory_name": ins.subcategory_name, "insight_type": ins.insight_type,
            "content": ins.content, "created_at": ins.created_at.isoformat()
        }
        for ins in insights
    ]


# ── GET /categories ──────────────────────────────────────────────────────────

@router.get("/categories")
async def get_available_categories(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Список всех категорий FunPay для ручного выбора."""
    stmt = select(FunpayGlobalCategory).order_by(FunpayGlobalCategory.game_name.asc())
    res = await db.execute(stmt)
    cats = res.scalars().all()
    return [{"node_id": c.node_id, "game_name": c.game_name,
             "subcategory_name": c.subcategory_name, "category_type": c.category_type} for c in cats]


# ── POST /lots/{lot_id}/export-template ──────────────────────────────────────

@router.post("/lots/{lot_id}/export-template", status_code=status.HTTP_200_OK)
async def export_generated_lot_to_template(
    lot_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    lot = await db.get(GeneratedLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Лот не найден.")
    cat_stmt = select(FunpayGlobalCategory).where(
        FunpayGlobalCategory.game_name == lot.game_name,
        FunpayGlobalCategory.subcategory_name == lot.subcategory_name
    )
    cat_res = await db.execute(cat_stmt)
    category = cat_res.scalar_one_or_none()
    node_id = category.node_id if category else "81"

    creation_template = LotCreationTemplate(
        user_id=current_user.id, name=f"[AI] {lot.title}",
        node_id=node_id, game_name=lot.game_name,
        subcategory_name=lot.subcategory_name, fields=lot.fields_json
    )
    db.add(creation_template)
    await db.commit()
    await db.refresh(creation_template)
    return {"success": True, "message": f"Шаблон '{lot.title}' создан!", "template_id": creation_template.id}
