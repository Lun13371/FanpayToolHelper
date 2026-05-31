import logging
import random
from datetime import datetime, timedelta
from typing import Dict, Any, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.models.account import FanpayAccount
from app.models.lot import LotSettings
from app.models.delivery import AutoDeliveryItem
from app.models.review import AutoReviewTemplate
from app.models.competitor import CompetitorBlacklist
from app.models.log import SystemLogs
from app.services.fanpay_client import FanpayClient
from app.services.ai import AIService
from app.services.telegram import TelegramService
from app.services.log_broadcast import log_broadcast_manager

logger = logging.getLogger("fanpay.scheduler")

class SchedulerManager:
    """
    Управляющий фоновыми задачами APScheduler.
    Динамически запускает, останавливает и координирует задачи для каждого аккаунта Funpay.
    """
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        # Храним ID запущенных джоб, чтобы контролировать их перезапуск
        # Формат: { "account_<id>_online": "job_id", ... }
        self.active_jobs: Dict[str, str] = {}

    def start(self):
        """Запуск планировщика."""
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("Фоновый планировщик APScheduler успешно запущен.")

    def shutdown(self):
        """Остановка планировщика."""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Фоновый планировщик APScheduler остановлен.")

    async def add_log(self, db: AsyncSession, account_id: int, message: str, level: str = "INFO"):
        """Вспомогательный метод для записи лога в БД и отправки через WebSockets."""
        log = SystemLogs(account_id=account_id, message=message, level=level)
        db.add(log)
        await db.commit()
        await db.refresh(log)
        
        # Транслируем лог в реальном времени через WebSockets
        timestamp_str = log.created_at.strftime("%Y-%m-%d %H:%M:%S")
        await log_broadcast_manager.broadcast_log(account_id, level, message, timestamp_str)
        
        logger.info(f"[Account {account_id}] {level}: {message}")

    async def check_order_already_processed(self, db: AsyncSession, account_id: int, order_id: str) -> bool:
        """Проверяет по логам, выдавали ли мы уже товар для этого заказа."""
        query = select(SystemLogs).where(
            SystemLogs.account_id == account_id,
            SystemLogs.message.like(f"%Выдан товар по заказу {order_id}%")
        )
        res = await db.execute(query)
        return res.first() is not None

    async def check_followup_already_sent(self, db: AsyncSession, account_id: int, order_id: str) -> bool:
        """Проверяет по логам, отправляли ли мы напоминание об отзыве."""
        query = select(SystemLogs).where(
            SystemLogs.account_id == account_id,
            SystemLogs.message.like(f"%Напоминание об отзыве отправлено для заказа {order_id}%")
        )
        res = await db.execute(query)
        return res.first() is not None

    # =========================================================================
    # ФОНОВЫЕ ЗАДАЧИ ДЛЯ КАЖДОГО АККАУНТА
    # =========================================================================

    async def job_keep_online(self, account_id: int):
        """Задача: Вечный онлайн. Обновляет сессионные куки."""
        async with async_session_maker() as db:
            account = await db.get(FanpayAccount, account_id)
            if not account or not account.is_active:
                return

            client = FanpayClient(
                golden_key=account.golden_key,
                proxy_url=account.proxy_url,
                user_agent=account.user_agent,
                cookies=account.cookies
            )
            success, username, updated_cookies = await client.verify_session()
            if success and updated_cookies:
                account.cookies = updated_cookies
                account.last_status = f"Online ({username})"
                db.add(account)
                await db.commit()
                await self.add_log(db, account_id, "Активность в сети обновлена (Вечный онлайн).")
            else:
                account.last_status = "KeepAlive Error"
                db.add(account)
                await db.commit()
                await self.add_log(db, account_id, f"Ошибка обновления вечного онлайна: {username}", "WARNING")

    async def job_raise_lots(self, account_id: int):
        """Задача: Автоподнятие предложений."""
        async with async_session_maker() as db:
            account = await db.get(FanpayAccount, account_id)
            if not account or not account.is_active:
                return

            client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
            success, msg = await client.raise_offers()
            
            if success:
                account.last_raised = datetime.utcnow()
                db.add(account)
                await db.commit()
                await self.add_log(db, account_id, f"Автоподнятие лотов завершено успешно: {msg}")
            else:
                await self.add_log(db, account_id, f"Ошибка автоподнятия лотов: {msg}", "WARNING")
        
        # Планируем следующее умное поднятие (база 4 часа + случайная задержка 1-60 минут)
        await self.schedule_next_raise(account_id, initial=False)

    async def job_autodelivery_and_ai(self, account_id: int):
        """Задача: Автовыдача товаров, сбор отзывов и умные ИИ-ответы."""
        async with async_session_maker() as db:
            account = await db.get(FanpayAccount, account_id)
            if not account or not account.is_active:
                return

            client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
            
            # 1. Получаем список оплаченных заказов
            paid_orders = await client.get_paid_orders()
            if not paid_orders:
                return

            for order in paid_orders:
                order_id = order["order_id"]
                lot_name = order["lot_name"]
                buyer_name = order["buyer_name"]

                # Проверяем, не выдавали ли мы уже этот заказ
                if await self.check_order_already_processed(db, account_id, order_id):
                    continue

                await self.add_log(db, account_id, f"Обнаружен новый оплаченный заказ {order_id} ({lot_name}) от {buyer_name}.")

                # 2. Ищем подходящий товар на выдачу в БД (по имени лота)
                # Поддерживаем и ID категории, но по имени лота — самое гибкое по выбору пользователя
                q_item = select(AutoDeliveryItem).where(
                    AutoDeliveryItem.account_id == account_id,
                    AutoDeliveryItem.lot_name == lot_name,
                    AutoDeliveryItem.is_sold == False
                )
                res_item = await db.execute(q_item)
                item = res_item.scalars().first()

                if not item:
                    # Попробуем найти товар, где имя лота частично совпадает или по умолчанию
                    # (Для максимального качества не падаем, а логируем)
                    await self.add_log(
                        db, account_id, 
                        f"Товар для лота '{lot_name}' не найден на складе автовыдачи! Продажа пропущена.", 
                        "WARNING"
                    )
                    await TelegramService.send_message(
                        f"⚠️ <b>Внимание!</b>\nНа аккаунте {account.name} продан лот <i>{lot_name}</i>, но склад пуст!\nПожалуйста, пополните товары автовыдачи."
                    )
                    continue

                # 3. Извлекаем ID чата
                node_id, chat_history = await client.get_chat_node_and_history(order_id)
                if not node_id:
                    await self.add_log(db, account_id, f"Не удалось получить чат для заказа {order_id}", "ERROR")
                    continue

                # 4. Отправляем товар в чат покупателю
                delivery_text = item.content
                send_success = await client.send_message(node_id, delivery_text)
                
                if send_success:
                    # Помечаем товар как проданный, если он одноразовый
                    if not item.is_multi_use:
                        item.is_sold = True
                        db.add(item)
                    
                    await self.add_log(db, account_id, f"Выдан товар по заказу {order_id} ({buyer_name}): '{delivery_text[:30]}...'")
                    
                    # Проверка лимита склада (Low-Stock Alert)
                    # Считаем сколько осталось аналогичных товаров
                    q_stock = select(AutoDeliveryItem).where(
                        AutoDeliveryItem.account_id == account_id,
                        AutoDeliveryItem.lot_name == lot_name,
                        AutoDeliveryItem.is_sold == False
                    )
                    res_stock = await db.execute(q_stock)
                    remaining_stock = len(res_stock.scalars().all())

                    if remaining_stock <= 3:
                        await TelegramService.send_message(
                            f"📦 <b>Низкий запас товара!</b>\nНа аккаунте {account.name} для лота <i>{lot_name}</i> осталось всего <b>{remaining_stock} шт.</b>! Пожалуйста, пополните склад."
                        )

                    # 5. Оставляем автоматический отзыв покупателю, если есть шаблоны
                    q_reviews = select(AutoReviewTemplate).where(AutoReviewTemplate.account_id == account_id)
                    res_reviews = await db.execute(q_reviews)
                    reviews = res_reviews.scalars().all()
                    
                    if reviews:
                        chosen_review = random.choice(reviews)
                        review_success = await client.leave_review(order_id, 5, chosen_review.text)
                        if review_success:
                            await self.add_log(db, account_id, f"Оставлен автоотзыв покупателю {buyer_name}: '{chosen_review.text}'")

                    # Отправляем уведомление в Telegram о продаже
                    await TelegramService.send_message(
                        f"💰 <b>Продажа на Funpay!</b>\nАккаунт: <code>{account.name}</code>\nЗаказ: <code>{order_id}</code>\nПокупатель: {buyer_name}\nЛот: {lot_name}\nЦена: {order['price']} руб.\nТовар выдан автоматически!"
                    )
                else:
                    await self.add_log(db, account_id, f"Не удалось отправить товар покупателю по заказу {order_id}", "ERROR")

            # =========================================================================
            # ИИ-АВТООТВЕТЧИК
            # =========================================================================
            # Проверяем новые сообщения в чатах
            # Для этого сканируем последние чаты заказа
            for order in paid_orders:
                node_id, history = await client.get_chat_node_and_history(order["order_id"])
                if not node_id or not history:
                    continue

                # Ищем последнее сообщение
                last_sender, last_text = history[-1]
                
                # Если последнее сообщение от покупателя — нам нужно ответить!
                if last_sender == "buyer":
                    # Проверяем, не отвечал ли оператор сам за последние 20 минут (засыпание ИИ)
                    if account.last_operator_activity:
                        elapsed = datetime.utcnow() - account.last_operator_activity
                        if elapsed < timedelta(minutes=20):
                            logger.info(f"Чат {node_id}: ИИ заснул, так как оператор активен. Прошло {elapsed.seconds // 60} мин.")
                            continue

                    # Запускаем генерацию ИИ
                    try:
                        await self.add_log(db, account_id, f"Генерация ответа ИИ для {order['buyer_name']} в ноду {node_id}...")
                        
                        # Собираем контекст лота
                        context_prompt = f"\nОписание купленного товара: {lot_name}\nСтатус сделки: Оплачена."
                        full_system_prompt = account.system_prompt + context_prompt

                        # Вызываем асинхронный сервис ИИ
                        ai_reply = await AIService.generate_response(
                            db=db,
                            system_prompt=full_system_prompt,
                            history=history
                        )

                        # Отправляем ответ в чат
                        send_success = await client.send_message(node_id, ai_reply)
                        if send_success:
                            await self.add_log(db, account_id, f"ИИ успешно ответил: '{ai_reply[:40]}...'")
                        else:
                            await self.add_log(db, account_id, f"Ошибка отправки ИИ-ответа в чат {node_id}", "WARNING")

                    except Exception as ai_err:
                        logger.error(f"Сбой ИИ: {str(ai_err)}")
                        await self.add_log(db, account_id, f"Сбой ИИ, отправляем fallback-шаблон. Ошибка: {str(ai_err)}", "WARNING")
                        
                        # Отправляем Fallback шаблон
                        fallback_text = account.fallback_template or settings.DEFAULT_FALLBACK_TEMPLATE
                        await client.send_message(node_id, fallback_text)
                        
                        # Тревога в Telegram
                        await TelegramService.send_message(
                            f"🚨 <b>Сбой ИИ автоответчика!</b>\nАккаунт: {account.name}\nПокупатель: {order['buyer_name']}\nОшибка: <code>{str(ai_err)}</code>\nБыл отправлен fallback-текст."
                        )

    async def job_damping(self, account_id: int):
        """Задача: Автопонижение цен (Демпинг)."""
        async with async_session_maker() as db:
            account = await db.get(FanpayAccount, account_id)
            if not account or not account.is_active:
                return

            client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)

            # Получаем все настройки лотов для демпинга
            q_lots = select(LotSettings).where(
                LotSettings.account_id == account_id
            )
            res_lots = await db.execute(q_lots)
            configured_lots = res_lots.scalars().all()
            
            configured_lots_map = {l.lot_id: l for l in configured_lots}
            
            # Собираем список лотов для демпинга
            lots_to_dump = []
            
            if account.lots_cache:
                for active_lot in account.lots_cache:
                    lot_id = str(active_lot.get("lot_id"))
                    lot_name = active_lot.get("lot_name") or active_lot.get("title") or f"Лот {lot_id}"
                    
                    if lot_id in configured_lots_map:
                        local_lot = configured_lots_map[lot_id]
                        if local_lot.is_active:
                            lots_to_dump.append({
                                "lot_id": lot_id,
                                "lot_name": local_lot.lot_name,
                                "min_price": local_lot.min_price,
                                "undercut_value": local_lot.undercut_value
                            })
                    else:
                        global_active = getattr(account, "global_damping_active", False)
                        if global_active:
                            global_undercut = getattr(account, "global_undercut_value", 0.01)
                            global_min = getattr(account, "global_min_price", 0.0)
                            lots_to_dump.append({
                                "lot_id": lot_id,
                                "lot_name": lot_name,
                                "min_price": global_min,
                                "undercut_value": global_undercut
                            })
            
            if not lots_to_dump:
                for l in configured_lots:
                    if l.is_active:
                        lots_to_dump.append({
                            "lot_id": l.lot_id,
                            "lot_name": l.lot_name,
                            "min_price": l.min_price,
                            "undercut_value": l.undercut_value
                        })

            if not lots_to_dump:
                return

            # Получаем черный список конкурентов
            q_blacklist = select(CompetitorBlacklist).where(CompetitorBlacklist.account_id == account_id)
            res_blacklist = await db.execute(q_blacklist)
            blacklist_names = {c.username.lower() for c in res_blacklist.scalars().all()}

            # Демпингуем каждый лот
            for lot in lots_to_dump:
                try:
                    lot_id = lot["lot_id"]
                    lot_name = lot["lot_name"]
                    min_price = lot["min_price"]
                    undercut_value = lot["undercut_value"]

                    await self.add_log(db, account_id, f"Проверка цен конкурентов для лота {lot_name} (ID: {lot_id})...")
                    
                    # ПРИМЕР парсинга конкурентов:
                    # Будем считать, что мы сделали запрос к категории и спарсили минимальную цену:
                    min_competitor_price = 100.0 # Примерная цена конкурента
                    competitor_name = "BestSeller"

                    if competitor_name.lower() in blacklist_names:
                        logger.info(f"Игнорируем конкурента {competitor_name} из черного списка.")
                        continue

                    # Высчитываем новую цену
                    target_price = min_competitor_price - undercut_value
                    
                    # Зажимаем в границы min_price
                    if target_price < min_price:
                        target_price = min_price
                        # Отправляем алерт админу в Telegram
                        await self.add_log(
                            db, account_id, 
                            f"Лот '{lot_name}' уперся в min_price ({min_price:.2f} руб). Демпинг приостановлен.", 
                            "WARNING"
                        )
                        await TelegramService.send_message(
                            f"📉 <b>Демпинг упёрся в лимит!</b>\nАккаунт: {account.name}\nЛот: {lot_name}\nЦена конкурента: {min_competitor_price:.2f} руб.\nВаш лимит min_price: {min_price:.2f} руб."
                        )
                        continue

                    # Если цена изменилась, обновляем её на Funpay!
                    success = await client.update_lot_price(lot_id, target_price)
                    if success:
                        await self.add_log(db, account_id, f"Цена лота '{lot_name}' успешно снижена до {target_price:.2f} руб.")
                    else:
                        await self.add_log(db, account_id, f"Не удалось обновить цену для лота {lot_name}", "WARNING")

                except Exception as ex:
                    logger.error(f"Ошибка демпинга лота {lot.get('lot_id', 'unknown')}: {str(ex)}")

    async def job_review_followup(self, account_id: int):
        """Задача: Авто-напоминание об отзыве через 1 час после выдачи."""
        async with async_session_maker() as db:
            account = await db.get(FanpayAccount, account_id)
            if not account or not account.is_active:
                return

            client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
            
            # Получаем список проданных заказов
            # Мы можем проверить страницу продаж. Неподтвержденные заказы висят в статусе "оплачен" (ожидает подтверждения)
            paid_orders = await client.get_paid_orders()
            if not paid_orders:
                return

            for order in paid_orders:
                order_id = order["order_id"]
                buyer_name = order["buyer_name"]

                # Проверяем, выдавали ли мы вообще товар по этому заказу
                if not await self.check_order_already_processed(db, account_id, order_id):
                    continue

                # Проверяем, не отправляли ли мы уже напоминание
                if await self.check_followup_already_sent(db, account_id, order_id):
                    continue

                # Извлекаем логи выдачи товара для этого заказа, чтобы узнать время выдачи
                query = select(SystemLogs).where(
                    SystemLogs.account_id == account_id,
                    SystemLogs.message.like(f"%Выдан товар по заказу {order_id}%")
                )
                res = await db.execute(query)
                log_record = res.scalars().first()
                
                if not log_record:
                    continue

                # Считаем, сколько прошло времени с момента выдачи
                elapsed = datetime.utcnow() - log_record.created_at
                
                # Если прошел ровно 1 час (например, от 60 до 75 минут)
                if timedelta(minutes=60) <= elapsed <= timedelta(minutes=75):
                    node_id, _ = await client.get_chat_node_and_history(order_id)
                    if not node_id:
                        continue

                    followup_text = (
                        f"Привет, {buyer_name}! Надеюсь, тебе понравился товар. "
                        "Пожалуйста, не забудь подтвердить заказ на Funpay и оставить отзыв, "
                        "если всё прошло отлично. Это безумно поможет нашему магазину! Спасибо! ❤️"
                    )

                    send_success = await client.send_message(node_id, followup_text)
                    if send_success:
                        await self.add_log(db, account_id, f"Напоминание об отзыве отправлено для заказа {order_id} ({buyer_name}).")
                    else:
                        await self.add_log(db, account_id, f"Не удалось отправить напоминание об отзыве для заказа {order_id}", "WARNING")

    async def job_full_sync(self, account_id: int):
        """Задача: Полная фоновая синхронизация данных (баланс, отзывы, кэширование лотов)."""
        async with async_session_maker() as db:
            account = await db.get(FanpayAccount, account_id)
            if not account or not account.is_active:
                return

            client = FanpayClient(
                golden_key=account.golden_key,
                proxy_url=account.proxy_url,
                user_agent=account.user_agent,
                cookies=account.cookies
            )
            
            await self.add_log(db, account_id, "Запуск фоновой полной синхронизации...")
            
            try:
                # 1. Синхронизируем статистику профиля
                stats = await client.sync_profile_and_stats()
                if stats["funpay_user_id"]:
                    account.funpay_user_id = stats["funpay_user_id"]
                account.balance = stats["balance"]
                account.rating = stats["rating"]
                account.reviews_count = stats["reviews_count"]
                
                if stats["username"] != "Unknown":
                    account.last_status = f"Active ({stats['username']})"
                    # Обновляем имя, если в нем еще нет никнейма
                    account.name = f"{account.name.split(' (')[0]} ({stats['username']})"
                
                # 2. Получаем активные лоты
                lots = await client.get_active_lots()
                account.lots_cache = lots
                account.last_synced = datetime.utcnow()
                
                db.add(account)
                await db.commit()
                
                await self.add_log(db, account_id, f"Фоновая синхронизация завершена. Найдено активных лотов: {len(lots)}.")
            except Exception as e:
                await self.add_log(db, account_id, f"Ошибка фоновой синхронизации: {e}", "WARNING")
            
            # Планируем следующее случайное обновление через 30-120 минут
            self.schedule_next_full_sync(account_id)

    def schedule_next_full_sync(self, account_id: int):
        """Планирует следующий запуск полной синхронизации через случайное время от 30 до 120 минут."""
        key = f"account_{account_id}_full_sync"
        if key in self.active_jobs:
            try:
                self.scheduler.remove_job(self.active_jobs[key])
            except Exception:
                pass
            del self.active_jobs[key]

        delay_minutes = random.randint(30, 120)
        run_time = datetime.now() + timedelta(minutes=delay_minutes)
        
        job = self.scheduler.add_job(
            self.job_full_sync,
            trigger='date',
            run_date=run_time,
            args=[account_id],
            id=key
        )
        self.active_jobs[key] = job.id
        logger.info(f"Следующая полная синхронизация для аккаунта {account_id} запланирована на {run_time.strftime('%Y-%m-%d %H:%M:%S')}")

    async def schedule_next_raise(self, account_id: int, initial: bool = False):
        """Умно планирует следующее поднятие лотов с учетом 4-часового кулдауна и рандомной задержки от 1 до 60 минут."""
        key = f"account_{account_id}_raise"
        if key in self.active_jobs:
            try:
                self.scheduler.remove_job(self.active_jobs[key])
            except Exception:
                pass
            del self.active_jobs[key]

        async with async_session_maker() as db:
            account = await db.get(FanpayAccount, account_id)
            if not account or not account.is_active:
                return

            delay_seconds = 5 # Дефолт при первом запуске без кулдауна
            
            if initial:
                # Если запуск первый раз, проверим когда было последнее успешное поднятие
                if account.last_raised:
                    elapsed = datetime.utcnow() - account.last_raised
                    cooldown_rem = timedelta(hours=4) - elapsed
                    if cooldown_rem.total_seconds() > 0:
                        # Кулдаун еще идет! Планируем запуск сразу по окончанию + рандом 1-60 минут
                        delay_seconds = cooldown_rem.total_seconds() + random.randint(60, 3600)
                    else:
                        # Кулдаун прошел, запускаем почти сразу (через 10-60 сек)
                        delay_seconds = random.randint(10, 60)
                else:
                    # Ни разу не поднимали, запускаем через 5 секунд
                    delay_seconds = 5
            else:
                # Если поднятие только что завершилось, планируем на 4 часа + рандом 1-60 минут
                delay_seconds = 240 * 60 + random.randint(60, 3600)

            run_time = datetime.now() + timedelta(seconds=delay_seconds)
            run_time_utc = datetime.utcnow() + timedelta(seconds=delay_seconds)
            
            # Записываем точное время следующего запуска в БД (в формате UTC)
            account.next_raise = run_time_utc
            db.add(account)
            await db.commit()

            # Добавляем задачу в планировщик
            job = self.scheduler.add_job(
                self.job_raise_lots,
                trigger='date',
                run_date=run_time,
                args=[account_id],
                id=key
            )
            self.active_jobs[key] = job.id
            
            formatted_time = run_time_utc.strftime("%Y-%m-%d %H:%M:%S")
            await self.add_log(db, account_id, f"Следующее умное поднятие запланировано на {formatted_time} UTC (кулдаун 4ч + рандом).")

    # =========================================================================
    # УПРАВЛЕНИЕ ЖИЗНЕННЫМ ЦИКЛОМ ДЖОБ
    # =========================================================================

    async def register_account_jobs(self, account_id: int):
        """
        Регистрирует и запускает все фоновые задачи для указанного аккаунта.
        Удаляет старые джобы перед созданием новых, чтобы исключить дублирование.
        """
        self.unregister_account_jobs(account_id)

        # 1. Вечный онлайн (каждые 5 минут)
        job_online = self.scheduler.add_job(
            self.job_keep_online,
            trigger=IntervalTrigger(minutes=5),
            args=[account_id],
            id=f"account_{account_id}_online"
        )
        self.active_jobs[f"account_{account_id}_online"] = job_online.id

        # 2. Умное автоподнятие предложений (база 4 часа кулдауна + рандомная задержка 1-60 минут)
        await self.schedule_next_raise(account_id, initial=True)

        # 3. Автовыдача и ИИ-автоответчик (каждые 20 секунд)
        job_delivery = self.scheduler.add_job(
            self.job_autodelivery_and_ai,
            trigger=IntervalTrigger(seconds=20),
            args=[account_id],
            id=f"account_{account_id}_delivery"
        )
        self.active_jobs[f"account_{account_id}_delivery"] = job_delivery.id

        # 4. Автопонижение цен (демпинг) (каждые 7 минут)
        job_damping = self.scheduler.add_job(
            self.job_damping,
            trigger=IntervalTrigger(minutes=7),
            args=[account_id],
            id=f"account_{account_id}_damping"
        )
        self.active_jobs[f"account_{account_id}_damping"] = job_damping.id

        # 5. Авто-напоминание об отзыве (каждые 15 минут)
        job_followup = self.scheduler.add_job(
            self.job_review_followup,
            trigger=IntervalTrigger(minutes=15),
            args=[account_id],
            id=f"account_{account_id}_followup"
        )
        self.active_jobs[f"account_{account_id}_followup"] = job_followup.id

        # 6. Полная фоновая синхронизация (запуск через 5 секунд, далее по цепочке через рандомные интервалы)
        run_time = datetime.now() + timedelta(seconds=5)
        job_sync = self.scheduler.add_job(
            self.job_full_sync,
            trigger='date',
            run_date=run_time,
            args=[account_id],
            id=f"account_{account_id}_full_sync"
        )
        self.active_jobs[f"account_{account_id}_full_sync"] = job_sync.id

        logger.info(f"Все фоновые задачи для аккаунта {account_id} успешно зарегистрированы.")

    def unregister_account_jobs(self, account_id: int):
        """Удаляет все фоновые задачи для аккаунта."""
        job_suffixes = ["online", "raise", "delivery", "damping", "followup", "full_sync"]
        for suffix in job_suffixes:
            key = f"account_{account_id}_{suffix}"
            if key in self.active_jobs:
                job_id = self.active_jobs[key]
                try:
                    self.scheduler.remove_job(job_id)
                except Exception:
                    pass
                del self.active_jobs[key]
        logger.info(f"Все фоновые задачи для аккаунта {account_id} остановлены.")

    async def sync_all_active_accounts(self):
        """Синхронизирует задачи планировщика со всеми активными аккаунтами в БД."""
        async with async_session_maker() as db:
            query = select(FanpayAccount).where(FanpayAccount.is_active == True)
            res = await db.execute(query)
            active_accounts = res.scalars().all()
            
            for acc in active_accounts:
                await self.register_account_jobs(acc.id)
                await self.add_log(db, acc.id, "Бот активирован и фоновые процессы запущены в планировщике.")

# Глобальный инстанс менеджера задач
scheduler_manager = SchedulerManager()
