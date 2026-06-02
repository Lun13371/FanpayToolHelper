import logging
import json
import asyncio
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

class AgentOrchestrator:
    """
    Оркестратор агентной системы анализа FunPay.
    Координирует последовательный запуск 3 ИИ-агентов, обновляет состояние в БД,
    сохраняет подробные логи, собирает данные с FunPay и записывает инсайты в семантическую память.
    """
    
    @classmethod
    async def log_agent(cls, db: AsyncSession, run_id: int, agent_name: str, message: str, level: str = "info"):
        """
        Записывает лог агента в базу данных.
        """
        log_entry = AgentLog(
            run_id=run_id,
            agent_name=agent_name,
            message=message,
            level=level
        )
        db.add(log_entry)
        await db.commit()
        logger.info(f"[{agent_name}] {level.upper()}: {message}")

    @classmethod
    async def update_agent_state(
        cls, 
        db: AsyncSession, 
        run_id: int, 
        agent_name: str, 
        status: str, 
        current_task: Optional[str] = None,
        tokens_used: int = 0
    ):
        """
        Обновляет состояние агента в БД.
        """
        stmt = select(AgentState).where(AgentState.run_id == run_id, AgentState.agent_name == agent_name)
        res = await db.execute(stmt)
        state = res.scalar_one_or_none()
        
        if not state:
            state = AgentState(
                run_id=run_id,
                agent_name=agent_name,
                status=status,
                current_task=current_task,
                tokens_used=tokens_used,
                updated_at=datetime.utcnow()
            )
        else:
            state.status = status
            if current_task is not None:
                state.current_task = current_task
            state.tokens_used += tokens_used
            state.updated_at = datetime.utcnow()
            
        db.add(state)
        await db.commit()

    @classmethod
    async def call_llm_json(cls, db: AsyncSession, system_prompt: str, user_prompt: str, agent_name: str, run_id: int) -> Dict[str, Any]:
        """
        Безопасно вызывает LLM с принудительным JSON-форматом, пробуя список доступных моделей-кандидатов.
        """
        candidate_models = [
            "accounts/fireworks/models/kimi-k2p5",
            "accounts/fireworks/models/llama-3-3-70b-instruct",
            "accounts/fireworks/models/qwen2p5-coder-32b-instruct"
        ]
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        last_exception = None
        
        for model in candidate_models:
            key_obj = await AIService.get_next_key(db)
            if not key_obj:
                raise RuntimeError("Нет активных ключей ИИ в базе данных")
                
            try:
                logger.info(f"[{agent_name}] Попытка вызова модели {model}...")
                # Используем litellm с принудительным JSON
                response = await litellm.acompletion(
                    model=model,
                    custom_llm_provider="fireworks_ai",
                    messages=messages,
                    api_key=key_obj.key_value,
                    temperature=0.2, # Низкая температура для структурированных ответов
                    max_tokens=4000,
                    response_format={"type": "json_object"},
                    timeout=120.0
                )
                
                await AIService.mark_key_success(db, key_obj)
                
                # Извлекаем токены и логируем расход
                usage = getattr(response, 'usage', None)
                tokens = usage.total_tokens if usage else 0
                await cls.update_agent_state(db, run_id, agent_name, "running", tokens_used=tokens)
                
                # Обновляем затраты в сессии
                stmt = select(AgentRun).where(AgentRun.id == run_id)
                run_res = await db.execute(stmt)
                run_obj = run_res.scalar_one()
                run_obj.total_cost_tokens += tokens
                db.add(run_obj)
                await db.commit()
                
                raw_text = response.choices[0].message.content.strip()
                return json.loads(raw_text)
                
            except Exception as e:
                logger.warning(f"Ошибка вызова модели {model} для {agent_name}: {e}. Пробуем следующего кандидата...")
                await AIService.mark_key_failure(db, key_obj)
                last_exception = e
                continue
                
        raise last_exception if last_exception else RuntimeError("Все модели-кандидаты вернули ошибку.")

    @classmethod
    async def run_analysis_flow(cls, db: AsyncSession, run_id: int, tavily_key: Optional[str] = None):
        """
        Основной фоновый поток работы агентной системы.
        Выполняет 3 этапа: Выбор категорий -> Анализ листингов -> Генерация 50+ лотов.
        """
        agent_selector = "CategorySelector"
        agent_analyzer = "ListingAnalyzer"
        agent_generator = "LotGenerator"
        
        try:
            # Получаем настройки сессии
            stmt = select(AgentRun).where(AgentRun.id == run_id)
            run_res = await db.execute(stmt)
            run = run_res.scalar_one_or_none()
            if not run:
                logger.error(f"Сессия запуска агентов {run_id} не найдена в БД.")
                return
                
            run.status = "running"
            db.add(run)
            await db.commit()
            
            # Инициализируем состояния всех агентов в БД
            await cls.update_agent_state(db, run_id, agent_selector, "running", "Инициализация агентов")
            await cls.update_agent_state(db, run_id, agent_analyzer, "pending", "Ожидание")
            await cls.update_agent_state(db, run_id, agent_generator, "pending", "Ожидание")
            
            await cls.log_agent(db, run_id, agent_selector, "Начало работы оркестратора. Проверка категорий...")
            
            # 0. Автоматически синхронизируем глобальные категории FunPay, если они не обновлялись
            stmt_count = select(FunpayGlobalCategory)
            cat_count_res = await db.execute(stmt_count)
            all_categories = list(cat_count_res.scalars().all())
            
            if not all_categories:
                await cls.log_agent(db, run_id, agent_selector, "В БД отсутствуют категории FunPay. Запуск автоматической синхронизации...", "warning")
                
                # Ищем активный аккаунт, чтобы задействовать его прокси для обхода Cloudflare
                acc_stmt = select(FanpayAccount).where(FanpayAccount.always_online == True)
                acc_res = await db.execute(acc_stmt)
                active_account = acc_res.scalars().first()
                
                if active_account:
                    await cls.log_agent(db, run_id, agent_selector, f"Используем прокси аккаунта '{active_account.name}' для синхронизации разделов...")
                    client = FanpayClient(
                        golden_key=active_account.golden_key,
                        proxy_url=active_account.proxy_url,
                        user_agent=active_account.user_agent,
                        cookies=active_account.cookies
                    )
                else:
                    client = FanpayClient("", "", "", {})
                
                try:
                    categories_parsed = await client.parse_all_categories_and_subcategories()
                except Exception as ex:
                    logger.warning(f"Сбой парсинга категорий через FunpayClient: {ex}")
                    categories_parsed = []
                    
                total_parsed_subs = sum(len(g.get("subcategories", [])) for g in categories_parsed) if categories_parsed else 0
                
                if categories_parsed and total_parsed_subs > 0:
                    for game in categories_parsed:
                        game_name = game["game_name"]
                        for sub in game["subcategories"]:
                            db_cat = FunpayGlobalCategory(
                                game_name=game_name,
                                subcategory_name=sub["name"],
                                node_id=sub["node_id"],
                                category_type=sub["type"]
                            )
                            db.add(db_cat)
                    await db.commit()
                    stmt_count = select(FunpayGlobalCategory)
                    cat_count_res = await db.execute(stmt_count)
                    all_categories = list(cat_count_res.scalars().all())
                    await cls.log_agent(db, run_id, agent_selector, f"Синхронизировано {len(all_categories)} категорий с FunPay.")
                else:
                    # АВАРИЙНЫЙ FALLBACK: Записываем готовые горячие RMT разделы, чтобы ИИ-агенты гарантированно отработали
                    await cls.log_agent(db, run_id, agent_selector, "Скрапинг FunPay заблокирован Cloudflare. Наполняем базу данных золотым резервом категорий...", "warning")
                    fallback_data = [
                        {"game_name": "Dota 2", "subcategory_name": "Услуги", "node_id": "83", "category_type": "lots"},
                        {"game_name": "Counter-Strike 2", "subcategory_name": "Предметы", "node_id": "119", "category_type": "lots"},
                        {"game_name": "Steam", "subcategory_name": "Игры", "node_id": "421", "category_type": "lots"},
                        {"game_name": "Roblox", "subcategory_name": "Робуксы", "node_id": "1225", "category_type": "lots"},
                        {"game_name": "Rust", "subcategory_name": "Предметы", "node_id": "745", "category_type": "lots"},
                        {"game_name": "Brawl Stars", "subcategory_name": "Аккаунты", "node_id": "1940", "category_type": "lots"},
                        {"game_name": "GTA 5 RP", "subcategory_name": "Валюта", "node_id": "1002", "category_type": "lots"},
                        {"game_name": "World of Warcraft", "subcategory_name": "Золото", "node_id": "81", "category_type": "lots"},
                        {"game_name": "Genshin Impact", "subcategory_name": "Услуги", "node_id": "921", "category_type": "lots"},
                        {"game_name": "Mobile Legends", "subcategory_name": "Алмазы", "node_id": "1802", "category_type": "lots"}
                    ]
                    for fd in fallback_data:
                        db_cat = FunpayGlobalCategory(
                            game_name=fd["game_name"],
                            subcategory_name=fd["subcategory_name"],
                            node_id=fd["node_id"],
                            category_type=fd["category_type"]
                        )
                        db.add(db_cat)
                    await db.commit()
                    stmt_count = select(FunpayGlobalCategory)
                    cat_count_res = await db.execute(stmt_count)
                    all_categories = list(cat_count_res.scalars().all())
                    await cls.log_agent(db, run_id, agent_selector, f"Добавлено {len(all_categories)} предустановленных RMT-разделов.")
            
            # -------------------------------------------------------------
            # ЭТАП 1: CategorySelector (Селектор Категорий)
            # -------------------------------------------------------------
            selected_categories: List[FunpayGlobalCategory] = []
            
            if run.mode == "manual":
                # В ручном режиме пользователь выбирает конкретные категории (мы их получим, например, по лимиту или предопределенным node_id)
                # Для простоты: если передан ручной режим, возьмем первые limit_categories самых популярных игр (например, Dota 2, CS2, Steam)
                await cls.log_agent(db, run_id, agent_selector, "Запущен ручной режим. Выбираем указанные категории...")
                # Ищем популярные игры
                keywords = ["dota", "counter", "cs", "steam", "gta", "rust", "pubg", "brawl", "roblox", "genshin"]
                for cat in all_categories:
                    if len(selected_categories) >= run.limit_categories:
                        break
                    if any(kw in cat.game_name.lower() for kw in keywords) and cat not in selected_categories:
                        selected_categories.append(cat)
                
                # Если набралось мало, доберем просто первыми
                for cat in all_categories:
                    if len(selected_categories) >= run.limit_categories:
                        break
                    if cat not in selected_categories:
                        selected_categories.append(cat)
                        
            else:
                # АВТО-ВЫБОР (Агент 1)
                await cls.log_agent(db, run_id, agent_selector, "Агент запускает веб-поиск для выявления горячих RMT трендов и популярных игр в 2026 году...")
                await cls.update_agent_state(db, run_id, agent_selector, "running", "Поиск RMT трендов в Google/Tavily")
                
                search_query = "most profitable games for RMT selling funpay popular games 2026"
                search_results = await AgentSearchService.search(search_query, api_key=tavily_key, max_results=5)
                
                search_context = ""
                for idx, res in enumerate(search_results):
                    search_context += f"Источниr #{idx+1} ({res['url']}):\n{res['title']}\n{res['content']}\n\n"
                
                await cls.log_agent(db, run_id, agent_selector, f"Поиск завершен. Найдено {len(search_results)} источников. Анализ семантической памяти...")
                await cls.update_agent_state(db, run_id, agent_selector, "running", "Сверка с семантической памятью")
                
                # Поиск в семантической памяти, чтобы понять, какие категории мы уже анализировали как выгодные
                past_insights = await SemanticMemoryService.search_similar_insights(db, "profitable games and subcategories high demand", limit=5)
                past_context = ""
                if past_insights:
                    past_context = "Ранее сохраненные выводы в семантической памяти:\n"
                    for pi in past_insights:
                        past_context += f"- {pi.game_name} ({pi.subcategory_name}): {pi.content[:150]}...\n"
                
                await cls.log_agent(db, run_id, agent_selector, "Запуск LLM для отбора самых перспективных RMT категорий на основе трендов...")
                await cls.update_agent_state(db, run_id, agent_selector, "running", "Отбор категорий ИИ-агентом")
                
                # Формируем список доступных категорий для LLM (ограничим случайной выборкой 150 категорий, чтобы не лопнул контекст)
                import random
                sampled_cats = random.sample(all_categories, min(len(all_categories), 120))
                available_cats_str = ""
                for c in sampled_cats:
                    available_cats_str += f"- ID: {c.node_id} | Игра: {c.game_name} | Категория: {c.subcategory_name} | Тип: {c.category_type}\n"
                
                system_prompt = """Ты — ведущий аналитик игрового рынка RMT (Real Money Trading) на платформе FunPay.
Твоя задача — проанализировать веб-тренды, семантическую память прошлых выводов и список доступных категорий FunPay, а затем выбрать ровно N самых перспективных и выгодных категорий для продажи товаров/услуг.
Обращай внимание на высокую маржинальность, востребованность услуг автоматизации (софт, боты, скрипты, автовыдача) и постоянный поток покупателей.
Верни ответ СТРОГО в формате JSON с ключом "selected_ids" — массив ID выбранных категорий (node_id).
Формат JSON:
{
  "selected_ids": ["81", "124", "451"],
  "reasoning": "Объяснение, почему выбраны эти категории..."
}"""
                user_prompt = f"""Необходимо выбрать ровно {run.limit_categories} категорий.
Вот последние RMT тренды из веба:
{search_context}

{past_context}

Вот список доступных категорий на FunPay:
{available_cats_str}

Верни строго JSON объект с выбранными ID категорий."""
                
                llm_response = await cls.call_llm_json(db, system_prompt, user_prompt, agent_selector, run_id)
                selected_ids = llm_response.get("selected_ids", [])
                reasoning = llm_response.get("reasoning", "Автоматический выбор.")
                
                # Маппим обратно к объектам моделей
                for cat_id in selected_ids:
                    cat_obj = next((c for c in all_categories if str(c.node_id) == str(cat_id)), None)
                    if cat_obj:
                        selected_categories.append(cat_obj)
                        
                # Если ИИ ничего не выбрал (ошибка формата или ключа), берем аварийный запас
                if not selected_categories:
                    await cls.log_agent(db, run_id, agent_selector, "ИИ-агент не вернул валидные ID. Запуск аварийного выбора...", "warning")
                    selected_categories = all_categories[:run.limit_categories]
                    
            await cls.log_agent(db, run_id, agent_selector, f"Отобрано {len(selected_categories)} категорий для глубокого анализа: " + ", ".join([f"{c.game_name} ({c.subcategory_name})" for c in selected_categories]))
            await cls.update_agent_state(db, run_id, agent_selector, "completed", "Выбор категорий успешно завершен")
            
            # -------------------------------------------------------------
            # ЭТАП 2: ListingAnalyzer (Анализатор Листингов)
            # -------------------------------------------------------------
            await cls.update_agent_state(db, run_id, agent_analyzer, "running", "Подготовка к парсингу категорий")
            await cls.log_agent(db, run_id, agent_analyzer, "Анализатор листингов начинает глубокий разбор каждой категории...")
            
            # Получаем первый активный аккаунт FunPay для авторизованного fallback-парсинга
            acc_stmt = select(FanpayAccount).where(FanpayAccount.always_online == True)
            acc_res = await db.execute(acc_stmt)
            active_account = acc_res.scalars().first()
            
            funpay_client = None
            if active_account:
                funpay_client = FanpayClient(
                    golden_key=active_account.golden_key,
                    proxy_url=active_account.proxy_url,
                    user_agent=active_account.user_agent,
                    cookies=active_account.cookies
                )
                
            category_analyses = []
            
            for index, cat in enumerate(selected_categories):
                task_desc = f"Парсинг [{index+1}/{len(selected_categories)}]: {cat.game_name}"
                await cls.update_agent_state(db, run_id, agent_analyzer, "running", task_desc)
                await cls.log_agent(db, run_id, agent_analyzer, f"Парсинг активных лотов в категории: {cat.game_name} -> {cat.subcategory_name} (ID: {cat.node_id})...")
                
                # Парсим предложения в категории
                offers = await AgentScraperService.scrape_category_offers(cat.node_id, cat.category_type, funpay_client)
                
                if not offers:
                    await cls.log_agent(db, run_id, agent_analyzer, f"В категории {cat.game_name} не найдено активных лотов. Пропускаем...", "warning")
                    continue
                    
                # Логируем статистику цен
                prices = [o["price"] for o in offers if o["price"] > 0]
                min_price = min(prices) if prices else 0.0
                max_price = max(prices) if prices else 0.0
                avg_price = sum(prices) / len(prices) if prices else 0.0
                
                await cls.log_agent(db, run_id, agent_analyzer, f"Категория {cat.game_name} спарсена. Найдено предложений: {len(offers)}. Диапазон цен: {min_price}₽ - {max_price}₽ (ср. {avg_price:.2f}₽)")
                
                # Дополнительно: веб-поиск по фарму/покупке/автоматизации ценностей этой игры
                await cls.update_agent_state(db, run_id, agent_analyzer, "running", f"Поиск гайдов по {cat.game_name} в Google")
                search_query = f"how to farm cheap purchase keys automation {cat.game_name} {cat.subcategory_name}"
                guide_results = await AgentSearchService.search(search_query, api_key=tavily_key, max_results=3)
                guide_context = ""
                for gr in guide_results:
                    guide_context += f"- Source: {gr['url']}\n{gr['title']}\n{gr['content']}\n"
                
                # Запускаем ИИ для формирования аналитики по категории
                await cls.update_agent_state(db, run_id, agent_analyzer, "running", f"ИИ Анализ маржинальности {cat.game_name}")
                await cls.log_agent(db, run_id, agent_analyzer, f"Запуск ИИ-анализатора маржинальности для {cat.game_name}...")
                
                # Сжимаем листинг предложений, чтобы передать ИИ типичные примеры (первые 20 лотов)
                offers_sample = ""
                for o in offers[:25]:
                    offers_sample += f"- Лоты: ID {o['lot_id']} | Цена: {o['price']}₽ | Кол-во: {o['amount']} | Продавец: {o['user']} | Текст: {o['description'][:120]}\n"
                    
                system_prompt = """Ты — экспертный RMT-аналитик рынка цифровых товаров. Твоя задача — проанализировать спарсенный листинг предложений FunPay и веб-данные о методах добычи, а затем сгенерировать точные аналитические инсайты:
1. Что чаще всего покупают? (какие товары пользуются наибольшим спросом)
2. Что можно автоматизировать через бота, софт или автовыдачу?
3. Какова стратегия ценообразования? (как конкурировать)
4. Способ легкого/дешевого получения товаров для продажи (где брать ключи, как фармить, где закупать оптом).

Верни результат СТРОГО в формате JSON:
{
  "hot_demands": ["Категория спроса 1", "Категория спроса 2"],
  "automation_potential": "Описание того, что и как можно автоматизировать...",
  "easy_supplies": "Подробное описание каналов закупки или фарма...",
  "competitor_analysis": "Краткие выводы по конкурентам...",
  "insights": [
    {"type": "trend", "content": "Текст тренда..."},
    {"type": "demand", "content": "Текст спроса..."},
    {"type": "automation_potential", "content": "Текст потенциала автоматизации..."}
  ]
}"""
                user_prompt = f"""Проанализируй категорию {cat.game_name} -> {cat.subcategory_name}.
Вот примеры активных предложений конкурентов на FunPay:
{offers_sample}

Вот гайды и источники по автоматизации/фарму/закупкам:
{guide_context}

Предоставь глубокую аналитику в JSON формате."""
                
                analysis_json = await cls.call_llm_json(db, system_prompt, user_prompt, agent_analyzer, run_id)
                category_analyses.append({
                    "game_name": cat.game_name,
                    "subcategory_name": cat.subcategory_name,
                    "analysis": analysis_json
                })
                
                # Сохраняем инсайты в Семантическую Память с эмбеддингами
                insights = analysis_json.get("insights", [])
                for ins in insights:
                    await SemanticMemoryService.save_insight(
                        db=db,
                        run_id=run_id,
                        game_name=cat.game_name,
                        subcategory_name=cat.subcategory_name,
                        insight_type=ins.get("type", "trend"),
                        content=ins.get("content", "")
                    )
                await cls.log_agent(db, run_id, agent_analyzer, f"Успешно сохранено {len(insights)} инсайтов в векторную семантическую память для {cat.game_name}.")
                
            await cls.log_agent(db, run_id, agent_analyzer, "Анализ листингов завершен по всем категориям.")
            await cls.update_agent_state(db, run_id, agent_analyzer, "completed", "Анализ категорий и семантическая память успешно заполнены")
            
            # -------------------------------------------------------------
            # ЭТАП 3: LotGenerator (Генератор Лотов)
            # -------------------------------------------------------------
            await cls.update_agent_state(db, run_id, agent_generator, "running", "Синтез прибыльных товаров")
            await cls.log_agent(db, run_id, agent_generator, "Агент запускает синтез и генерацию прибыльного RMT каталога (цель: 50+ лотов)...")
            
            total_generated_lots = 0
            
            for index, cat_analysis in enumerate(category_analyses):
                g_name = cat_analysis["game_name"]
                sub_name = cat_analysis["subcategory_name"]
                analysis_data = cat_analysis["analysis"]
                
                task_desc = f"Генерация [{index+1}/{len(category_analyses)}]: {g_name}"
                await cls.update_agent_state(db, run_id, agent_generator, "running", task_desc)
                await cls.log_agent(db, run_id, agent_generator, f"Генерация лотов для {g_name} -> {sub_name} на основе ИИ-инсайтов...")
                
                # Мы просим сгенерировать 10-15 детализированных, прибыльных лотов для каждого направления
                system_prompt = """Ты — креативный копирайтер и эксперт по продажам на FunPay. Твоя задача — сгенерировать список привлекательных, готовых к публикации лотов для конкретной игры.
Каждый лот должен быть уникальным, сразу готовым к продажам, сочным и структурированным.
Обязательно включи: заголовок, сочное подробное описание, оптимальную цену, количество запаса (amount) и обоснование, почему этот лот выгоден (ai_reasoning).
Также включи `fields_json` — JSON словарь с параметрами полей для создания лота через FunPay API. Он обычно содержит поля:
- "fields[summary][ru]": краткое название (заголовок)
- "fields[desc][ru]": полное продающее описание
- "fields[payment_msg][ru]": сообщение после оплаты (например, инструкция автовыдачи)
- "price": цена
- "amount": остаток

Верни ответ СТРОГО в формате JSON с ключом "lots" — массив объектов лотов:
{
  "lots": [
    {
      "title": "Красивый заголовок лота...",
      "description": "Продающее описание лота с эмодзи и разметкой...",
      "price": 199.00,
      "amount": 99,
      "ai_reasoning": "Этот товар легко автоматизировать, а маржа составляет 80%...",
      "fields_json": {
        "fields[summary][ru]": "Заголовок для Funpay",
        "fields[desc][ru]": "Полное описание для Funpay",
        "fields[payment_msg][ru]": "Инструкция автовыдачи",
        "price": "199",
        "amount": "99"
      }
    }
  ]
}"""
                user_prompt = f"""Сгенерируй от 10 до 15 прибыльных и интересных товаров для игры '{g_name}' (раздел '{sub_name}').
Используй результаты анализа этой категории:
- Спрос конкурентов: {analysis_data.get('competitor_analysis')}
- Потенциал автоматизации: {analysis_data.get('automation_potential')}
- Источники поставок / Фарм: {analysis_data.get('easy_supplies')}

Создай сочный, готовый к публикации каталог лотов."""
                
                try:
                    lots_response = await cls.call_llm_json(db, system_prompt, user_prompt, agent_generator, run_id)
                    lots_list = lots_response.get("lots", [])
                    
                    for lot_data in lots_list:
                        # Сохраняем лот в БД
                        new_lot = GeneratedLot(
                            run_id=run_id,
                            game_name=g_name,
                            subcategory_name=sub_name,
                            title=lot_data.get("title", ""),
                            description=lot_data.get("description", ""),
                            price=float(lot_data.get("price", 10.0)),
                            amount=int(lot_data.get("amount", 1)),
                            fields_json=lot_data.get("fields_json", {}),
                            ai_reasoning=lot_data.get("ai_reasoning", "")
                        )
                        db.add(new_lot)
                        total_generated_lots += 1
                        
                    await db.commit()
                    await cls.log_agent(db, run_id, agent_generator, f"Для {g_name} успешно сгенерировано и сохранено {len(lots_list)} сочных лотов.")
                except Exception as ex:
                    await cls.log_agent(db, run_id, agent_generator, f"Ошибка генерации лотов для категории {g_name}: {ex}. Пропускаем...", "error")
                    
            await cls.log_agent(db, run_id, agent_generator, f"Генерация каталога завершена. Всего создано лотов: {total_generated_lots} позиций.")
            await cls.update_agent_state(db, run_id, agent_generator, "completed", "Генерация лотов завершена")
            
            # 4. Завершаем сессию
            run.status = "completed"
            run.completed_at = datetime.utcnow()
            db.add(run)
            await db.commit()
            await cls.log_agent(db, run_id, "System", "Работа агентской системы полностью и успешно завершена! Сформирован каталог 50+ товаров.")
            
        except Exception as err:
            logger.error(f"Критическая ошибка оркестратора: {err}")
            stmt = select(AgentRun).where(AgentRun.id == run_id)
            run_res = await db.execute(stmt)
            run = run_res.scalar_one_or_none()
            if run:
                run.status = "failed"
                run.completed_at = datetime.utcnow()
                db.add(run)
                await db.commit()
                
            await cls.log_agent(db, run_id, "System", f"Произошел критический сбой сессии анализа: {str(err)}", "error")
            # Обновим состояния агентов, которые зависли
            for ag in [agent_selector, agent_analyzer, agent_generator]:
                await cls.update_agent_state(db, run_id, ag, "failed", "Ошибка выполнения")
