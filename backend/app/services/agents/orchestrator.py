import logging
import json
import asyncio
from datetime import datetime
from statistics import median
from typing import List, Dict, Any, Optional, Tuple

import litellm
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models.account import FanpayAccount
from app.models.global_category import FunpayGlobalCategory
from app.models.agents import AgentRun, AgentState, AgentLog, GeneratedLot
from app.services.ai import AIService
from app.services.fanpay_client import FanpayClient
from app.services.agents.search import AgentSearchService
from app.services.agents.memory import SemanticMemoryService
from app.services.agents.scraper import AgentScraperService
from app.database import async_session_maker

logger = logging.getLogger("fanpay.agents.orchestrator")
ACTIVE_TASKS: Dict[int, asyncio.Task] = {}


class AgentOrchestrator:
    AGENT_SELECTOR = "CategorySelector"
    AGENT_MEMORY = "Memory"
    AGENT_ANALYZER = "ListingAnalyzer"
    AGENT_GENERATOR = "LotGenerator"
    AGENT_PUBLISHER = "Publisher"

    SUB_TREND_RESEARCHER = "TrendResearcher"
    SUB_TREND_SCANNER = "TrendScanner"
    SUB_MEMORY_READER = "MemoryReader"
    SUB_CATEGORY_RANKER = "CategoryRanker"

    SUB_MARKET_SCRAPER = "MarketScraper"
    SUB_WEB_RESEARCHER = "WebResearcher"
    SUB_MARGIN_ANALYST = "MarginAnalyst"
    SUB_INSIGHT_WRITER = "InsightWriter"
    SUB_MARKET_CLASSIFIER = "MarketClassifier"

    SUB_SUPPLY_STRATEGIST = "SupplyStrategist"
    SUB_COPYWRITER = "CopywriterAgent"
    SUB_PRICING = "PricingAgent"
    SUB_SEO = "SEOAgent"
    SUB_RESELL_SCOUT = "ResellScout"
    SUB_DIGITAL_IDEATOR = "DigitalIdeator"

    SUB_QUALITY = "QualityChecker"
    SUB_DUPLICATE = "DuplicateFilter"
    SUB_EXPORTER = "TemplateExporter"

    MAIN_AGENTS = [AGENT_SELECTOR, AGENT_MEMORY, AGENT_ANALYZER, AGENT_GENERATOR, AGENT_PUBLISHER]

    SUBAGENTS_BY_PARENT = {
        AGENT_SELECTOR: [SUB_TREND_RESEARCHER, SUB_TREND_SCANNER, SUB_MEMORY_READER, SUB_CATEGORY_RANKER],
        AGENT_ANALYZER: [SUB_MARKET_SCRAPER, SUB_WEB_RESEARCHER, SUB_MARGIN_ANALYST, SUB_INSIGHT_WRITER, SUB_MARKET_CLASSIFIER],
        AGENT_GENERATOR: [SUB_SUPPLY_STRATEGIST, SUB_COPYWRITER, SUB_PRICING, SUB_SEO, SUB_RESELL_SCOUT, SUB_DIGITAL_IDEATOR],
        AGENT_PUBLISHER: [SUB_QUALITY, SUB_DUPLICATE, SUB_EXPORTER],
    }

    @classmethod
    async def notify(cls, db: AsyncSession, channel: str, payload: Dict[str, Any]):
        try:
            await db.execute(text("SELECT pg_notify(:channel, :payload)"), {
                "channel": channel,
                "payload": json.dumps(payload, ensure_ascii=False, default=str)
            })
            await db.commit()
        except Exception as e:
            logger.warning(f"pg_notify failed: {e}")

    @classmethod
    async def log_agent(
        cls,
        db: AsyncSession,
        run_id: int,
        agent_name: str,
        message: str,
        level: str = "info",
        parent_agent: Optional[str] = None,
        category_context: Optional[str] = None,
    ):
        log_entry = AgentLog(
            run_id=run_id,
            agent_name=agent_name,
            parent_agent=parent_agent,
            category_context=category_context,
            message=message,
            level=level,
        )
        db.add(log_entry)
        await db.commit()
        await db.refresh(log_entry)
        await cls.notify(db, f"agent_run_{run_id}", {
            "type": "log",
            "id": log_entry.id,
            "agent_name": agent_name,
            "parent_agent": parent_agent,
            "category_context": category_context,
            "message": message,
            "level": level,
            "created_at": log_entry.created_at.strftime('%H:%M:%S')
        })

    @classmethod
    async def update_run_progress(cls, db: AsyncSession, run_id: int, done: Optional[int] = None, total: Optional[int] = None):
        run = await db.get(AgentRun, run_id)
        if not run:
            return
        if done is not None:
            run.categories_done = done
        if total is not None:
            run.categories_total = total
        db.add(run)
        await db.commit()
        await cls.notify(db, f"agent_run_{run_id}", {
            "type": "progress",
            "categories_done": run.categories_done,
            "categories_total": run.categories_total,
        })

    @classmethod
    async def update_agent_state(
        cls,
        db: AsyncSession,
        run_id: int,
        agent_name: str,
        status: str,
        current_task: Optional[str] = None,
        tokens_used: int = 0,
        parent_agent: Optional[str] = None,
        category_context: Optional[str] = None,
        progress: Optional[int] = None,
        retry_count: Optional[int] = None,
        error_message: Optional[str] = None,
    ):
        stmt = select(AgentState).where(
            AgentState.run_id == run_id,
            AgentState.agent_name == agent_name,
            AgentState.parent_agent == parent_agent,
            AgentState.category_context == category_context,
        )
        res = await db.execute(stmt)
        state = res.scalar_one_or_none()
        if not state:
            state = AgentState(
                run_id=run_id,
                agent_name=agent_name,
                parent_agent=parent_agent,
                category_context=category_context,
                status=status,
                current_task=current_task,
                tokens_used=tokens_used,
                progress=progress or 0,
                retry_count=retry_count or 0,
                error_message=error_message,
                updated_at=datetime.utcnow(),
            )
        else:
            state.status = status
            if current_task is not None:
                state.current_task = current_task
            if progress is not None:
                state.progress = progress
            if retry_count is not None:
                state.retry_count = retry_count
            if error_message is not None:
                state.error_message = error_message
            state.tokens_used += tokens_used
            state.updated_at = datetime.utcnow()

        db.add(state)
        await db.commit()
        await db.refresh(state)

        await cls.notify(db, f"agent_run_{run_id}", {
            "type": "state",
            "agent_name": agent_name,
            "parent_agent": parent_agent,
            "category_context": category_context,
            "status": status,
            "current_task": state.current_task,
            "tokens_used": state.tokens_used,
            "progress": state.progress,
            "retry_count": state.retry_count,
            "error_message": state.error_message,
            "updated_at": state.updated_at.isoformat(),
        })

    @classmethod
    async def call_llm_json(
        cls,
        db: AsyncSession,
        system_prompt: str,
        user_prompt: str,
        agent_name: str,
        run_id: int,
        parent_agent: Optional[str] = None,
        category_context: Optional[str] = None,
    ) -> Dict[str, Any]:
        _smart_agents = {
            cls.SUB_CATEGORY_RANKER,
            cls.AGENT_SELECTOR,
            cls.SUB_MARGIN_ANALYST,
            cls.AGENT_MEMORY,
            cls.SUB_MARKET_CLASSIFIER,
            cls.SUB_RESELL_SCOUT,
            cls.SUB_DIGITAL_IDEATOR,
        }
        _cheap_agents = {cls.SUB_MARKET_SCRAPER, cls.SUB_COPYWRITER, cls.AGENT_GENERATOR}

        if agent_name in _smart_agents:
            candidate_models = [
                "accounts/fireworks/models/minimax-m2p7",
                "accounts/fireworks/models/minimax-m2p5",
                "accounts/fireworks/models/gpt-oss-20b",
            ]
        elif agent_name in _cheap_agents:
            candidate_models = [
                "accounts/fireworks/models/gpt-oss-20b",
                "accounts/fireworks/models/minimax-m2p5",
                "accounts/fireworks/models/minimax-m2p7",
            ]
        else:
            candidate_models = [
                "accounts/fireworks/models/minimax-m2p5",
                "accounts/fireworks/models/minimax-m2p7",
                "accounts/fireworks/models/gpt-oss-20b",
            ]

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        last_exception = None

        for model in candidate_models:
            key_obj = await AIService.get_next_key(db)
            if not key_obj:
                raise RuntimeError("Нет активных ключей ИИ в базе данных")

            max_retries_per_model = 4
            base_delay = 3.0

            for attempt in range(max_retries_per_model):
                try:
                    response = await litellm.acompletion(
                        model=model,
                        custom_llm_provider="fireworks_ai",
                        messages=messages,
                        api_key=key_obj.key_value,
                        temperature=0.2,
                        max_tokens=4000,
                        response_format={"type": "json_object"},
                        timeout=120.0,
                    )
                    await AIService.mark_key_success(db, key_obj)
                    usage = getattr(response, "usage", None)
                    tokens = usage.total_tokens if usage else 0
                    await cls.update_agent_state(
                        db, run_id, agent_name, "running",
                        tokens_used=tokens,
                        parent_agent=parent_agent,
                        category_context=category_context,
                    )
                    run_obj = await db.get(AgentRun, run_id)
                    if run_obj:
                        run_obj.total_cost_tokens += tokens
                        db.add(run_obj)
                        await db.commit()
                        await cls.notify(db, f"agent_run_{run_id}", {
                            "type": "run_meta",
                            "total_cost_tokens": run_obj.total_cost_tokens,
                            "run_status": run_obj.status,
                        })
                    raw_text = response.choices[0].message.content.strip()
                    return json.loads(raw_text)
                except asyncio.CancelledError:
                    raise
                except litellm.RateLimitError as e:
                    delay = base_delay * (2 ** attempt)
                    logger.warning(
                        f"[{agent_name}] Rate limit на {model} "
                        f"(попытка {attempt + 1}/{max_retries_per_model}), "
                        f"жду {delay:.0f}с..."
                    )
                    await AIService.mark_key_failure(db, key_obj, error=e)
                    if attempt < max_retries_per_model - 1:
                        await asyncio.sleep(delay)
                        fresh_key = await AIService.get_next_key(db)
                        if fresh_key:
                            key_obj = fresh_key
                        continue
                    last_exception = e
                    break
                except Exception as e:
                    await AIService.mark_key_failure(db, key_obj, error=e)
                    last_exception = e
                    break

        raise last_exception if last_exception else RuntimeError("Все модели-кандидаты вернули ошибку")

    @staticmethod
    def _ctx(cat: FunpayGlobalCategory) -> str:
        return f"{cat.game_name} / {cat.subcategory_name}"

    @staticmethod
    def _market_stats(offers: List[Dict[str, Any]]) -> Tuple[float, float, float, float]:
        prices = sorted([float(o.get("price", 0)) for o in offers if float(o.get("price", 0)) > 0])
        if not prices:
            return 0.0, 0.0, 0.0, 0.0
        return prices[0], prices[-1], sum(prices) / len(prices), median(prices)

    @classmethod
    async def _selector_phase(
        cls,
        db: AsyncSession,
        run_id: int,
        all_categories: List[FunpayGlobalCategory],
        limit_categories: int,
        tavily_key: Optional[str],
        manual_node_ids: Optional[List[str]],
        run: Any = None,
    ) -> List[FunpayGlobalCategory]:
        if manual_node_ids:
            picked = [c for c in all_categories if str(c.node_id) in set(map(str, manual_node_ids))]
            await cls.log_agent(db, run_id, cls.AGENT_SELECTOR, f"Ручной режим: выбрано {len(picked)} категорий.")
            return picked[:limit_categories]

        await cls.update_agent_state(db, run_id, cls.SUB_TREND_RESEARCHER, "running", "Сбор трендов", parent_agent=cls.AGENT_SELECTOR, progress=15)
        search_results = await AgentSearchService.search(
            "funpay profitable digital goods guides resell games 2026 market trends",
            api_key=tavily_key,
            max_results=8,
        )
        trend_context = "\n\n".join([f"[{i+1}] {r['title']}\n{r['content']}\nURL: {r['url']}" for i, r in enumerate(search_results)])
        await cls.update_agent_state(db, run_id, cls.SUB_TREND_RESEARCHER, "completed", "Тренды собраны", parent_agent=cls.AGENT_SELECTOR, progress=100)

        await cls.update_agent_state(db, run_id, cls.SUB_MEMORY_READER, "running", "Чтение памяти", parent_agent=cls.AGENT_SELECTOR, progress=40)
        insights = await SemanticMemoryService.search_similar_insights(db, "profitable digital guides resell services games funpay", limit=12)
        memory_context = "\n".join([f"- {i.game_name} / {i.subcategory_name}: {i.content[:180]}" for i in insights])
        await cls.update_agent_state(db, run_id, cls.SUB_MEMORY_READER, "completed", f"{len(insights)} инсайтов", parent_agent=cls.AGENT_SELECTOR, progress=100)

        await cls.update_agent_state(db, run_id, cls.SUB_CATEGORY_RANKER, "running", "Ранжирование", parent_agent=cls.AGENT_SELECTOR, progress=60)
        candidate_pool = sorted(all_categories, key=lambda c: (c.game_name.lower(), c.subcategory_name.lower()))[:400]
        available = "\n".join([f"- ID:{c.node_id} | {c.game_name} | {c.subcategory_name} | {c.category_type}" for c in candidate_pool])

        system_prompt = f"""Ты — CategoryRanker для FunPay. Верни строго JSON.
Задача: выбрать перспективные категории под КОНКРЕТНЫЕ настройки пользователя.

Разрешённые типы лотов: {', '.join(run.lot_types_list if run else ['classic','digital','resell','service'])}
Фокус анализа: {getattr(run, 'focus_mode', 'balanced')}
Предпочитать ниши без игрового аккаунта: {getattr(run, 'prefer_no_account', False)}
Мин. конкурентов в нише: {getattr(run, 'min_competition', 0) or 'любое'}
Макс. цена лота: {getattr(run, 'max_price', None) or 'без ограничений'} ₽

Рассуждай ВНУТРИ, наружу только JSON.
Формат:
{{
  "selected_ids": ["81", "119"],
  "reasoning": [
    {{"node_id": "81", "why": "...", "score": 0.92, "hypothesis": "digital|resell|service|classic"}}
  ]
}}
Критерии:
- спрос
- возможность продать БЕЗ владения игровым аккаунтом/ресурсом

- возможность безопасной перепродажи
- адекватная конкуренция
- быстрая оборачиваемость"""

        user_prompt = f"""Нужно выбрать ровно {limit_categories} категорий.

Веб-тренды:
{trend_context}

Память прошлых запусков:
{memory_context}

Список доступных категорий:
{available}

Старайся предпочитать категории, где можно:
- продавать PDF/гайды/чеклисты/файлы
- перепродавать товар у более дешёвого продавца
- оказывать услугу без передачи аккаунта

Верни только JSON."""

        rank_json = await cls.call_llm_json(db, system_prompt, user_prompt, cls.SUB_CATEGORY_RANKER, run_id, parent_agent=cls.AGENT_SELECTOR)
        selected_ids = [str(x) for x in rank_json.get("selected_ids", [])]
        selected = [c for c in all_categories if str(c.node_id) in set(selected_ids)]
        if not selected:
            selected = candidate_pool[:limit_categories]
        await cls.update_agent_state(db, run_id, cls.SUB_CATEGORY_RANKER, "completed", f"Выбрано {len(selected)}", parent_agent=cls.AGENT_SELECTOR, progress=100)
        await cls.log_agent(db, run_id, cls.AGENT_SELECTOR, f"Выбрано {len(selected)} категорий: " + ", ".join([f"{c.game_name} ({c.subcategory_name})" for c in selected]))
        return selected[:limit_categories]

    @classmethod
    async def _analyse_category(
        cls,
        db: AsyncSession,
        run_id: int,
        cat: FunpayGlobalCategory,
        funpay_client: Optional[FanpayClient],
        tavily_key: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        ctx = cls._ctx(cat)

        await cls.update_agent_state(db, run_id, cls.SUB_MARKET_SCRAPER, "running", "Скрапинг лотов", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=10)
        offers = await AgentScraperService.scrape_category_offers(cat.node_id, cat.category_type, funpay_client)
        if not offers:
            offers, detected_category_type = await AgentScraperService.scrape_all_category_types(cat.node_id, funpay_client)
            if offers:
                cat.category_type = detected_category_type
        if not offers:
            await cls.update_agent_state(db, run_id, cls.SUB_MARKET_SCRAPER, "failed", "Нет лотов", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=100, error_message="offers empty")
            return None

        min_p, max_p, avg_p, med_p = cls._market_stats(offers)
        await cls.log_agent(db, run_id, cls.SUB_MARKET_SCRAPER, f"{ctx}: {len(offers)} лотов, min={min_p}, max={max_p}, avg={avg_p:.2f}, median={med_p:.2f}", parent_agent=cls.AGENT_ANALYZER, category_context=ctx)
        await cls.update_agent_state(db, run_id, cls.SUB_MARKET_SCRAPER, "completed", "Скрапинг завершён", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=100)

        await cls.update_agent_state(db, run_id, cls.SUB_WEB_RESEARCHER, "running", "Поиск гайдов", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=35)
        search_query = f"{cat.game_name} {cat.subcategory_name} guide pdf checklist resell funpay strategy 2026"
        guide_results = await AgentSearchService.search(search_query, api_key=tavily_key, max_results=5)
        guide_context = "\n".join([f"- {g['title']}\n{g['content']}\n{g['url']}" for g in guide_results])
        await cls.update_agent_state(db, run_id, cls.SUB_WEB_RESEARCHER, "completed", f"{len(guide_results)} источников", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=100)

        await cls.update_agent_state(db, run_id, cls.SUB_MARKET_CLASSIFIER, "running", "Классификация ниши", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=50)
        inferred_type = AgentScraperService.classify_lot_type(cat.subcategory_name, offers)
        offers_sample = "\n".join([
            f"- Цена:{o.get('price')} | Продавец:{o.get('user')} | Текст:{(o.get('description') or '')[:140]}"
            for o in offers[:20]
        ])
        classifier_prompt = """Ты — MarketClassifier. Определи лучший формат монетизации ниши.
Верни JSON:
{
  "primary_type": "classic|digital|resell|service",
  "secondary_types": ["..."],
  "why": "...",
  "can_sell_without_game_account": true,
  "digital_opportunity": "...",
  "resell_opportunity": "..."
}"""
        classifier_user = f"""Категория: {ctx}
Предварительная эвристика: {inferred_type}
Рынок:
{offers_sample}

Веб-контекст:
{guide_context}

Верни только JSON."""
        classify_json = await cls.call_llm_json(db, classifier_prompt, classifier_user, cls.SUB_MARKET_CLASSIFIER, run_id, parent_agent=cls.AGENT_ANALYZER, category_context=ctx)
        await cls.update_agent_state(db, run_id, cls.SUB_MARKET_CLASSIFIER, "completed", f"Тип: {classify_json.get('primary_type', inferred_type)}", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=100)

        await cls.update_agent_state(db, run_id, cls.SUB_MARGIN_ANALYST, "running", "Маржинальный анализ", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=65)
        margin_prompt = """Ты — MarginAnalyst для FunPay/RMT.
Верни JSON:
{
  "hot_demands": ["..."],
  "automation_potential": "...",
  "easy_supplies": "...",
  "competitor_analysis": "...",
  "pricing_band": {"min": 0, "max": 0, "avg": 0, "median": 0},
  "insights": [{"type": "trend", "content": "..."}]
}"""
        margin_user = f"""Категория: {ctx}
Тип ниши: {classify_json.get('primary_type', inferred_type)}
Рыночные цены: min={min_p}, max={max_p}, avg={avg_p:.2f}, median={med_p:.2f}

Листинг конкурентов:
{offers_sample}

Веб-источники:
{guide_context}

Верни только JSON."""
        analysis_json = await cls.call_llm_json(db, margin_prompt, margin_user, cls.SUB_MARGIN_ANALYST, run_id, parent_agent=cls.AGENT_ANALYZER, category_context=ctx)
        await cls.update_agent_state(db, run_id, cls.SUB_MARGIN_ANALYST, "completed", "Анализ готов", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=100)

        await cls.update_agent_state(db, run_id, cls.SUB_INSIGHT_WRITER, "running", "Сохранение инсайтов", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=85)
        insights = analysis_json.get("insights", [])
        for ins in insights:
            await SemanticMemoryService.save_insight(
                db=db,
                run_id=run_id,
                game_name=cat.game_name,
                subcategory_name=cat.subcategory_name,
                insight_type=ins.get("type", "trend"),
                content=ins.get("content", ""),
            )
        await cls.update_agent_state(db, run_id, cls.SUB_INSIGHT_WRITER, "completed", f"{len(insights)} инсайтов", parent_agent=cls.AGENT_ANALYZER, category_context=ctx, progress=100)

        return {
            "game_name": cat.game_name,
            "subcategory_name": cat.subcategory_name,
            "category_context": ctx,
            "analysis": analysis_json,
            "market": {"min": min_p, "max": max_p, "avg": avg_p, "median": med_p},
            "offers": offers,
            "primary_type": classify_json.get("primary_type", inferred_type),
            "secondary_types": classify_json.get("secondary_types", []),
            "digital_opportunity": classify_json.get("digital_opportunity", ""),
            "resell_opportunity": classify_json.get("resell_opportunity", ""),
            "can_sell_without_game_account": classify_json.get("can_sell_without_game_account", False),
        }

    @classmethod
    async def _generate_for_category(cls, db: AsyncSession, run_id: int, item: Dict[str, Any], run: Any = None) -> List[GeneratedLot]:
        g_name = item["game_name"]
        sub_name = item["subcategory_name"]
        ctx = item["category_context"]
        analysis = item["analysis"]
        market = item["market"]
        offers = item.get("offers", [])
        primary_type = item.get("primary_type", "classic")

        # Применяем фильтр разрешённых типов лотов
        allowed_types = run.lot_types_list if run else ["classic", "digital", "resell", "service"]
        if primary_type not in allowed_types:
            # Берём первый разрешённый тип как fallback
            primary_type = allowed_types[0] if allowed_types else "classic"

        # Настройки из run
        price_strategy_override = getattr(run, "price_strategy", "auto") if run else "auto"
        generate_seo = getattr(run, "generate_seo", True) if run else True
        min_margin_pct = getattr(run, "min_margin_pct", 10.0) if run else 10.0
        max_price = getattr(run, "max_price", None) if run else None
        focus_mode = getattr(run, "focus_mode", "balanced") if run else "balanced"

        await cls.update_agent_state(db, run_id, cls.SUB_SUPPLY_STRATEGIST, "running", "План поставки", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=15)
        supply_plan = analysis.get("easy_supplies", "")
        await cls.update_agent_state(db, run_id, cls.SUB_SUPPLY_STRATEGIST, "completed", "Стратегия готова", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=100)

        digital_idea = ""
        digital_difficulty = None
        if primary_type == "digital":
            await cls.update_agent_state(db, run_id, cls.SUB_DIGITAL_IDEATOR, "running", "Идея цифрового товара", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=35)
            digi_prompt = """Ты — DigitalIdeator. Придумай цифровой товар, который можно продать как файл/гайд.
Верни JSON:
{
  "idea": "...",
  "difficulty": "easy|medium|hard",
  "deliverable_type": "pdf|checklist|video|template|script",
  "contents": ["...", "..."],
  "why_buy": "..."
}"""
            digi_user = f"""Категория: {ctx}
Спрос: {analysis.get('competitor_analysis', '')}
Возможность: {item.get('digital_opportunity', '')}
Рынок: median={market['median']:.2f}, avg={market['avg']:.2f}

Верни JSON."""
            digi_json = await cls.call_llm_json(db, digi_prompt, digi_user, cls.SUB_DIGITAL_IDEATOR, run_id, parent_agent=cls.AGENT_GENERATOR, category_context=ctx)
            digital_idea = digi_json.get("idea", "")
            digital_difficulty = digi_json.get("difficulty")
            await cls.update_agent_state(db, run_id, cls.SUB_DIGITAL_IDEATOR, "completed", "Идея готова", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=100)

        resell_source = None
        resell_buy_price = None
        resell_margin = None
        if primary_type == "resell":
            await cls.update_agent_state(db, run_id, cls.SUB_RESELL_SCOUT, "running", "Поиск поставщика", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=35)
            suppliers = AgentScraperService.find_cheapest_supplier(offers)
            if suppliers:
                cheapest = suppliers[0]
                resell_buy_price = float(cheapest.get("price", 0) or 0)
                resell_source = f"https://funpay.com/lots/offer?id={cheapest.get('lot_id')}"
                resell_margin = AgentScraperService.calc_resell_margin(resell_buy_price, market['median'] or market['avg'] or resell_buy_price)
            await cls.update_agent_state(db, run_id, cls.SUB_RESELL_SCOUT, "completed", f"Поставщик найден" if resell_source else "Поставщик не найден", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=100)

        await cls.update_agent_state(db, run_id, cls.SUB_COPYWRITER, "running", "Генерация текстов", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=45)
        system_prompt = """Ты — CopywriterAgent для FunPay. Пиши продающие и реалистичные карточки.
Верни JSON:
{
  "draft_lots": [
    {
      "title": "...",
      "description": "...",
      "amount": 10,
      "ai_reasoning": "...",
      "seo_keywords": ["..."],
      "lot_type": "classic|digital|resell|service"
    }
  ]
}"""
        user_prompt = f"""Категория: {ctx}
Основной тип: {primary_type}
Спрос: {analysis.get('competitor_analysis', '')}
Автоматизация: {analysis.get('automation_potential', '')}
Поставка: {supply_plan}
Цифровая идея: {digital_idea}
Источник перепродажи: {resell_source or 'нет'}
Маржа перепродажи: {resell_margin if resell_margin is not None else 'неизвестно'}

Правила:
- Если тип digital: лот должен продавать файл/гайд/чеклист, без требований к игровому аккаунту
- Если тип resell: в описании должен быть акцент на быструю доставку и надёжность
- Если type service: услуга без владения игровым аккаунтом пользователя
- Не пиши невозможные обещания

Сгенерируй 6-10 draft_lots. Только JSON."""
        draft_json = await cls.call_llm_json(db, system_prompt, user_prompt, cls.SUB_COPYWRITER, run_id, parent_agent=cls.AGENT_GENERATOR, category_context=ctx)
        draft_lots = draft_json.get("draft_lots", [])
        await cls.update_agent_state(db, run_id, cls.SUB_COPYWRITER, "completed", f"Черновиков: {len(draft_lots)}", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=100)

        await cls.update_agent_state(db, run_id, cls.SUB_PRICING, "running", "Расчёт цен", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=70)
        pricing_prompt = """Ты — PricingAgent. Верни JSON с рассчитанными ценами.
Формат:
{
  "priced_lots": [
    {"title": "...", "price": 199, "strategy": "undercut|premium|median|resell_margin", "why": "..."}
  ]
}"""
        pricing_user = f"""Рынок {ctx}: min={market['min']}, max={market['max']}, avg={market['avg']:.2f}, median={market['median']:.2f}
Тип категории: {primary_type}
Цена закупки для перепродажи: {resell_buy_price if resell_buy_price is not None else 'нет'}
Маржа перепродажи: {resell_margin if resell_margin is not None else 'нет'}
Черновики:
{json.dumps(draft_lots, ensure_ascii=False)}

Правила:
- digital: можно чуть выше median, если ценность файла хорошая
- resell: обязательно оставь положительную маржу после комиссии 7%
- classic/service: обычная логика рынка

Верни priced_lots JSON."""
        pricing_json = await cls.call_llm_json(db, pricing_prompt, pricing_user, cls.SUB_PRICING, run_id, parent_agent=cls.AGENT_GENERATOR, category_context=ctx)
        priced_map = {p.get('title'): p for p in pricing_json.get('priced_lots', [])}
        await cls.update_agent_state(db, run_id, cls.SUB_PRICING, "completed", "Цены рассчитаны", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=100)

        await cls.update_agent_state(db, run_id, cls.SUB_SEO, "running", "SEO-поля", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=85)
        await cls.update_agent_state(db, run_id, cls.SUB_SEO, "completed", "SEO готово", parent_agent=cls.AGENT_GENERATOR, category_context=ctx, progress=100)

        saved: List[GeneratedLot] = []
        for d in draft_lots:
            p = priced_map.get(d.get("title"), {})
            lot_type = d.get("lot_type") or primary_type or "classic"

            # Фильтр: скипаем тип, не входящий в allowed_types
            if lot_type not in allowed_types:
                continue

            fallback_price = market["median"] or market["avg"] or 10.0
            if lot_type == "resell" and resell_buy_price:
                fallback_price = max(fallback_price, round(resell_buy_price * 1.20, 2))
            price = float(p.get("price", fallback_price))

            # Применяем price_strategy_override (если не auto — форсируем стратегию)
            if price_strategy_override and price_strategy_override != "auto":
                if price_strategy_override == "undercut":
                    price = round(min(market["median"] or price, market["min"] or price) * 0.92, 2)
                elif price_strategy_override == "premium":
                    price = round((market["median"] or price) * 1.15, 2)
                elif price_strategy_override == "median":
                    price = round(market["median"] or price, 2)
                price = max(price, 1.0)

            # Применяем max_price
            if max_price and price > max_price:
                price = max_price

            # Фильтр по минимальной марже для resell
            if lot_type == "resell" and resell_margin is not None:
                if resell_margin < min_margin_pct:
                    continue  # Маржа ниже порога — пропускаем

            strategy = p.get("strategy", price_strategy_override if price_strategy_override != "auto" else "median")
            seo_kw = d.get("seo_keywords", []) if generate_seo else []
            fields_json = {
                "fields[summary][ru]": d.get("title", ""),
                "fields[desc][ru]": d.get("description", ""),
                "fields[payment_msg][ru]": "Спасибо за покупку! Инструкция или выдача будет отправлена автоматически.",
                "price": str(int(price)) if price >= 1 else str(price),
                "amount": str(int(d.get("amount", 10))),
                "seo_keywords": seo_kw,
                "lot_type": lot_type,
            }
            lot = GeneratedLot(
                run_id=run_id,
                game_name=g_name,
                subcategory_name=sub_name,
                title=d.get("title", ""),
                description=d.get("description", ""),
                amount=int(d.get("amount", 10)),
                price=price,
                ai_reasoning=d.get("ai_reasoning", p.get("why", "")),
                fields_json=fields_json,
                price_min_market=market["min"],
                price_max_market=market["max"],
                price_avg_market=market["avg"],
                price_strategy=strategy,
                lot_type=lot_type,
                resell_source_url=resell_source if lot_type == "resell" else None,
                resell_source_price=resell_buy_price if lot_type == "resell" else None,
                resell_margin_pct=resell_margin if lot_type == "resell" else None,
                digital_content_idea=digital_idea if lot_type == "digital" else None,
                digital_difficulty=digital_difficulty if lot_type == "digital" else None,
            )
            db.add(lot)
            saved.append(lot)
        await db.commit()
        for lot in saved:
            await db.refresh(lot)
        return saved

    @classmethod
    async def retry_subagent(
        cls,
        db: AsyncSession,
        run_id: int,
        agent_name: str,
        parent_agent: Optional[str],
        category_context: Optional[str],
    ) -> Dict[str, Any]:
        stmt = select(AgentState).where(
            AgentState.run_id == run_id,
            AgentState.agent_name == agent_name,
            AgentState.parent_agent == parent_agent,
            AgentState.category_context == category_context,
        )
        res = await db.execute(stmt)
        st = res.scalar_one_or_none()
        if not st:
            raise RuntimeError("subagent state not found")
        st.status = "pending"
        st.progress = 0
        st.retry_count = (st.retry_count or 0) + 1
        st.error_message = None
        db.add(st)
        await db.commit()
        await cls.notify(db, f"agent_run_{run_id}", {
            "type": "retry",
            "agent_name": agent_name,
            "parent_agent": parent_agent,
            "category_context": category_context,
            "retry_count": st.retry_count,
        })
        return {"success": True, "retry_count": st.retry_count}

    @classmethod
    async def run_analysis_flow(
        cls,
        db: AsyncSession,
        run_id: int,
        tavily_key: Optional[str] = None,
        manual_node_ids: Optional[List[str]] = None,
    ):
        try:
            run = await db.get(AgentRun, run_id)
            if not run:
                return
            run.status = "running"
            db.add(run)
            await db.commit()
            await cls.notify(db, f"agent_run_{run_id}", {"type": "run_meta", "run_status": run.status, "total_cost_tokens": run.total_cost_tokens})

            for ag in cls.MAIN_AGENTS:
                await cls.update_agent_state(db, run_id, ag, "pending", "Ожидание")
            for parent, subagents in cls.SUBAGENTS_BY_PARENT.items():
                for sub in subagents:
                    await cls.update_agent_state(db, run_id, sub, "pending", "Ожидание", parent_agent=parent)

            all_categories = list((await db.execute(select(FunpayGlobalCategory))).scalars().all())
            if not all_categories:
                await cls.log_agent(db, run_id, cls.AGENT_SELECTOR, "Категории не найдены", "error")
                raise RuntimeError("No categories in DB")

            await cls.update_agent_state(db, run_id, cls.AGENT_SELECTOR, "running", "Отбор категорий", progress=15)
            selected_categories = await cls._selector_phase(db, run_id, all_categories, run.limit_categories, tavily_key, manual_node_ids, run=run)
            await cls.update_agent_state(db, run_id, cls.AGENT_SELECTOR, "completed", f"Выбрано {len(selected_categories)}", progress=100)
            await cls.update_run_progress(db, run_id, 0, len(selected_categories))

            await cls.update_agent_state(db, run_id, cls.AGENT_ANALYZER, "running", "Анализ категорий", progress=10)
            acc_res = await db.execute(select(FanpayAccount).where(FanpayAccount.always_online == True))
            active_account = acc_res.scalars().first()
            funpay_client = FanpayClient(
                golden_key=active_account.golden_key,
                proxy_url=active_account.proxy_url,
                user_agent=active_account.user_agent,
                cookies=active_account.cookies,
            ) if active_account else None

            semaphore = asyncio.Semaphore(3)
            done_count = 0

            async def worker(cat: FunpayGlobalCategory):
                nonlocal done_count
                async with semaphore:
                    async with async_session_maker() as worker_db:
                        try:
                            res = await cls._analyse_category(worker_db, run_id, cat, funpay_client, tavily_key)
                            done_count += 1
                            await cls.update_run_progress(worker_db, run_id, done_count, len(selected_categories))
                            return res
                        except Exception as e:
                            logger.error(f"Воркер {cat.game_name}/{cat.subcategory_name} упал: {e}")
                            return None

            analyzed_results = await asyncio.gather(*[worker(cat) for cat in selected_categories])
            analyzed_results = [x for x in analyzed_results if x is not None]
            await cls.update_agent_state(db, run_id, cls.AGENT_ANALYZER, "completed", f"Проанализировано {len(analyzed_results)}", progress=100)

            await cls.update_agent_state(db, run_id, cls.AGENT_GENERATOR, "running", "Генерация лотов", progress=20)
            all_lots: List[GeneratedLot] = []
            for item in analyzed_results:
                all_lots.extend(await cls._generate_for_category(db, run_id, item, run=run))
            await cls.update_agent_state(db, run_id, cls.AGENT_GENERATOR, "completed", f"Сгенерировано {len(all_lots)}", progress=100)

            await cls.update_agent_state(db, run_id, cls.AGENT_PUBLISHER, "running", "Финализация", progress=30)
            await cls.update_agent_state(db, run_id, cls.SUB_QUALITY, "running", "Проверка полноты", parent_agent=cls.AGENT_PUBLISHER, progress=25)
            quality_passed = [lot for lot in all_lots if lot.title and lot.description and lot.price > 0]
            await cls.update_agent_state(db, run_id, cls.SUB_QUALITY, "completed", f"Проверено {len(quality_passed)}", parent_agent=cls.AGENT_PUBLISHER, progress=100)

            await cls.update_agent_state(db, run_id, cls.SUB_DUPLICATE, "running", "Удаление дублей", parent_agent=cls.AGENT_PUBLISHER, progress=50)
            seen = set()
            duplicates = []
            for lot in quality_passed:
                key = (lot.game_name.strip().lower(), lot.title.strip().lower(), lot.lot_type)
                if key in seen:
                    duplicates.append(lot.id)
                else:
                    seen.add(key)
            if duplicates:
                stmt = select(GeneratedLot).where(GeneratedLot.id.in_(duplicates))
                dup_res = await db.execute(stmt)
                for lot in dup_res.scalars().all():
                    await db.delete(lot)
                await db.commit()
            await cls.update_agent_state(db, run_id, cls.SUB_DUPLICATE, "completed", f"Удалено дублей: {len(duplicates)}", parent_agent=cls.AGENT_PUBLISHER, progress=100)

            await cls.update_agent_state(db, run_id, cls.SUB_EXPORTER, "completed", "Лоты готовы к экспорту", parent_agent=cls.AGENT_PUBLISHER, progress=100)
            await cls.update_agent_state(db, run_id, cls.AGENT_PUBLISHER, "completed", "Финализация завершена", progress=100)

            run = await db.get(AgentRun, run_id)
            if run:
                run.status = "completed"
                run.completed_at = datetime.utcnow()
                db.add(run)
                await db.commit()
                await cls.notify(db, f"agent_run_{run_id}", {
                    "type": "done",
                    "run_status": run.status,
                    "total_cost_tokens": run.total_cost_tokens,
                    "lots_count": len(all_lots) - len(duplicates),
                    "categories_done": run.categories_done,
                    "categories_total": run.categories_total,
                })
        except asyncio.CancelledError:
            run = await db.get(AgentRun, run_id)
            if run:
                run.status = "failed"
                run.completed_at = datetime.utcnow()
                db.add(run)
                await db.commit()
            await cls.log_agent(db, run_id, "System", "Анализ отменён пользователем", "warning")
            await cls.notify(db, f"agent_run_{run_id}", {"type": "error", "message": "Анализ отменён пользователем"})
            ACTIVE_TASKS.pop(run_id, None)
        except Exception as err:
            logger.exception(err)
            run = await db.get(AgentRun, run_id)
            if run:
                run.status = "failed"
                run.completed_at = datetime.utcnow()
                db.add(run)
                await db.commit()
            await cls.log_agent(db, run_id, "System", f"Критический сбой: {err}", "error")
            await cls.notify(db, f"agent_run_{run_id}", {"type": "error", "message": str(err)})
            ACTIVE_TASKS.pop(run_id, None)
        else:
            ACTIVE_TASKS.pop(run_id, None)
