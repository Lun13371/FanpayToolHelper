import logging
import re
import json
import asyncio
import random
import time
from typing import List, Optional, Tuple, Dict, Any, AsyncGenerator
import httpx

from app.services.fanpay.parsers import (
    extract_csrf_token,
    parse_profile_stats,
    parse_active_lots_list,
    parse_paid_orders_list,
    parse_chat_node_id_and_history,
    parse_dialogs_list,
    parse_chat_messages_history,
    parse_lot_edit_form_details,
    parse_lot_creation_form_details,
    parse_all_categories_list,
    parse_trade_page_for_raising,
    parse_lot_details_page
)

logger = logging.getLogger("fanpay.client")

class RetryingAsyncClient(httpx.AsyncClient):
    """
    Кастомный HTTPX AsyncClient с автоматическим повтором запросов при 429 ошибке (Too Many Requests)
    и временных ошибках сервера (500, 502, 503, 504) с экспоненциальной задержкой.
    Также добавляет умные задержки (jitter) между последовательными запросами к Funpay для симуляции человека.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.last_request_time = 0.0

    async def request(self, method: str, url: Any, **kwargs) -> httpx.Response:
        max_retries = 5
        base_delay = 1.5
        response = None
        
        # Не ретривим не-Funpay запросы (например, гео-локатор)
        is_funpay = "funpay.com" in str(url)
        
        if is_funpay:
            # Имитируем человеческую задержку перехода между страницами (human page transition delay / jitter)
            # Если между запросами прошло меньше 0.6 - 1.8 сек, поспим рандомно перед отправкой нового запроса
            now = time.time()
            elapsed = now - self.last_request_time
            required_delay = random.uniform(0.6, 1.8)
            if self.last_request_time > 0.0 and elapsed < required_delay:
                sleep_time = required_delay - elapsed
                await asyncio.sleep(sleep_time)
        
        for attempt in range(max_retries):
            try:
                response = await super().request(method, url, **kwargs)
                
                # Если все хорошо или это не Funpay, возвращаем ответ
                if not is_funpay or response.status_code not in (429, 500, 502, 503, 504):
                    if is_funpay:
                        self.last_request_time = time.time()
                    return response
                
                # Вычисляем экспоненциальную задержку
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    f"Код {response.status_code} для {url}. "
                    f"Повтор через {delay:.2f} сек (попытка {attempt + 1}/{max_retries})."
                )
                await asyncio.sleep(delay)
                
            except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
                if attempt == max_retries - 1:
                    raise e
                delay = base_delay * (2 ** attempt)
                logger.warning(
                    f"Ошибка сети/таймаут ({str(e)}) при запросе к {url}. "
                    f"Повтор через {delay:.2f} сек (попытка {attempt + 1}/{max_retries})."
                )
                await asyncio.sleep(delay)
                
        if is_funpay:
            self.last_request_time = time.time()
        return response

class FanpayClient:
    """
    Низкоуровневый клиент для взаимодействия с API и веб-версией Funpay.
    Использует HTTPX для асинхронных запросов через резидентные прокси и с куками пользователя.
    """

    def __init__(
        self, 
        golden_key: str, 
        proxy_url: str, 
        user_agent: Optional[str] = None,
        cookies: Optional[Dict[str, Any]] = None
    ):
        self.golden_key = golden_key
        self.proxy_url = proxy_url
        self.user_agent = user_agent or "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
        self.cookies = cookies or {}
        
        # Обязательно вшиваем golden_key в куки
        self.cookies["golden_key"] = golden_key

    def _get_aligned_headers(self) -> Dict[str, str]:
        """
        Генерирует максимально точные, легитимные заголовки браузера (Chrome, Edge, Firefox, Safari)
        на основе текущего User-Agent для обхода систем детекта Cloudflare и FunPay.
        """
        ua = self.user_agent or "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
        ua_lower = ua.lower()
        
        # Определяем платформу для Sec-Ch-Ua-Platform
        platform = '"Windows"'
        if "macintosh" in ua_lower or "mac os" in ua_lower:
            platform = '"macOS"'
        elif "linux" in ua_lower:
            platform = '"Linux"'
        elif "android" in ua_lower:
            platform = '"Android"'
        elif "iphone" in ua_lower or "ipad" in ua_lower:
            platform = '"iOS"'

        # Базовые заголовки, общие для всех браузеров
        headers = {
            "User-Agent": ua,
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://funpay.com/",
            "Upgrade-Insecure-Requests": "1"
        }

        # 1. Google Chrome / Chromium
        if "chrome" in ua_lower or "chromium" in ua_lower:
            chrome_match = re.search(r"chrome/(\d+)", ua_lower)
            chrome_ver = chrome_match.group(1) if chrome_match else "125"
            
            headers.update({
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Sec-Ch-Ua": f'"Not/A)Brand";v="8", "Chromium";v="{chrome_ver}", "Google Chrome";v="{chrome_ver}"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": platform,
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-User": "?1"
            })
            
        # 2. Microsoft Edge
        elif "edg" in ua_lower:
            edge_match = re.search(r"edg/(\d+)", ua_lower)
            edge_ver = edge_match.group(1) if edge_match else "125"
            chrome_match = re.search(r"chrome/(\d+)", ua_lower)
            chrome_ver = chrome_match.group(1) if chrome_match else "125"
            
            headers.update({
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "Sec-Ch-Ua": f'"Not/A)Brand";v="8", "Chromium";v="{chrome_ver}", "Microsoft Edge";v="{edge_ver}"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": platform,
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-User": "?1"
            })
            
        # 3. Mozilla Firefox
        elif "firefox" in ua_lower:
            headers.update({
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3"
            })
            
        # 4. Apple Safari
        elif "safari" in ua_lower:
            headers.update({
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            })
            
        # 5. Дефолтные совместимые заголовки
        else:
            headers.update({
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
            })

        return headers

    def _get_client(self) -> httpx.AsyncClient:
        """
        Создает асинхронный HTTP-клиент с настроенными заголовками, прокси и куками.
        """
        # Настройка прокси (SOCKS5/HTTP)
        proxy = self.proxy_url if self.proxy_url else None

        # Получаем легитимный набор заголовков на основе User-Agent
        headers = self._get_aligned_headers()

        # Конвертируем все значения кук в строки для HTTPX
        cleaned_cookies = {k: str(v) for k, v in self.cookies.items()}
        # Вшиваем cookie_prefs: "1" для не-API запросов к страницам Funpay
        cleaned_cookies["cookie_prefs"] = "1"

        return RetryingAsyncClient(
            proxy=proxy,
            headers=headers,
            cookies=cleaned_cookies,
            timeout=25.0,
            follow_redirects=True
        )

    def _extract_csrf_token(self, html: str) -> Optional[str]:
        """
        Извлекает CSRF-токен из HTML.
        """
        return extract_csrf_token(html)

    async def get_connection_ip_and_geo(self) -> Tuple[Optional[str], Optional[str]]:
        """
        Запрашивает внешний IP и гео-позицию через текущее подключение (используя прокси, если задан).
        """
        async with self._get_client() as client:
            try:
                # ip-api.com работает бесплатно без ключей и возвращает детальное гео
                response = await client.get("http://ip-api.com/json/", timeout=8.0)
                if response.status_code == 200:
                    data = response.json()
                    if data.get("status") == "success":
                        ip = data.get("query")
                        country = data.get("country", "")
                        city = data.get("city", "")
                        geo = f"{country}, {city}".strip(", ")
                        return ip, geo
            except Exception as e:
                logger.error(f"Ошибка при определении внешнего IP/Гео: {e}")
        return None, None

    async def verify_session(self) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Проверяет валидность сессии (golden_key).
        Использует переданные куки. Если веб-сервер выдает 502 из-за конфликта кук,
        автоматически сбрасывает их до чистого golden_key и повторяет запрос.
        Возвращает (is_valid, username, updated_cookies).
        """
        async with self._get_client() as client:
            try:
                response = await client.get("https://funpay.com/")
                
                # Если получили 502, значит старые куки конфликтуют. Сбрасываем и повторяем!
                if response.status_code == 502:
                    logger.warning("verify_session: получили код 502. Пробуем сбросить куки до чистого golden_key.")
                    self.cookies = {"golden_key": self.golden_key}
                    async with self._get_client() as fallback_client:
                        response = await fallback_client.get("https://funpay.com/")
                
                if response.status_code != 200:
                    return False, f"HTTP Error {response.status_code}", {}

                html = response.text
                # Если в HTML есть ссылка на выход (в любой локали) или юзер-бар, сессия валидна
                if "logout" not in html.lower() and "user-link-name" not in html:
                    return False, "Not Authorized (No logout link)", {}

                # Парсим имя пользователя с помощью утилиты
                stats = parse_profile_stats(html)
                username = stats.get("username") or "Unknown"

                # Обновляем сохраненные куки без вызова конфликта дубликатов (например, PHPSESSID)
                current_cookies = {}
                for cookie in client.cookies.jar:
                    current_cookies[cookie.name] = cookie.value
                # Обязательно сохраняем и сам golden_key в куках
                current_cookies["golden_key"] = self.golden_key
                self.cookies = current_cookies
                return True, username, current_cookies

            except Exception as e:
                logger.error(f"Ошибка при верификации сессии Funpay: {str(e)}")
                return False, f"Connection error: {str(e)}", {}

    async def raise_offers_generator(self) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Генератор, который парсит лоты и поднимает их категории, отправляя информацию о прогрессе.
        """
        async with self._get_client() as client:
            try:
                yield {"type": "init", "progress": 5, "message": "Инициализация: Получение CSRF токена..."}
                main_resp = await client.get("https://funpay.com/")
                if main_resp.status_code != 200:
                    yield {"type": "error", "progress": 100, "message": f"Не удалось загрузить главную страницу. Код: {main_resp.status_code}"}
                    return
                
                csrf_token = self._extract_csrf_token(main_resp.text)
                if not csrf_token:
                    yield {"type": "error", "progress": 100, "message": "Не удалось извлечь CSRF токен для автоподнятия"}
                    return

                # Парсим ID пользователя с главной страницы
                stats = parse_profile_stats(main_resp.text)
                user_id = stats.get("funpay_user_id") or "20052933"
                
                yield {"type": "init", "progress": 15, "message": f"Загрузка профиля пользователя (ID: {user_id})..."}
                profile_url = f"https://funpay.com/users/{user_id}/"
                profile_resp = await client.get(profile_url)
                if profile_resp.status_code != 200:
                    yield {"type": "error", "progress": 100, "message": f"Не удалось получить профиль пользователя. Код: {profile_resp.status_code}"}
                    return
                
                # Парсим активные лоты из профиля с помощью утилиты
                active_lots = parse_active_lots_list(profile_resp.text)
                if not active_lots:
                    yield {"type": "empty", "progress": 100, "message": "У вас нет активных лотов для поднятия."}
                    return
                
                # Формируем списки лотов и соответствие категорий
                lot_ids = [lot["lot_id"] for lot in active_lots]
                lot_game_map = {}
                for lot in active_lots:
                    # Из категории "НазваниеИгры / Подкатегория" берем только НазваниеИгры
                    game_part = lot["category"].split(" / ")[0] if " / " in lot["category"] else lot["category"]
                    lot_game_map[lot["lot_id"]] = game_part
                
                # Увеличим лимит до 40 лотов для полной обработки всех категорий
                target_lot_ids = lot_ids[:40]
                total_lots = len(target_lot_ids)
                
                yield {"type": "init", "progress": 20, "message": f"Найдено лотов: {len(lot_ids)}. Анализируем первые {total_lots} для сбора категорий..."}
                
                processed_nodes = set()
                games_to_raise = {} # game_id -> {"category_name": str, "node_ids": set()}
                
                for idx, lot_id in enumerate(target_lot_ids):
                    # Прогресс сбора: от 20% до 80%
                    current_progress = 20 + int(((idx + 1) / total_lots) * 60)
                    yield {"type": "lot_start", "progress": current_progress, "message": f"Анализ лота {idx + 1}/{total_lots} (ID: {lot_id})..."}
                    
                    edit_url = f"https://funpay.com/lots/offerEdit?offer={lot_id}"
                    edit_resp = await client.get(edit_url)
                    if edit_resp.status_code != 200:
                        yield {"type": "log", "message": f"Не удалось загрузить страницу редактирования для лота {lot_id}"}
                        continue
                    
                    details = parse_lot_edit_form_details(edit_resp.text)
                    node_id = details["fields"].get("node_id")
                    
                    if not node_id:
                        yield {"type": "log", "message": f"Не удалось найти node_id для лота {lot_id}"}
                        continue
                        
                    if node_id in processed_nodes:
                        yield {"type": "log", "message": f"Раздел для node_id {node_id} уже обработан."}
                        continue
                    
                    processed_nodes.add(node_id)
                    
                    trade_url = f"https://funpay.com/lots/{node_id}/trade"
                    trade_resp = await client.get(trade_url)
                    if trade_resp.status_code != 200:
                        yield {"type": "log", "message": f"Не удалось загрузить раздел {node_id}"}
                        continue
                    
                    # 1. Сначала берем название игры, которое мы сохранили из публичного профиля
                    default_category_name = lot_game_map.get(lot_id, "")
                    
                    # Парсим параметры поднятия с помощью утилиты
                    game_id, node_id_from_btn, category_name = parse_trade_page_for_raising(
                        trade_resp.text, node_id, default_category_name
                    )
                    
                    if not (game_id and node_id_from_btn):
                        yield {"type": "log", "message": f"Кнопка поднятия в разделе {node_id} не найдена или не содержит параметров."}
                        continue
                    
                    # Сохраняем собранные данные разделов для пакетного поднятия
                    if game_id not in games_to_raise:
                        games_to_raise[game_id] = {
                            "category_name": category_name,
                            "node_ids": set()
                        }
                    games_to_raise[game_id]["node_ids"].add(node_id_from_btn)
                
                if not games_to_raise:
                    yield {"type": "empty", "progress": 100, "message": "Не найдено активных категорий для поднятия."}
                    return
                
                # Запускаем пакетное поднятие
                yield {"type": "init", "progress": 80, "message": f"Сбор данных завершен. Найдено уникальных игр: {len(games_to_raise)}. Начинаем пакетное поднятие..."}
                
                total_games = len(games_to_raise)
                for g_idx, (game_id, data) in enumerate(games_to_raise.items()):
                    # Прогресс поднятия: от 80% до 98%
                    current_progress = 80 + int(((g_idx + 1) / total_games) * 18)
                    category_name = data["category_name"]
                    nodes_list = list(data["node_ids"])
                    
                    yield {"type": "lot_start", "progress": current_progress, "message": f"Поднятие игры {category_name} (разделов: {len(nodes_list)})..."}
                    
                    raise_url = "https://funpay.com/lots/raise"
                    payload = {
                        "game_id": game_id,
                        "node_id": nodes_list[0],
                        "node_ids[]": nodes_list,
                        "csrf_token": csrf_token
                    }
                    headers = {
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "X-Requested-With": "XMLHttpRequest"
                    }
                    
                    raise_res = await client.post(raise_url, data=payload, headers=headers)
                    if raise_res.status_code == 200:
                        res_json = raise_res.json()
                        is_success = res_json.get("success", False) or not res_json.get("error")
                        if is_success:
                            yield {
                                "type": "success",
                                "category": category_name,
                                "progress": current_progress,
                                "message": f"Категория успешно поднята! (разделов: {len(nodes_list)})"
                            }
                        else:
                            msg = res_json.get("msg") or res_json.get("desc") or "Кулдаун"
                            yield {
                                "type": "cooldown",
                                "category": category_name,
                                "progress": current_progress,
                                "message": msg
                            }
                    else:
                        yield {
                            "type": "error",
                            "category": category_name,
                            "progress": current_progress,
                            "message": f"Ошибка запроса к Funpay: {raise_res.status_code}"
                        }
                
                yield {"type": "done", "progress": 100, "message": "Поднятие всех лотов успешно завершено!"}
                    
            except Exception as e:
                logger.error(f"Исключение при ручном поднятии лотов: {str(e)}")
                yield {"type": "error", "progress": 100, "message": f"Исключение: {str(e)}"}

    async def raise_offers(self) -> Tuple[bool, str]:
        """
        Парсит лоты из публичного профиля, находит их подразделы (/trade) и отправляет запросы на поднятие.
        """
        raised_categories = []
        has_errors = False
        last_error = None
        has_any_attempts = False
        
        async for step in self.raise_offers_generator():
            if step["type"] == "success":
                raised_categories.append(step["category"])
                has_any_attempts = True
            elif step["type"] in ("cooldown", "error"):
                has_any_attempts = True
                if step["type"] == "error":
                    has_errors = True
                    last_error = step["message"]
            elif step["type"] == "empty":
                return True, "У вас нет активных лотов для поднятия."
                
        if raised_categories:
            return True, f"Успешно подняты категории: {', '.join(raised_categories)}"
        elif has_errors and not has_any_attempts:
            return False, f"Ошибка при поднятии: {last_error}"
        else:
            return True, "Все категории находятся в кулдауне поднятия или подняты ранее."

    async def get_paid_orders(self) -> List[Dict[str, Any]]:
        """
        Парсит страницу продаж 'https://funpay.com/orders/trade' и находит оплаченные заказы,
        которые требуют доставки товара.
        """
        async with self._get_client() as client:
            try:
                response = await client.get("https://funpay.com/orders/trade")
                if response.status_code != 200:
                    logger.error(f"Не удалось получить заказы. Код {response.status_code}")
                    return []

                return parse_paid_orders_list(response.text)

            except Exception as e:
                logger.error(f"Ошибка при парсинге оплаченных заказов: {str(e)}")
                return []

    async def get_chat_node_and_history(self, order_id: str) -> Tuple[Optional[str], List[Tuple[str, str]]]:
        """
        Загружает страницу заказа и извлекает:
        1. ID чата (node) для переписки.
        2. Последние 12 сообщений (отправитель 'buyer'/'seller', текст).
        """
        async with self._get_client() as client:
            try:
                # На Funpay ссылка на заказ имеет вид https://funpay.com/orders/O-XXXXXX/
                url = f"https://funpay.com/orders/{order_id}/"
                response = await client.get(url)
                if response.status_code != 200:
                    return None, []

                html = response.text
                return parse_chat_node_id_and_history(html)

            except Exception as e:
                logger.error(f"Ошибка при сборе чата для заказа {order_id}: {str(e)}")
                return None, []

    async def send_message(self, node_id: str, text: str) -> bool:
        """
        Отправляет текстовое сообщение в чат с указанным node_id.
        """
        async with self._get_client() as client:
            try:
                # Сначала нам нужно зайти в чат или на любую страницу, чтобы получить актуальный CSRF
                # Или мы можем получить CSRF прямо из первого запроса, так как он обычно кэширован в сессии
                chat_url = f"https://funpay.com/chat/?node={node_id}"
                response = await client.get(chat_url)
                if response.status_code != 200:
                    return False

                csrf_token = self._extract_csrf_token(response.text)
                if not csrf_token:
                    logger.error(f"Не удалось извлечь CSRF токен для отправки сообщения в ноду {node_id}")
                    return False

                # POST запрос на отправку сообщения
                send_url = "https://funpay.com/chat/message" if "message" in response.text else "https://funpay.com/chat/"
                
                # На Funpay отправка сообщения обычно идет POST запросом на /chat/
                # с параметрами node, content, csrf_token
                payload = {
                    "node": node_id,
                    "content": text,
                    "csrf_token": csrf_token
                }
                headers = {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                }

                res = await client.post("https://funpay.com/chat/", data=payload, headers=headers)
                if res.status_code == 200:
                    return True
                
                # Попробуем альтернативный эндпоинт, если основной дал сбой
                res_alt = await client.post("https://funpay.com/chat/message", data=payload, headers=headers)
                return res_alt.status_code == 200

            except Exception as e:
                logger.error(f"Исключение при отправке сообщения в ноду {node_id}: {str(e)}")
                return False

    async def update_lot_price(self, lot_id: str, new_price: float) -> bool:
        """
        Переходит на страницу редактирования лота, парсит форму и обновляет цену.
        """
        # Сбрасываем куки до чистого golden_key для предотвращения конфликтов устаревшей сессии (PHPSESSID/CSRF)
        self.cookies = {"golden_key": self.golden_key}
        
        async with self._get_client() as client:
            try:
                # 1. Загружаем страницу редактирования лота (пробуем сначала offerEdit, потом edit)
                edit_url = f"https://funpay.com/lots/offerEdit?offer={lot_id}"
                response = await client.get(edit_url)
                if response.status_code != 200:
                    edit_url = f"https://funpay.com/lots/edit?id={lot_id}"
                    response = await client.get(edit_url)

                if response.status_code != 200:
                    logger.error(f"Не удалось открыть лот {lot_id} для изменения цены.")
                    return False

                html = response.text
                csrf_token = self._extract_csrf_token(html)
                if not csrf_token:
                    return False

                # Парсим детали формы
                details = parse_lot_edit_form_details(html)
                if not details["fields"]:
                    logger.error(f"Форма сохранения лота не найдена на странице для лота {lot_id}")
                    return False

                # Определяем URL отправки формы
                action_path = details["form_action"]
                if not action_path.startswith("http"):
                    save_url = f"https://funpay.com{action_path}"
                else:
                    save_url = action_path

                payload = details["fields"]
                # Модифицируем цену на новую
                payload["price"] = f"{new_price:.2f}"
                payload["csrf_token"] = csrf_token

                # Отправляем форму сохранения
                headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Requested-With": "XMLHttpRequest"
                }

                logger.info(f"Отправка запроса изменения цены лота {lot_id} на {save_url}")
                save_res = await client.post(save_url, data=payload, headers=headers)
                if save_res.status_code == 200:
                    # Проверяем ответ
                    try:
                        res_json = save_res.json()
                        return not res_json.get("error")
                    except:
                        return "ошибка" not in save_res.text.lower()
                
                return False

            except Exception as e:
                logger.error(f"Исключение при демпинге цены для лота {lot_id}: {str(e)}")
                return False

    async def leave_review(self, order_id: str, rating: int, text: str) -> bool:
        """
        Оставляет автоматический ответный отзыв покупателю.
        """
        async with self._get_client() as client:
            try:
                # На Funpay отзывы оставляются через страницу заказа или специальный эндпоинт
                # GET https://funpay.com/orders/O-XXXXXX/
                url = f"https://funpay.com/orders/{order_id}/"
                response = await client.get(url)
                if response.status_code != 200:
                    return False

                csrf_token = self._extract_csrf_token(response.text)
                if not csrf_token:
                    return False

                # Формируем запрос на добавление отзыва
                # Обычно это POST на /orders/review c параметрами order, rating (1-5), text, csrf_token
                payload = {
                    "order": order_id,
                    "rating": str(rating),
                    "text": text,
                    "csrf_token": csrf_token
                }
                headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Requested-With": "XMLHttpRequest"
                }

                res = await client.post("https://funpay.com/orders/review", data=payload, headers=headers)
                return res.status_code == 200

            except Exception as e:
                logger.error(f"Ошибка при оставлении автоотзыва на заказ {order_id}: {str(e)}")
                return False

    async def sync_profile_and_stats(self) -> Dict[str, Any]:
        """
        Парсит главную страницу и страницу профиля пользователя на Funpay,
        извлекая баланс, имя пользователя, ID и статистику отзывов/рейтинга.
        Использует переданные куки, при ошибке 502 автоматически сбрасывает их до чистого golden_key.
        """
        async with self._get_client() as client:
            stats = {
                "funpay_user_id": None,
                "balance": 0.0,
                "rating": 0.0,
                "reviews_count": 0,
                "username": "Unknown"
            }
            try:
                # 1. Загружаем главную для имени, ID и баланса
                response = await client.get("https://funpay.com/")
                
                # Если получили 502, значит старые куки конфликтуют. Сбрасываем их и повторяем!
                if response.status_code == 502:
                    logger.warning("sync_profile_and_stats: получили код 502. Пробуем сбросить куки до чистого golden_key.")
                    self.cookies = {"golden_key": self.golden_key}
                    async with self._get_client() as fallback_client:
                        response = await fallback_client.get("https://funpay.com/")

                logger.info(f"Синхронизация профиля: статус главной страницы: {response.status_code}, длина: {len(response.text)}")
                if response.status_code != 200:
                    return stats

                # Проверим авторизацию
                if "/account/logout" not in response.text:
                    logger.warning("Синхронизация профиля: сессия не авторизована (нет ссылки logout в HTML)")
                    return stats

                # Сначала парсим главную страницу
                stats = parse_profile_stats(response.text)

                # 2. Если есть ID пользователя, грузим профиль для рейтинга и отзывов
                if stats["funpay_user_id"]:
                    profile_url = f"https://funpay.com/users/{stats['funpay_user_id']}/"
                    prof_resp = await client.get(profile_url)
                    logger.info(f"Синхронизация профиля: URL {profile_url}, код ответа: {prof_resp.status_code}, длина ответа: {len(prof_resp.text)}")
                    
                    if prof_resp.status_code == 200:
                        # Парсим также страницу профиля с помощью утилиты
                        stats = parse_profile_stats(response.text, prof_resp.text)

                return stats
            except Exception as e:
                logger.error(f"Исключение при синхронизации профиля Funpay: {str(e)}")
                return stats

    async def get_active_lots(self) -> List[Dict[str, Any]]:
        """
        Парсит лоты непосредственно со страницы публичного профиля пользователя на Funpay.
        """
        async with self._get_client() as client:
            try:
                # 1. Сначала получим ID пользователя из главной страницы
                main_resp = await client.get("https://funpay.com/")
                user_id = None
                if main_resp.status_code == 200:
                    stats = parse_profile_stats(main_resp.text)
                    user_id = stats.get("funpay_user_id")
                
                if not user_id:
                    user_id = "20052933" # Дефолтный ID, если не спарсился
                    
                profile_url = f"https://funpay.com/users/{user_id}/"
                logger.info(f"Загрузка лотов из публичного профиля: {profile_url}")
                profile_resp = await client.get(profile_url)
                
                if profile_resp.status_code == 200:
                    return parse_active_lots_list(profile_resp.text)
                else:
                    logger.error(f"Не удалось загрузить публичный профиль: {profile_resp.status_code}")
                    return []
            except Exception as e:
                logger.error(f"Исключение при парсинге лотов из профиля Funpay: {str(e)}")
                return []

    async def get_chats(self) -> List[Dict[str, Any]]:
        """
        Парсит страницу диалогов https://funpay.com/chat/ и возвращает список активных чатов.
        """
        async with self._get_client() as client:
            try:
                response = await client.get("https://funpay.com/chat/")
                if response.status_code != 200:
                    logger.error(f"Не удалось открыть страницу чатов. Код: {response.status_code}")
                    return []

                return parse_dialogs_list(response.text)
            except Exception as e:
                logger.error(f"Ошибка парсинга списка чатов Funpay: {e}")
                return []

    async def get_chat_messages(self, node_id: str) -> List[Dict[str, Any]]:
        """
        Загружает историю сообщений конкретного чата по node_id.
        """
        async with self._get_client() as client:
            try:
                response = await client.get(f"https://funpay.com/chat/?node={node_id}")
                if response.status_code != 200:
                    logger.error(f"Не удалось открыть чат {node_id}. Код: {response.status_code}")
                    return []

                return parse_chat_messages_history(response.text)
            except Exception as e:
                logger.error(f"Ошибка получения сообщений из чата {node_id}: {e}")
                return []

    async def get_lot_details(self, lot_id: str) -> Dict[str, Any]:
        """
        Загружает страницу редактирования лота, парсит все поля формы и извлекает подробные параметры.
        """
        # Сбрасываем куки до чистого golden_key для предотвращения конфликтов устаревшей сессии (PHPSESSID/CSRF)
        self.cookies = {"golden_key": self.golden_key}
        
        async with self._get_client() as client:
            try:
                # Сначала пробуем открыть страницу редактирования предложения (individual offerEdit)
                edit_url = f"https://funpay.com/lots/offerEdit?offer={lot_id}"
                response = await client.get(edit_url)
                if response.status_code != 200:
                    # Если вернуло 404, пробуем старый URL lots/edit (category/settings)
                    edit_url = f"https://funpay.com/lots/edit?id={lot_id}"
                    response = await client.get(edit_url)
                
                if response.status_code != 200:
                    logger.error(f"Не удалось открыть страницу редактирования лота {lot_id}. Код: {response.status_code}")
                    return {}

                html = response.text
                return parse_lot_details_page(html, lot_id)
            except Exception as e:
                logger.error(f"Исключение при извлечении деталей лота {lot_id}: {e}")
                return {}

    async def save_lot_settings(
        self, 
        lot_id: str, 
        fields: Dict[str, Any], 
        price: Optional[float] = None, 
        native_auto_delivery_enabled: Optional[bool] = None, 
        native_auto_delivery_text: Optional[str] = None,
        custom_fields: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Сохраняет лот на FunPay, используя базовые поля формы и внося в них нужные изменения.
        """
        # Сбрасываем куки до чистого golden_key для предотвращения конфликтов устаревшей сессии (PHPSESSID/CSRF)
        self.cookies = {"golden_key": self.golden_key}
        
        async with self._get_client() as client:
            try:
                # 1. Загружаем страницу редактирования лота
                edit_url = f"https://funpay.com/lots/offerEdit?offer={lot_id}"
                response = await client.get(edit_url)
                if response.status_code != 200:
                    edit_url = f"https://funpay.com/lots/edit?id={lot_id}"
                    response = await client.get(edit_url)
                
                if response.status_code != 200:
                    return False

                csrf_token = self._extract_csrf_token(response.text)
                if not csrf_token:
                    logger.error("Не удалось извлечь CSRF токен для сохранения лота.")
                    return False

                # Парсим свежие базовые поля формы
                details = parse_lot_edit_form_details(response.text)
                if not details["fields"]:
                    logger.error("Форма сохранения не найдена.")
                    return False

                # Определяем URL отправки формы
                action_path = details["form_action"]
                if not action_path.startswith("http"):
                    save_url = f"https://funpay.com{action_path}"
                else:
                    save_url = action_path

                payload = details["fields"]
                payload["csrf_token"] = csrf_token

                # 2. Применяем кастомные поля с фронтенда
                if custom_fields:
                    for k, v in custom_fields.items():
                        if k == "csrf_token" or k == "form_created_at":
                            continue
                        # Обработка чекбоксов во входящем словаре
                        if isinstance(v, bool):
                            if v:
                                payload[k] = "1"
                            else:
                                payload.pop(k, None)
                        elif v == "1":
                            payload[k] = "1"
                        elif v == "0" or v is None or v == "":
                            # Если чекбокс или пустое поле
                            if k in ["active", "deactivate_after_sale", "auto_delivery"]:
                                payload.pop(k, None)
                            else:
                                payload[k] = ""
                        else:
                            payload[k] = str(v)

                # 3. Применяем переданные переопределения (для совместимости)
                if price is not None:
                    payload["price"] = f"{price:.2f}"
                
                # Настройка автовыдачи (secrets / auto_delivery_text)
                if native_auto_delivery_enabled is not None:
                    auto_deliv_key = "auto_delivery"
                    if "auto_delivery" not in payload and "auto_delivery" in fields:
                        auto_deliv_key = "auto_delivery"
                    
                    if native_auto_delivery_enabled:
                        payload[auto_deliv_key] = "1"
                    else:
                        payload.pop(auto_deliv_key, None)

                if native_auto_delivery_text is not None:
                    # Пытаемся найти нужное текстовое поле (secrets или auto_delivery_text)
                    text_key = "secrets" if "secrets" in payload or "secrets" in fields else "auto_delivery_text"
                    payload[text_key] = native_auto_delivery_text

                # 4. Отправляем запрос на сохранение
                headers = {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Requested-With": "XMLHttpRequest"
                }

                logger.info(f"Отправка формы сохранения лота {lot_id} на {save_url}")
                save_res = await client.post(save_url, data=payload, headers=headers)
                logger.info(f"Ответ FunPay: {save_res.status_code} | {save_res.text[:300]}")
                if save_res.status_code == 200:
                    try:
                        res_json = save_res.json()
                        is_ok = not res_json.get("error")
                        if not is_ok:
                            logger.error(f"FunPay вернул ошибку сохранения лота {lot_id}: {res_json}")
                        return is_ok
                    except Exception as parse_e:
                        logger.warning(f"Не удалось распарсить JSON ответа FunPay: {parse_e}")
                        is_ok = "ошибка" not in save_res.text.lower()
                        return is_ok
                
                return False
            except Exception as e:
                logger.error(f"Исключение при сохранении настроек лота {lot_id}: {e}")
                return False

    async def get_creation_form_details(self, node_id: str) -> Dict[str, Any]:
        """
        Загружает страницу создания лота для указанного node_id, парсит все поля формы и извлекает подробные параметры.
        """
        # Сбрасываем куки до чистого golden_key для предотвращения конфликтов устаревшей сессии (PHPSESSID/CSRF)
        self.cookies = {"golden_key": self.golden_key}
        
        async with self._get_client() as client:
            try:
                edit_url = f"https://funpay.com/lots/offerEdit?node={node_id}"
                response = await client.get(edit_url)
                
                if response.status_code != 200:
                    logger.error(f"Не удалось открыть страницу создания лота для ноды {node_id}. Код: {response.status_code}")
                    return {}

                html = response.text
                return parse_lot_details_page(html, lot_id="creation")
            except Exception as e:
                logger.error(f"Исключение при извлечении деталей формы создания лота для ноды {node_id}: {e}")
                return {}

    async def create_lot(self, node_id: str, fields: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Загружает страницу создания лота для указанного node_id, заполняет поля формы и отправляет POST на Funpay.
        """
        # Сбрасываем куки до чистого golden_key для предотвращения конфликтов устаревшей сессии (PHPSESSID/CSRF)
        self.cookies = {"golden_key": self.golden_key}
        
        async with self._get_client() as client:
            try:
                # 1. Загружаем страницу создания нового лота в категории
                url = f"https://funpay.com/lots/offerEdit?node={node_id}"
                response = await client.get(url)
                if response.status_code != 200:
                    return False, f"Ошибка загрузки страницы создания лота: {response.status_code}"
                
                csrf_token = self._extract_csrf_token(response.text)
                if not csrf_token:
                    return False, "Не удалось извлечь CSRF токен для создания лота."

                details = parse_lot_edit_form_details(response.text)
                if not details["fields"]:
                    return False, "Форма создания лота не найдена на странице."

                action_path = details["form_action"]
                if not action_path.startswith("http"):
                    save_url = f"https://funpay.com{action_path}"
                else:
                    save_url = action_path

                # Заполняем свежие базовые поля формы
                payload = details["fields"]
                payload["csrf_token"] = csrf_token
                for k, v in fields.items():
                    payload[k] = v

                # Отправляем POST-запрос на создание лота
                headers = {
                    "X-Requested-With": "XMLHttpRequest",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
                }
                
                res = await client.post(save_url, data=payload, headers=headers)
                if res.status_code == 200:
                    try:
                        res_json = res.json()
                        if res_json.get("success") or not res_json.get("error"):
                            return True, "Лот успешно создан на Funpay!"
                        error_msg = res_json.get("desc") or res_json.get("message") or "Ошибка сохранения лота"
                        return False, error_msg
                    except Exception:
                        if "success" in res.text or '"error":false' in res.text or not res.text:
                            return True, "Лот успешно создан на Funpay!"
                        return False, f"Ошибка ответа: {res.text[:100]}"
                else:
                    return False, f"Ошибка запроса: {res.status_code}"
            except Exception as e:
                logger.error(f"Исключение при создании лота на ноде {node_id}: {e}")
                return False, f"Исключение: {str(e)}"

    async def parse_all_categories_and_subcategories(self) -> List[Dict[str, Any]]:
        """
        Парсит главную страницу Funpay и извлекает все доступные игры и подкатегории.
        """
        async with self._get_client() as client:
            try:
                resp = await client.get("https://funpay.com/")
                if resp.status_code != 200:
                    return []
                    
                categories = parse_all_categories_list(resp.text)
                results = []
                for cat in categories:
                    subcategories = []
                    for sub in cat["subcategories"]:
                        # Извлекаем тип подкатегории из url для сохранения обратной совместимости
                        type_match = re.search(r"/(lots|chips|currency)/", sub["url"])
                        cat_type = type_match.group(1) if type_match else "lots"
                        subcategories.append({
                            "node_id": sub["node_id"],
                            "name": sub["name"],
                            "type": cat_type
                        })
                    results.append({
                        "game_name": cat["name"],
                        "subcategories": subcategories
                    })
                return results
            except Exception as e:
                logger.error(f"Ошибка при парсинге всех категорий с главной страницы: {e}")
                return []

    async def delete_lot(self, lot_id: str) -> bool:
        """
        Удаляет лот на FunPay, используя упрощенный и сверхнадежный метод из Cardinal.
        """
        # Сбрасываем куки до чистого golden_key для предотвращения конфликтов сессий
        self.cookies = {"golden_key": self.golden_key}
        
        async with self._get_client() as client:
            try:
                # 1. Загружаем страницу редактирования лота для получения актуального CSRF
                edit_url = f"https://funpay.com/lots/offerEdit?offer={lot_id}"
                response = await client.get(edit_url)
                if response.status_code != 200:
                    edit_url = f"https://funpay.com/lots/edit?id={lot_id}"
                    response = await client.get(edit_url)
                
                if response.status_code != 200:
                    logger.error(f"Не удалось открыть страницу лота {lot_id} для удаления.")
                    return False

                csrf_token = self._extract_csrf_token(response.text)
                if not csrf_token:
                    logger.error("Не удалось извлечь CSRF токен для удаления лота.")
                    return False

                # 2. Формируем минимальный payload для удаления, как в Cardinal
                # FunPay не требует валидации остальных полей формы при наличии флага deleted
                payload = {
                    "csrf_token": csrf_token,
                    "offer_id": lot_id,
                    "deleted": "1"
                }

                # 3. Отправляем POST-запрос на lots/offerSave
                save_url = "https://funpay.com/lots/offerSave"
                headers = {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                }

                logger.info(f"Отправка минимального запроса удаления лота {lot_id} на {save_url}")
                save_res = await client.post(save_url, data=payload, headers=headers)
                logger.info(f"Ответ FunPay при удалении: {save_res.status_code} | {save_res.text[:200]}")
                
                if save_res.status_code == 200:
                    try:
                        res_json = save_res.json()
                        is_ok = not res_json.get("error")
                        return is_ok
                    except Exception:
                        is_ok = "ошибка" not in save_res.text.lower()
                        return is_ok
                
                return False
            except Exception as e:
                logger.error(f"Исключение при удалении лота {lot_id}: {e}")
                return False

