import logging
import json
import asyncio
from datetime import datetime
from typing import Any, List, Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_session, async_session_maker
from app.models.agents import AgentInsight, AgentLog, AgentRun, AgentState, GeneratedLot
from app.models.global_category import FunpayGlobalCategory
from app.models.lot_template import LotCreationTemplate
from app.models.user import User
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
    manual_node_ids: Optional[List[str]] = None


class RetrySubAgentPayload(BaseModel):
    agent_name: str
    parent_agent: Optional[str] = None
    category_context: Optional[str] = None


@router.post("/runs", status_code=status.HTTP_201_CREATED)
async def start_agents_analysis(
    payload: AgentRunCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    stmt_active = select(AgentRun).where(AgentRun.status == "running", AgentRun.user_id == current_user.id)
    res_active = await db.execute(stmt_active)
    active_run = res_active.scalar_one_or_none()
    if active_run:
        raise HTTPException(status_code=400, detail=f"У вас уже запущена сессия анализа (ID: {active_run.id}).")

    run = AgentRun(
        status="idle",
        mode=payload.mode,
        limit_categories=payload.limit_categories,
        target_account_id=payload.target_account_id,
        user_id=current_user.id,
        categories_done=0,
        categories_total=0,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    async def run_in_background():
        async with async_session_maker() as background_db:
            await AgentOrchestrator.run_analysis_flow(background_db, run.id, payload.tavily_api_key, payload.manual_node_ids)

    task = asyncio.create_task(run_in_background())
    ACTIVE_TASKS[run.id] = task
    return run


@router.post("/runs/{run_id}/stop")
async def stop_analysis(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    run = await db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Сессия не найдена.")
    if run.user_id != current_user.id and str(current_user.role).lower() != "admin":
        raise HTTPException(status_code=403, detail="Нет доступа к этой сессии.")
    if run.status not in ("running", "idle"):
        raise HTTPException(status_code=400, detail=f"Сессия не активна (статус: {run.status}).")

    # 1. Отменяем задачу если она ещё в памяти
    task = ACTIVE_TASKS.get(run_id)
    if task and not task.done():
        task.cancel()
        # Даём задаче шанс поймать CancelledError и сохранить статус
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=3.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    # 2. Гарантированно обновляем статус в БД прямо сейчас
    # (на случай если CancelledError handler не успел)
    run_fresh = await db.get(AgentRun, run_id)
    if run_fresh and run_fresh.status == "running":
        run_fresh.status = "failed"
        run_fresh.completed_at = datetime.utcnow()
        db.add(run_fresh)
        await db.commit()

    ACTIVE_TASKS.pop(run_id, None)
    return {"success": True, "message": "Анализ остановлен."}


@router.post("/runs/{run_id}/retry-agent")
async def retry_subagent(
    run_id: int,
    payload: RetrySubAgentPayload,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    run = await db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.user_id != current_user.id and str(current_user.role).lower() != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        return await AgentOrchestrator.retry_subagent(db, run_id, payload.agent_name, payload.parent_agent, payload.category_context)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/runs/active")
async def get_active_run(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    stmt = select(AgentRun).where(AgentRun.status == "running", AgentRun.user_id == current_user.id)
    res = await db.execute(stmt)
    run = res.scalar_one_or_none()
    if not run:
        return {"active": False, "run": None}

    st_res = await db.execute(select(AgentState).where(AgentState.run_id == run.id))
    states = st_res.scalars().all()
    return {
        "active": True,
        "run": run,
        "agent_states": [
            {
                "id": s.id,
                "agent_name": s.agent_name,
                "parent_agent": s.parent_agent,
                "category_context": s.category_context,
                "status": s.status,
                "current_task": s.current_task,
                "progress": s.progress,
                "tokens_used": s.tokens_used,
                "retry_count": s.retry_count,
                "error_message": s.error_message,
                "updated_at": s.updated_at.isoformat(),
            } for s in states
        ]
    }


@router.get("/runs")
async def list_analysis_runs(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    stmt = select(AgentRun).where(AgentRun.user_id == current_user.id).order_by(AgentRun.created_at.desc())
    res = await db.execute(stmt)
    runs = res.scalars().all()
    result = []
    for run in runs:
        lot_count = len((await db.execute(select(GeneratedLot).where(GeneratedLot.run_id == run.id))).scalars().all())
        result.append({
            "id": run.id,
            "status": run.status,
            "mode": run.mode,
            "limit_categories": run.limit_categories,
            "target_account_id": run.target_account_id,
            "total_cost_tokens": run.total_cost_tokens,
            "created_at": run.created_at,
            "completed_at": run.completed_at,
            "lots_count": lot_count,
            "categories_done": run.categories_done,
            "categories_total": run.categories_total,
        })
    return result


@router.get("/runs/{run_id}")
async def get_run_details(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    run = await db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Сессия не найдена.")
    if run.user_id != current_user.id and str(current_user.role).lower() != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    st_res = await db.execute(select(AgentState).where(AgentState.run_id == run_id).order_by(AgentState.parent_agent, AgentState.agent_name))
    states = st_res.scalars().all()
    lots_count = len((await db.execute(select(GeneratedLot).where(GeneratedLot.run_id == run_id))).scalars().all())
    return {
        "run": run,
        "agent_states": [
            {
                "id": s.id,
                "agent_name": s.agent_name,
                "parent_agent": s.parent_agent,
                "category_context": s.category_context,
                "status": s.status,
                "current_task": s.current_task,
                "progress": s.progress,
                "tokens_used": s.tokens_used,
                "retry_count": s.retry_count,
                "error_message": s.error_message,
                "updated_at": s.updated_at.isoformat(),
            } for s in states
        ],
        "lots_count": lots_count,
    }


@router.get("/runs/{run_id}/lots", response_model=List[GeneratedLot])
async def get_generated_lots(
    run_id: int,
    game_name: Optional[str] = Query(None),
    sort_by: str = Query("game_name"),
    sort_dir: str = Query("asc"),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    run = await db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.user_id != current_user.id and str(current_user.role).lower() != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    stmt = select(GeneratedLot).where(GeneratedLot.run_id == run_id)
    if game_name:
        stmt = stmt.where(GeneratedLot.game_name == game_name)
    sort_map = {
        "game_name": GeneratedLot.game_name,
        "price": GeneratedLot.price,
        "amount": GeneratedLot.amount,
    }
    if sort_by in sort_map:
        col = sort_map[sort_by]
        stmt = stmt.order_by(col.desc() if sort_dir == "desc" else col.asc())
    res = await db.execute(stmt)
    lots = res.scalars().all()
    if sort_by == "revenue":
        lots = sorted(lots, key=lambda l: l.price * l.amount, reverse=(sort_dir == "desc"))
    return lots


@router.get("/runs/{run_id}/stream")
async def stream_analysis_progress(
    run_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user_from_param)
) -> Any:
    run = await db.get(AgentRun, run_id)
    if not run:
        async def err_gen():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Сессия не найдена'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(err_gen(), media_type="text/event-stream")
    if run.user_id != current_user.id and str(current_user.role).lower() != "admin":
        async def err_gen2():
            yield f"data: {json.dumps({'type': 'error', 'message': 'Forbidden'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(err_gen2(), media_type="text/event-stream")

    async def event_generator():
        conn = await db.connection()
        raw = await conn.get_raw_connection()
        driver_conn = raw.driver_connection
        channel = f"agent_run_{run_id}"
        q: asyncio.Queue[str] = asyncio.Queue()

        def listener(*args):
            payload = args[-1]
            try:
                q.put_nowait(payload)
            except Exception:
                pass

        await driver_conn.add_listener(channel, listener)

        # initial snapshot
        async with async_session_maker() as snap_db:
            snap_run = await snap_db.get(AgentRun, run_id)
            st_res = await snap_db.execute(select(AgentState).where(AgentState.run_id == run_id))
            states = st_res.scalars().all()
            yield f"data: {json.dumps({'type': 'snapshot', 'run_status': snap_run.status, 'total_cost_tokens': snap_run.total_cost_tokens, 'categories_done': snap_run.categories_done, 'categories_total': snap_run.categories_total, 'agent_states': [{ 'id': s.id, 'agent_name': s.agent_name, 'parent_agent': s.parent_agent, 'category_context': s.category_context, 'status': s.status, 'current_task': s.current_task, 'progress': s.progress, 'tokens_used': s.tokens_used, 'retry_count': s.retry_count, 'error_message': s.error_message, 'updated_at': s.updated_at.isoformat() } for s in states]}, ensure_ascii=False)}\n\n"

        try:
            while True:
                payload = await q.get()
                yield f"data: {payload}\n\n"
                try:
                    parsed = json.loads(payload)
                    if parsed.get("type") in ("done", "error"):
                        break
                except Exception:
                    pass
        finally:
            try:
                await driver_conn.remove_listener(channel, listener)
            except Exception:
                pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/insights")
async def get_insights(
    game_name: Optional[str] = Query(None),
    insight_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    stmt = select(AgentInsight).order_by(AgentInsight.created_at.desc()).limit(limit)
    if game_name:
        stmt = stmt.where(AgentInsight.game_name == game_name)
    if insight_type:
        stmt = stmt.where(AgentInsight.insight_type == insight_type)
    res = await db.execute(stmt)
    insights = res.scalars().all()
    return [{
        "id": x.id,
        "run_id": x.run_id,
        "game_name": x.game_name,
        "subcategory_name": x.subcategory_name,
        "insight_type": x.insight_type,
        "content": x.content,
        "created_at": x.created_at.isoformat(),
    } for x in insights]


@router.get("/categories")
async def get_available_categories(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    res = await db.execute(select(FunpayGlobalCategory).order_by(FunpayGlobalCategory.game_name.asc()))
    cats = res.scalars().all()
    return [{
        "node_id": c.node_id,
        "game_name": c.game_name,
        "subcategory_name": c.subcategory_name,
        "category_type": c.category_type,
    } for c in cats]


@router.post("/lots/{lot_id}/export-template")
async def export_generated_lot_to_template(
    lot_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    lot = await db.get(GeneratedLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Лот не найден.")
    cat_res = await db.execute(select(FunpayGlobalCategory).where(FunpayGlobalCategory.game_name == lot.game_name, FunpayGlobalCategory.subcategory_name == lot.subcategory_name))
    category = cat_res.scalar_one_or_none()
    node_id = category.node_id if category else "81"
    tpl = LotCreationTemplate(
        user_id=current_user.id,
        name=f"[AI] {lot.title}",
        node_id=node_id,
        game_name=lot.game_name,
        subcategory_name=lot.subcategory_name,
        fields=lot.fields_json,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return {"success": True, "message": f"Шаблон '{lot.title}' создан!", "template_id": tpl.id}
