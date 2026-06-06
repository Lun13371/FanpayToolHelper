import logging
import json
import asyncio
import random
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
import litellm

from app.models.account import FanpayAccount
from app.models.global_category import FunpayGlobalCategory
from app.models.agents import AgentRun, AgentState, AgentLog, GeneratedLot, AgentInsight
from app.services.ai import AIService
from app.services.fanpay_client import FanpayClient
from app.services.agents.search import AgentSearchService
from app.services.agents.memory import SemanticMemoryService
from app.services.agents.scraper import AgentScraperService

logger = logging.getLogger("fanpay.agents.orchestrator")

# Реестр активных asyncio-задач: run_id -> Task
# Используется для отмены через cancel()
ACTIVE_TASKS: Dict[int, asyncio.Task] = {}


class AgentOrchestrator:
    """
    Оркестратор агентной системы анализа FunPay.
    5 агентов: CategorySelector, Memory, ListingAnalyzer, LotGenerator, Publisher
    Поддерживает: отмену задачи, изоляцию по user_id, параллельный анализ категорий.
    """

    AGENT_SELECTOR  = "CategorySelector"
    AGENT_MEMORY    = "Memory"
    AGENT_ANALYZER  = "ListingAnalyzer"
    AGENT_GENERATOR = "LotGenerator"
    AGENT_PUBLISHER = "Publisher"

    ALL_AGENTS = ["CategorySelector", "Memory", "ListingAnalyzer", "LotGenerator", "Publisher"]

    # ── Helpers ──────────────────────────────────────────────────────────────

    @classmethod
    async def log_agent(cls, db: AsyncSession, run_id: int, agent_name: str, message: str, level: str = "info"):
        log_entry = AgentLog(run_id=run_id, agent_name=agent_name, message=message, level=level)
        db.add(log_entry)
        await db.commit()
        logger.info(f"[{agent_name}] {level.upper()}: {message}")

    @classmethod
    async def update_agent_state(
        cls, db: AsyncSession, run_id: int, agent_name: str,
        status: str, current_task: Optional[str] = None, tokens_used: int = 0
    ):
        stmt = select(AgentState).where(AgentState.run_id == run_id, AgentState.agent_name == agent_name)
        res = await db.execute(stmt)
        state = res.scalar_one_or_none()
        if not state:
            state = AgentState(run_id=run_id, agent_name=agent_name, status=status,
                               current_task=current_task, tokens_used=tokens_used, updated_at=datetime.utcnow())
        else:
            state.status = status
            if current_task is not None:
                state.current_task = current_task
            state.tokens_used += tokens_used
            state.updated_at = datetime.utcnow()
        db.add(state)
        await db.commit()

    @classmethod
    async def call_llm_json(cls, db: AsyncSession, system_prompt: str, user_prompt: str,
                            agent_name: str, run_id: int) -> Dict[str, Any]:
        candidate_models = [
            "accounts/fireworks/models/kimi-k2p5",
            "accounts/fireworks/models/llama-v3p3-70b-instruct",
            "accounts/fireworks/models/llama-v3p1-70b-instruct",
            "accounts/fireworks/models/qwen2p5-72b-instruct"
        ]
        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
        last_exception = None

        for model in candidate_models:
            key_obj = await AIService.get_next_key(db)
            if not key_obj:
                raise RuntimeError("Нет активных ключей ИИ в базе данных")
            try:
                logger.info(f"[{agent_name}] Попытка вызова модели {model}...")
                response = await litellm.acompletion(
                    model=model, custom_llm_provider="fireworks_ai",
                    messages=messages, api_key=key_obj.key_value,
                    temperature=0.2, max_tokens=4000,
                    response_format={"type": "json_object"}, timeout=120.0
                )
                await AIService.mark_key_success(db, key_obj)
                usage = getattr(response, 'usage', None)
                tokens = usage.total_tokens if usage else 0
                await cls.update_agent_state(db, run_id, agent_name, "running", tokens_used=tokens)
                stmt = select(AgentRun).where(AgentRun.id == run_id)
                run_res = await db.execute(stmt)
                run_obj = run_res.scalar_one()
                run_obj.total_cost_tokens += tokens
                db.add(run_obj)
                await db.commit()
                raw_text = response.choices[0].message.content.strip()
                return json.loads(raw_text)
            except asyncio.CancelledError:
                raise  # пробрасываем отмену наверх
            except Exception as e:
                logger.warning(f"Ошибка вызова модели {model} для {agent_name}: {e}")
                await AIService.mark_key_failure(db, key_obj)
                last_exception = e
                continue

        raise last_exception if last_exception else RuntimeError("Все модели-кандидаты вернули ошибку.")

    # ── Analyse one category (параллельно) ──────────────────────────────────

    @classmethod
    async def _analyse_category(
        cls, db: AsyncSession, run_id: int, cat: FunpayGlobalCategory,
        index: int, total: int, funpay_client: Optional[FanpayClient],
        tavily_key: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        """Анализирует одну категорию: парсинг + веб-поиск + LLM + сохранение инсайтов."""
        task_desc = f"Парсинг [{index+1}/{total}]: {cat.game_name}"
        await cls.update_agent_state(db, run_id, cls.AGENT_ANALYZER, "running", task_desc)
        await cls.log_agent(db, run_id, cls.AGENT_ANALYZER,
                            f"Парсинг категории: {cat.game_name} → {cat.subcategory_name} (ID: {cat.node_id})")

        offers = await AgentScraperService.scrape_category_offers(cat.node_id, cat.category_type, funpay_client)
        if not offers:
            await cls.log_agent(db, run_id, cls.AGENT_ANALYZER,
                                f"В {cat.game_name} нет активных лотов. Пропускаем.", "warning")
            return None

        prices = [o["price"] for o in offers if o["price"] > 0]
        avg_price = sum(prices) / len(prices) if prices else 0
        await cls.log_agent(db, run_id, cls.AGENT_ANALYZER,
                            f"{cat.game_name}: {len(offers)} предложений, ср. цена {avg_price:.2f}₽")

        # Веб-поиск
        await cls.update_agent_state(db, run_id, cls.AGENT_ANALYZER, "running", f"Поиск по {cat.game_name}")
        search_query = f"how to farm cheap purchase keys automation {cat.game_name} {cat.subcategory_name}"
        guide_results = await AgentSearchService.search(search_query, api_key=tavily_key, max_results=3)
        guide_context = "\n".join(f"- {r['url']}\n{r['title']}\n{r['content']}" for r in guide_results)

        # LLM-анализ
        await cls.update_agent_state(db, run_id, cls.AGENT_ANALYZER, "running", f"ИИ-анализ {cat.game_name}")
        offers_sample = "\n".join(
            f"- ID {o['lot_id']} | {o['price']}₽ | {o['amount']} шт. | {o['user']} | {o['description'][:120]}"
            for o in offers[:25]
        )
        system_prompt = """Ты — экспертный RMT-аналитик. Проанализируй листинг FunPay и веб-данные, верни JSON:
{
  "hot_demands": ["..."],
  "automation_potential": "...",
  "easy_supplies": "...",
  "competitor_analysis": "...",
  "insights": [
    {"type": "trend", "content": "..."},
    {"type": "demand", "content": "..."},
    {"type": "automation_potential", "content": "..."}
  ]
}"""
        user_prompt = f"""Категория: {cat.game_name} → {cat.subcategory_name}
Листинг конкурентов:
{offers_sample}

Веб-источники:
{guide_context}"""

        analysis_json = await cls.call_llm_json(db, system_prompt, user_prompt, cls.AGENT_ANALYZER, run_id)

        # Сохраняем инсайты в Memory
        await cls.update_agent_state(db, run_id, cls.AGENT_MEMORY, "running",
                                     f"Запись инсайтов: {cat.game_name}")
        insights = analysis_json.get("insights", [])
        for ins in insights:
            await SemanticMemoryService.save_insight(
                db=db, run_id=run_id, game_name=cat.game_name,
                subcategory_name=cat.subcategory_name,
                insight_type=ins.get("type", "trend"), content=ins.get("content", "")
            )
        await cls.log_agent(db, run_id, cls.AGENT_MEMORY,
                            f"Сохранено {len(insights)} инсайтов для {cat.game_name}")

        return {"game_name": cat.game_name, "subcategory_name": cat.subcategory_name, "analysis": analysis_json}

    # ── Main flow ────────────────────────────────────────────────────────────

    @classmethod
    async def run_analysis_flow(
        cls, db: AsyncSession, run_id: int,
        tavily_key: Optional[str] = None,
        manual_node_ids: Optional[List[str]] = None
    ):
        """
        Основной фоновый поток. 5 агентов, параллельный анализ категорий.
        Поддерживает asyncio.CancelledError для корректной отмены.
        """
        try:
            stmt = select(AgentRun).where(AgentRun.id == run_id)
            run_res = await db.execute(stmt)
            run = run_res.scalar_one_or_none()
            if not run:
                logger.error(f"Run {run_id} не найден в БД")
                return

            run.status = "running"
            db.add(run)
            await db.commit()

            # Инициализируем все 5 агентов
            for ag in cls.ALL_AGENTS:
                await cls.update_agent_state(db, run_id, ag, "pending", "Ожидание")
            await cls.update_agent_state(db, run_id, cls.AGENT_SELECTOR, "running", "Инициализация")
            await cls.log_agent(db, run_id, cls.AGENT_SELECTOR, "Оркестратор запущен. Проверка категорий...")

            # ── 0. Синхронизация категорий ──────────────────────────────────
            stmt_count = select(FunpayGlobalCategory)
            cat_count_res = await db.execute(stmt_count)
            all_categories = list(cat_count_res.scalars().all())

            if not all_categories:
                await cls.log_agent(db, run_id, cls.AGENT_SELECTOR,
                                    "Категории отсутствуют. Запуск синхронизации...", "warning")
                acc_stmt = select(FanpayAccount).where(FanpayAccount.always_online == True)
                acc_res = await db.execute(acc_stmt)
                active_account = acc_res.scalars().first()
                client = FanpayClient(
                    golden_key=active_account.golden_key, proxy_url=active_account.proxy_url,
                    user_agent=active_account.user_agent, cookies=active_account.cookies
                ) if active_account else FanpayClient("", "", "", {})

                try:
                    categories_parsed = await client.parse_all_categories_and_subcategories()
                except Exception as ex:
                    logger.warning(f"Сбой парсинга категорий: {ex}")
                    categories_parsed = []

                total_parsed = sum(len(g.get("subcategories", [])) for g in categories_parsed) if categories_parsed else 0

                if categories_parsed and total_parsed > 0:
                    for game in categories_parsed:
                        for sub in game["subcategories"]:
                            db.add(FunpayGlobalCategory(
                                game_name=game["game_name"], subcategory_name=sub["name"],
                                node_id=sub["node_id"], category_type=sub["type"]
                            ))
                    await db.commit()
                else:
                    await cls.log_agent(db, run_id, cls.AGENT_SELECTOR,
                                        "Скрапинг заблокирован. Загружаем резервные категории.", "warning")
                    for fd in [
                        {"game_name": "Dota 2", "subcategory_name": "Услуги", "node_id": "83", "category_type": "lots"},
                        {"game_name": "Counter-Strike 2", "subcategory_name": "Предметы", "node_id": "119", "category_type": "lots"},
                        {"game_name": "Steam", "subcategory_name": "Игры", "node_id": "421", "category_type": "lots"},
                        {"game_name": "Roblox", "subcategory_name": "Робуксы", "node_id": "1225", "category_type": "lots"},
                        {"game_name": "Rust", "subcategory_name": "Предметы", "node_id": "745", "category_type": "lots"},
                        {"game_name": "Brawl Stars", "subcategory_name": "Аккаунты", "node_id": "1940", "category_type": "lots"},
                        {"game_name": "GTA 5 RP", "subcategory_name": "Валюта", "node_id": "1002", "category_type": "lots"},
                        {"game_name": "World of Warcraft", "subcategory_name": "Золото", "node_id": "81", "category_type": "lots"},
                        {"game_name": "Genshin Impact", "subcategory_name": "Услуги", "node_id": "921", "category_type": "lots"},
                        {"game_name": "Mobile Legends", "subcategory_name": "Алмазы", "node_id": "1802", "category_type": "lots"},
                    ]:
                        db.add(FunpayGlobalCategory(**fd))
                    await db.commit()

                stmt_count = select(FunpayGlobalCategory)
                cat_count_res = await db.execute(stmt_count)
                all_categories = list(cat_count_res.scalars().all())
                await cls.log_agent(db, run_id, cls.AGENT_SELECTOR,
                                    f"Доступно {len(all_categories)} категорий.")

            # ── ЭТАП 1: CategorySelector ──────────────────────────────────────
            selected_categories: List[FunpayGlobalCategory] = []

            if manual_node_ids:
                # Ручной режим: пользователь выбрал конкретные node_id
                await cls.log_agent(db, run_id, cls.AGENT_SELECTOR,
                                    f"Ручной режим. Выбрано {len(manual_node_ids)} категорий пользователем.")
                id_set = set(str(nid) for nid in manual_node_ids)
                selected_categories = [c for c in all_categories if str(c.node_id) in id_set]
                if not selected_categories:
                    selected_categories = all_categories[:run.limit_categories]
            else:
                # Авто-режим: LLM выбирает категории
                await cls.log_agent(db, run_id, cls.AGENT_SELECTOR,
                                    "Авто-режим. Поиск горячих RMT-трендов...")
                await cls.update_agent_state(db, run_id, cls.AGENT_SELECTOR, "running", "Поиск трендов")

                search_results = await AgentSearchService.search(
                    "most profitable games for RMT selling funpay popular games 2026",
                    api_key=tavily_key, max_results=5
                )
                search_context = "\n".join(
                    f"Источник #{i+1} ({r['url']}):\n{r['title']}\n{r['content']}"
                    for i, r in enumerate(search_results)
                )

                # Memory: ищем прошлые инсайты
                await cls.update_agent_state(db, run_id, cls.AGENT_MEMORY, "running",
                                             "Поиск прошлых инсайтов в памяти")
                await cls.log_agent(db, run_id, cls.AGENT_MEMORY, "Извлечение инсайтов из семантической памяти...")
                past_insights = await SemanticMemoryService.search_similar_insights(
                    db, "profitable games high demand", limit=5
                )
                past_context = ""
                if past_insights:
                    past_context = "Ранее сохранённые инсайты:\n"
                    past_context += "\n".join(
                        f"- {pi.game_name} ({pi.subcategory_name}): {pi.content[:150]}"
                        for pi in past_insights
                    )
                await cls.update_agent_state(db, run_id, cls.AGENT_MEMORY, "completed",
                                             f"Извлечено {len(past_insights)} инсайтов")
                await cls.log_agent(db, run_id, cls.AGENT_MEMORY,
                                    f"Память: найдено {len(past_insights)} релевантных инсайтов.")

                await cls.update_agent_state(db, run_id, cls.AGENT_SELECTOR, "running", "LLM выбирает категории")

                # Сортируем по популярным играм, не случайно
                priority_games = ["dota", "counter", "cs", "steam", "gta", "rust", "pubg", "brawl",
                                  "roblox", "genshin", "warcraft", "pubg", "valorant", "minecraft"]
                def sort_key(c: FunpayGlobalCategory) -> int:
                    name_lower = c.game_name.lower()
                    for i, kw in enumerate(priority_games):
                        if kw in name_lower:
                            return i
                    return len(priority_games)
                sorted_cats = sorted(all_categories, key=sort_key)
                sampled_cats = sorted_cats[:120]

                available_cats_str = "\n".join(
                    f"- ID: {c.node_id} | {c.game_name} | {c.subcategory_name} | {c.category_type}"
                    for c in sampled_cats
                )

                system_prompt = """Ты — аналитик RMT-рынка FunPay. Выбери N самых перспективных категорий.
Верни JSON: {"selected_ids": ["81", "119"], "reasoning": "..."}"""
                user_prompt = f"""Выбери ровно {run.limit_categories} категорий.

Веб-тренды:
{search_context}

{past_context}

Доступные категории:
{available_cats_str}

Верни JSON с выбранными node_id."""

                llm_response = await cls.call_llm_json(db, system_prompt, user_prompt, cls.AGENT_SELECTOR, run_id)
                selected_ids = llm_response.get("selected_ids", [])

                for cat_id in selected_ids:
                    cat_obj = next((c for c in all_categories if str(c.node_id) == str(cat_id)), None)
                    if cat_obj:
                        selected_categories.append(cat_obj)

                if not selected_categories:
                    await cls.log_agent(db, run_id, cls.AGENT_SELECTOR,
                                        "LLM не вернул валидные ID. Аварийный выбор.", "warning")
                    selected_categories = sorted_cats[:run.limit_categories]

            await cls.log_agent(db, run_id, cls.AGENT_SELECTOR,
                                f"Отобрано {len(selected_categories)} категорий: " +
                                ", ".join(f"{c.game_name} ({c.subcategory_name})" for c in selected_categories))
            await cls.update_agent_state(db, run_id, cls.AGENT_SELECTOR, "completed", "Выбор завершён")

            # ── ЭТАП 2: ListingAnalyzer (параллельно) ─────────────────────────
            await cls.update_agent_state(db, run_id, cls.AGENT_ANALYZER, "running", "Параллельный анализ")
            await cls.log_agent(db, run_id, cls.AGENT_ANALYZER,
                                f"Параллельный анализ {len(selected_categories)} категорий...")

            acc_stmt = select(FanpayAccount).where(FanpayAccount.always_online == True)
            acc_res = await db.execute(acc_stmt)
            active_account = acc_res.scalars().first()
            funpay_client = FanpayClient(
                golden_key=active_account.golden_key, proxy_url=active_account.proxy_url,
                user_agent=active_account.user_agent, cookies=active_account.cookies
            ) if active_account else None

            # Параллельный запуск — максимум 3 одновременно (semaphore)
            semaphore = asyncio.Semaphore(3)

            async def bounded_analyse(cat: FunpayGlobalCategory, idx: int) -> Optional[Dict]:
                async with semaphore:
                    return await cls._analyse_category(
                        db, run_id, cat, idx, len(selected_categories), funpay_client, tavily_key
                    )

            results = await asyncio.gather(
                *[bounded_analyse(cat, i) for i, cat in enumerate(selected_categories)],
                return_exceptions=False
            )
            category_analyses = [r for r in results if r is not None]

            await cls.log_agent(db, run_id, cls.AGENT_ANALYZER,
                                f"Анализ завершён. Успешно обработано {len(category_analyses)} категорий.")
            await cls.update_agent_state(db, run_id, cls.AGENT_ANALYZER, "completed", "Анализ завершён")
            await cls.update_agent_state(db, run_id, cls.AGENT_MEMORY, "completed", "Инсайты сохранены")

            # ── ЭТАП 3: LotGenerator ─────────────────────────────────────────
            await cls.update_agent_state(db, run_id, cls.AGENT_GENERATOR, "running", "Синтез лотов")
            await cls.log_agent(db, run_id, cls.AGENT_GENERATOR, "Генератор запускает синтез каталога лотов...")

            total_generated = 0
            for idx, cat_analysis in enumerate(category_analyses):
                g_name  = cat_analysis["game_name"]
                sub_name = cat_analysis["subcategory_name"]
                analysis = cat_analysis["analysis"]

                await cls.update_agent_state(db, run_id, cls.AGENT_GENERATOR, "running",
                                             f"Генерация [{idx+1}/{len(category_analyses)}]: {g_name}")
                await cls.log_agent(db, run_id, cls.AGENT_GENERATOR,
                                    f"Генерация лотов для {g_name} → {sub_name}...")

                system_prompt = """Ты — копирайтер и эксперт по продажам FunPay. Сгенерируй список лотов.
Верни JSON: {"lots": [{"title": "...", "description": "...", "price": 99.0, "amount": 50,
"ai_reasoning": "...", "fields_json": {"fields[summary][ru]": "...", "fields[desc][ru]": "...",
"fields[payment_msg][ru]": "...", "price": "99", "amount": "50"}}]}"""

                user_prompt = f"""Сгенерируй 10-15 прибыльных лотов для {g_name} ({sub_name}).
Конкуренты: {analysis.get('competitor_analysis', '')}
Автоматизация: {analysis.get('automation_potential', '')}
Поставки: {analysis.get('easy_supplies', '')}"""

                try:
                    lots_resp = await cls.call_llm_json(db, system_prompt, user_prompt, cls.AGENT_GENERATOR, run_id)
                    lots_list = lots_resp.get("lots", [])
                    for lot_data in lots_list:
                        db.add(GeneratedLot(
                            run_id=run_id, game_name=g_name, subcategory_name=sub_name,
                            title=lot_data.get("title", ""),
                            description=lot_data.get("description", ""),
                            price=float(lot_data.get("price", 10.0)),
                            amount=int(lot_data.get("amount", 1)),
                            fields_json=lot_data.get("fields_json", {}),
                            ai_reasoning=lot_data.get("ai_reasoning", "")
                        ))
                        total_generated += 1
                    await db.commit()
                    await cls.log_agent(db, run_id, cls.AGENT_GENERATOR,
                                        f"{g_name}: сгенерировано {len(lots_list)} лотов.")
                except asyncio.CancelledError:
                    raise
                except Exception as ex:
                    await cls.log_agent(db, run_id, cls.AGENT_GENERATOR,
                                        f"Ошибка генерации для {g_name}: {ex}", "error")

            await cls.log_agent(db, run_id, cls.AGENT_GENERATOR,
                                f"Генерация завершена. Итого: {total_generated} лотов.")
            await cls.update_agent_state(db, run_id, cls.AGENT_GENERATOR, "completed", "Генерация завершена")

            # ── ЭТАП 4: Publisher ─────────────────────────────────────────────
            await cls.update_agent_state(db, run_id, cls.AGENT_PUBLISHER, "running", "Финализация результатов")
            await cls.log_agent(db, run_id, cls.AGENT_PUBLISHER,
                                f"Publisher: валидация и финализация {total_generated} лотов...")

            # Проверяем что все лоты записаны
            stmt_lots = select(GeneratedLot).where(GeneratedLot.run_id == run_id)
            lots_res = await db.execute(stmt_lots)
            final_lots = lots_res.scalars().all()

            await cls.log_agent(db, run_id, cls.AGENT_PUBLISHER,
                                f"Проверка завершена. {len(final_lots)} лотов готовы к экспорту в шаблоны.")
            await cls.update_agent_state(db, run_id, cls.AGENT_PUBLISHER, "completed",
                                         f"{len(final_lots)} лотов готово к публикации")

            # ── Завершение ────────────────────────────────────────────────────
            run.status = "completed"
            run.completed_at = datetime.utcnow()
            db.add(run)
            await db.commit()
            await cls.log_agent(db, run_id, "System",
                                f"Анализ успешно завершён! Создано {total_generated} лотов.")

        except asyncio.CancelledError:
            # Корректная отмена через cancel()
            logger.info(f"Run {run_id}: задача отменена пользователем.")
            from app.database import async_session_maker
            async with async_session_maker() as cancel_db:
                stmt = select(AgentRun).where(AgentRun.id == run_id)
                run_res = await cancel_db.execute(stmt)
                run_obj = run_res.scalar_one_or_none()
                if run_obj:
                    run_obj.status = "failed"
                    run_obj.completed_at = datetime.utcnow()
                    cancel_db.add(run_obj)
                    await cancel_db.commit()
                for ag in cls.ALL_AGENTS:
                    await cls.update_agent_state(cancel_db, run_id, ag, "failed", "Отменено пользователем")
                await cls.log_agent(cancel_db, run_id, "System",
                                    "Анализ отменён пользователем.", "warning")
            ACTIVE_TASKS.pop(run_id, None)

        except Exception as err:
            logger.error(f"Критическая ошибка оркестратора run={run_id}: {err}", exc_info=True)
            from app.database import async_session_maker
            async with async_session_maker() as err_db:
                stmt = select(AgentRun).where(AgentRun.id == run_id)
                run_res = await err_db.execute(stmt)
                run_obj = run_res.scalar_one_or_none()
                if run_obj:
                    run_obj.status = "failed"
                    run_obj.completed_at = datetime.utcnow()
                    err_db.add(run_obj)
                    await err_db.commit()
                for ag in cls.ALL_AGENTS:
                    await cls.update_agent_state(err_db, run_id, ag, "failed", "Критическая ошибка")
                await cls.log_agent(err_db, run_id, "System", f"Критический сбой: {str(err)}", "error")
            ACTIVE_TASKS.pop(run_id, None)
        else:
            ACTIVE_TASKS.pop(run_id, None)
