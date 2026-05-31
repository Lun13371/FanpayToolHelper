import logging
import re
import json
from typing import List, Optional, Tuple, Dict, Any, AsyncGenerator
from bs4 import BeautifulSoup
import httpx

logger = logging.getLogger("fanpay.client")

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

    def _get_client(self) -> httpx.AsyncClient:
        """
        Создает асинхронный HTTP-клиент с настроенными заголовками, прокси и куками.
        """
        # Настройка прокси (SOCKS5/HTTP)
        proxy = self.proxy_url if self.proxy_url else None

        headers = {
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
            "Referer": "https://funpay.com/"
        }

        # Конвертируем все значения кук в строки для HTTPX
        cleaned_cookies = {k: str(v) for k, v in self.cookies.items()}

        return httpx.AsyncClient(
            proxy=proxy,
            headers=headers,
            cookies=cleaned_cookies,
            timeout=15.0,
            follow_redirects=True
        )

    def _extract_csrf_token(self, html: str) -> Optional[str]:
        """
        Парсит HTML-код и извлекает CSRF-токен из data-app-data, мета-тегов или атрибутов.
        """
        soup = BeautifulSoup(html, "html.parser")
        
        # 1. Извлекаем из data-app-data в теге body (самый точный способ)
        body = soup.find("body")
        if body and body.has_attr("data-app-data"):
            try:
                app_data = json.loads(body.get("data-app-data"))
                if "csrf-token" in app_data:
                    return str(app_data["csrf-token"])
                if "csrf_token" in app_data:
                    return str(app_data["csrf_token"])
            except:
                pass

        # 2. Ищем в <html data-csrf-token="...">
        html_tag = soup.find("html")
        if html_tag and html_tag.has_attr("data-csrf-token"):
            return html_tag["data-csrf-token"]
            
        # 3. Ищем в input полях
        csrf_input = soup.find("input", {"name": "csrf_token"})
        if csrf_input and csrf_input.has_attr("value"):
            return csrf_input["value"]
            
        # 4. Ищем регулярным выражением (буквенно-цифровой паттерн!)
        match = re.search(r'csrf[_-]token\s*:\s*[\'"]([a-z0-9]+)[\'"]', html, re.IGNORECASE)
        if match:
            return match.group(1)
            
        return None

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

                # Парсим имя пользователя
                soup = BeautifulSoup(html, "html.parser")
                user_link = soup.find("a", href=re.compile(r"/users/\d+/"))
                username = "Unknown"
                if user_link:
                    # Имя обычно внутри блока с классом user-link-name
                    name_span = user_link.find(class_="user-link-name")
                    username = name_span.text.strip() if name_span else user_link.text.strip()

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

                soup_main = BeautifulSoup(main_resp.text, "html.parser")
                body = soup_main.find("body")
                user_id = None
                if body and body.has_attr("data-app-data"):
                    try:
                        app_data = json.loads(body.get("data-app-data"))
                        user_id = str(app_data.get("userId"))
                    except:
                        pass
                
                if not user_id:
                    user_id = "20052933" # Дефолтный ID
                
                yield {"type": "init", "progress": 15, "message": f"Загрузка профиля пользователя (ID: {user_id})..."}
                profile_url = f"https://funpay.com/users/{user_id}/"
                profile_resp = await client.get(profile_url)
                if profile_resp.status_code != 200:
                    yield {"type": "error", "progress": 100, "message": f"Не удалось получить профиль пользователя. Код: {profile_resp.status_code}"}
                    return
                
                soup_prof = BeautifulSoup(profile_resp.text, "html.parser")
                rows = soup_prof.find_all("a", class_="tc-item")
                if not rows:
                    yield {"type": "empty", "progress": 100, "message": "У вас нет активных лотов для поднятия."}
                    return
                
                # Собираем уникальные lot_id и их названия игр из профиля
                lot_ids = []
                lot_game_map = {}
                for row in rows:
                    href = row.get("href", "")
                    lot_id_match = re.search(r"id=(\d+)", href)
                    if lot_id_match:
                        lot_id = lot_id_match.group(1)
                        lot_ids.append(lot_id)
                        
                        # Находим заголовок категории/игры внутри контейнера 'offer'
                        game_name = ""
                        offer_parent = row.find_parent(class_="offer")
                        if offer_parent:
                            title_div = offer_parent.find(class_="offer-list-title") or offer_parent.find(class_="offer-list-title-container")
                            if title_div:
                                game_name = title_div.text.strip()
                            if not game_name:
                                h3 = offer_parent.find("h3")
                                if h3:
                                    game_name = h3.text.strip()
                        
                        # Если не нашли, попробуем старый метод обхода в качестве запасного
                        if not game_name:
                            curr = row
                            while curr:
                                sibling = curr.find_previous_sibling(class_=re.compile(r"tc-header|tc-game", re.I)) or curr.find_previous_sibling(class_="tc-header")
                                if sibling:
                                    game_name = sibling.text.strip()
                                    break
                                
                                parent = curr.parent
                                if parent:
                                    header = parent.find(class_=re.compile(r"tc-header|tc-game", re.I)) or parent.find(class_="tc-header")
                                    if header:
                                        game_name = header.text.strip()
                                        break
                                else:
                                    break
                                curr = parent
                        
                        if game_name:
                            # Очищаем лишние пробелы и переносы
                            game_name = re.sub(r"\s+", " ", game_name).strip()
                            lot_game_map[lot_id] = game_name
                
                # Ограничим первыми 5 лотами для безопасности и скорости
                target_lot_ids = lot_ids[:5]
                total_lots = len(target_lot_ids)
                
                yield {"type": "init", "progress": 25, "message": f"Найдено лотов для проверки: {total_lots}. Начинаем обход..."}
                
                processed_nodes = set()
                
                for idx, lot_id in enumerate(target_lot_ids):
                    current_progress = 25 + int(((idx + 1) / total_lots) * 70)
                    yield {"type": "lot_start", "progress": current_progress, "message": f"Анализ лота {idx + 1}/{total_lots} (ID: {lot_id})..."}
                    
                    edit_url = f"https://funpay.com/lots/offerEdit?offer={lot_id}"
                    edit_resp = await client.get(edit_url)
                    if edit_resp.status_code != 200:
                        yield {"type": "log", "message": f"Не удалось загрузить страницу редактирования для лота {lot_id}"}
                        continue
                    
                    soup_edit = BeautifulSoup(edit_resp.text, "html.parser")
                    node_input = soup_edit.find("input", {"name": "node_id"})
                    node_id = node_input.get("value") if node_input else None
                    
                    if not node_id:
                        yield {"type": "log", "message": f"Не удалось найти node_id для лота {lot_id}"}
                        continue
                        
                    if node_id in processed_nodes:
                        yield {"type": "log", "message": f"Раздел для node_id {node_id} уже обработан ранее."}
                        continue
                    
                    processed_nodes.add(node_id)
                    
                    trade_url = f"https://funpay.com/lots/{node_id}/trade"
                    trade_resp = await client.get(trade_url)
                    if trade_resp.status_code != 200:
                        yield {"type": "log", "message": f"Не удалось загрузить раздел {node_id}"}
                        continue
                    
                    soup_trade = BeautifulSoup(trade_resp.text, "html.parser")
                    btn_raise = soup_trade.find("button", class_=re.compile(r"raise", re.I)) or soup_trade.find(class_=re.compile(r"raise", re.I))
                    
                    if not btn_raise:
                        yield {"type": "log", "message": f"Кнопка поднятия в разделе {node_id} не найдена."}
                        continue
                        
                    game_id = btn_raise.get("data-game")
                    node_id_from_btn = btn_raise.get("data-node") or node_id
                    
                    # 1. Сначала берем название игры, которое мы сохранили из публичного профиля
                    category_name = lot_game_map.get(lot_id, "")
                    
                    # 2. Пытаемся дополнить/найти из хлебных крошек или h1 страницы раздела
                    trade_category = ""
                    breadcrumb = soup_trade.find(class_="breadcrumb")
                    if breadcrumb:
                        lis = [li.text.strip() for li in breadcrumb.find_all("li") if li.text.strip()]
                        # Исключаем главный пункт "FunPay"
                        if lis and lis[0].lower() in ("funpay", "фанпей"):
                            lis = lis[1:]
                        # Фильтруем технические слова типа "Ваши предложения" из хлебных крошек
                        lis = [item for item in lis if not any(w in item.lower() for w in ("ваши предложения", "ваши предложения", "ваши товары", "поднять", "управление", "предложения"))]
                        if lis:
                            trade_category = " / ".join(lis)
                    
                    if not trade_category:
                        h1 = soup_trade.find("h1")
                        if h1:
                            h1_text = h1.text.strip()
                            if not any(w in h1_text.lower() for w in ("ваши предложения", "ваши товары", "поднять", "управление", "предложения")):
                                trade_category = h1_text
                    
                    # Если нашли красивое название подраздела, используем его, иначе используем имя игры из профиля
                    if trade_category:
                        category_name = trade_category
                    
                    if not category_name:
                        category_name = btn_raise.text.strip().replace("\n", " ") or f"Раздел {node_id}"
                        category_name = re.sub(r"\s+", " ", category_name).strip()
                        if any(w in category_name.lower() for w in ("поднять", "предложен", "ваши")):
                            category_name = f"Раздел {node_id}"
                    
                    if not (game_id and node_id_from_btn):
                        yield {"type": "log", "message": f"Некорректные параметры game_id/node_id для {category_name}"}
                        continue
                        
                    # Выполняем POST запрос на поднятие лотов
                    raise_url = "https://funpay.com/lots/raise"
                    payload = {
                        "game_id": game_id,
                        "node_id": node_id_from_btn,
                        "csrf_token": csrf_token
                    }
                    headers = {
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "X-Requested-With": "XMLHttpRequest"
                    }
                    
                    raise_res = await client.post(raise_url, data=payload, headers=headers)
                    if raise_res.status_code == 200:
                        res_json = raise_res.json()
                        if res_json.get("success", False):
                            yield {
                                "type": "success",
                                "category": category_name,
                                "progress": current_progress,
                                "message": "Лоты успешно подняты!"
                            }
                        else:
                            msg = res_json.get("desc", "Кулдаун")
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
                
                yield {"type": "done", "progress": 100, "message": "Поднятие лотов завершено!"}
                    
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

                soup = BeautifulSoup(response.text, "html.parser")
                order_rows = soup.find_all("a", class_="tc-item")
                
                paid_orders = []
                for row in order_rows:
                    # Ищем статус заказа
                    status_div = row.find(class_="tc-status")
                    if not status_div:
                        continue
                    
                    status_text = status_div.text.strip().lower()
                    
                    # На Funpay оплаченный заказ, ожидающий выдачи, имеет статус "оплачен" или "ожидает отправки"
                    # В верстке это блок без класса tc-status-finished (который означает завершенный)
                    # Обычно статус равен "оплачен" или "ожидает доставки"
                    is_paid = "оплачен" in status_text or "доставки" in status_text or "отправки" in status_text

                    if is_paid:
                        # Извлекаем ID заказа
                        id_div = row.find(class_="tc-order")
                        order_id = id_div.text.strip() if id_div else None
                        
                        # Название лота
                        order_desc_div = row.find(class_="order-desc")
                        if order_desc_div:
                            desc_inner = order_desc_div.find("div")
                            lot_name = desc_inner.text.strip() if desc_inner else order_desc_div.text.strip()
                        else:
                            title_div = row.find(class_="tc-desc-text") or row.find(class_="tc-desc") or row.find(class_="tc-title")
                            lot_name = title_div.text.strip() if title_div else "Неизвестный лот"
                        # Убираем лишние пробелы и переносы
                        lot_name = re.sub(r'\s+', ' ', lot_name)

                        # Имя покупателя
                        buyer_div = row.find(class_="tc-user")
                        buyer_name = buyer_div.text.strip() if buyer_div else "Покупатель"

                        # Ссылка на заказ
                        order_url = row.get("href") # Например https://funpay.com/orders/O-123456/
                        
                        # Сумма заказа
                        price_div = row.find(class_="tc-price")
                        price_text = price_div.text.strip() if price_div else "0"
                        price = float(re.sub(r'[^\d.]', '', price_text.replace(",", ".")) or 0)

                        paid_orders.append({
                            "order_id": order_id,
                            "lot_name": lot_name,
                            "buyer_name": buyer_name,
                            "order_url": order_url,
                            "price": price
                        })

                return paid_orders

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
                soup = BeautifulSoup(html, "html.parser")

                # Извлекаем node ID из формы чата. Чат на странице заказа обернут в форму
                # Обычно <form class="chat-form" data-node="12345">
                chat_form = soup.find("form", class_="chat-form")
                node_id = None
                if chat_form and chat_form.has_attr("data-node"):
                    node_id = chat_form["data-node"]
                else:
                    # Попробуем найти через атрибуты контейнера сообщений
                    chat_container = soup.find(class_="chat")
                    if chat_container and chat_container.has_attr("data-node"):
                        node_id = chat_container["data-node"]

                if not node_id:
                    # Попробуем regex в HTML
                    match = re.search(r'data-node\s*=\s*[\'"](\d+)[\'"]', html)
                    if match:
                        node_id = match.group(1)

                # Извлекаем сообщения чата
                messages = []
                # Сообщения лежат в блоках с классом chat-msg
                msg_blocks = soup.find_all(class_="chat-msg")
                
                for msg in msg_blocks:
                    # Имя автора сообщения
                    author_div = msg.find(class_="chat-msg-author")
                    if not author_div:
                        continue
                    
                    author = author_div.text.strip().lower()
                    
                    # Текст сообщения
                    text_div = msg.find(class_="chat-msg-text")
                    if not text_div:
                        continue
                    text = text_div.text.strip()

                    # Определяем роль
                    # Если класс msg содержит 'chat-msg-state', это системное оповещение
                    # Если имя автора совпадает со словом 'я' или 'вы' или 'seller', это продавец
                    # Иначе - покупатель
                    is_me = "chat-msg-mine" in msg.get("class", []) or author == "я" or author == "вы"
                    role = "seller" if is_me else "buyer"
                    
                    messages.append((role, text))

                # Возвращаем последние 12 сообщений
                return node_id, messages[-12:]

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

                soup = BeautifulSoup(html, "html.parser")
                
                # Ищем форму редактирования предложения или лота
                form = soup.find("form", class_="form-offer-editor") or soup.find("form", action=re.compile(r"/lots/(save|offerSave)", re.I)) or soup.find("form")
                if not form:
                    logger.error(f"Форма сохранения лота не найдена на странице для лота {lot_id}")
                    return False

                # Определяем URL отправки формы
                action_path = form.get("action", "/lots/offerSave")
                if not action_path.startswith("http"):
                    save_url = f"https://funpay.com{action_path}"
                else:
                    save_url = action_path

                payload = {}
                # Извлекаем все <input>, <select>, <textarea>
                for inp in form.find_all(["input", "select", "textarea"]):
                    name = inp.get("name")
                    if not name:
                        continue
                    
                    # Особая обработка для чекбоксов
                    if inp.name == "input" and inp.get("type") == "checkbox":
                        if inp.has_attr("checked"):
                            payload[name] = inp.get("value", "1")
                        continue
                    
                    val = inp.get("value", "")
                    if inp.name == "textarea":
                        val = inp.text
                    payload[name] = val

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

                soup = BeautifulSoup(response.text, "html.parser")
                
                # Проверим авторизацию
                if "/account/logout" not in response.text:
                    logger.warning("Синхронизация профиля: сессия не авторизована (нет ссылки logout в HTML)")
                    return stats

                # Парсим никнейм из шапки (как в Cardinal)
                username_el = soup.find("div", class_="user-link-name")
                if username_el:
                    stats["username"] = username_el.text.strip()
                    logger.info(f"Синхронизация профиля: спарсили никнейм: {stats['username']}")

                # Извлекаем собственный ID строго из data-app-data в теге body (самый точный способ в 2026 году!)
                body = soup.find("body")
                if body and body.has_attr("data-app-data"):
                    try:
                        app_data = json.loads(body.get("data-app-data"))
                        stats["funpay_user_id"] = str(app_data.get("userId"))
                        logger.info(f"Синхронизация профиля: спарсили userId из data-app-data: {stats['funpay_user_id']}")
                    except Exception as e:
                        logger.error(f"Не удалось распарсить data-app-data: {e}")

                # Фаллбек извлечения ID, если data-app-data не спарсился
                if not stats["funpay_user_id"]:
                    user_bar = soup.find(class_="user-bar")
                    user_link = user_bar.find("a", href=re.compile(r"/users/\d+/")) if user_bar else None
                    if not user_link:
                        user_link = soup.find("a", class_="avatar", href=re.compile(r"/users/\d+/"))
                    if user_link:
                        href = user_link.get("href", "")
                        id_match = re.search(r"/users/(\d+)/", href)
                        if id_match:
                            stats["funpay_user_id"] = id_match.group(1)
                            logger.info(f"Синхронизация профиля: фаллбек спарсил userId: {stats['funpay_user_id']}")

                # Ищем баланс (по классу badge badge-balance как в Cardinal)
                balance_span = soup.find("span", class_="badge badge-balance") or soup.find(class_="badge-balance")
                if balance_span:
                    try:
                        balance_text = balance_span.text.strip()
                        # Очищаем от валюты и пробелов: вытаскиваем только цифры, точки и запятые
                        balance_clean = re.sub(r"[^\d.,]", "", balance_text).replace(",", ".")
                        if balance_clean:
                            stats["balance"] = float(balance_clean)
                            logger.info(f"Синхронизация профиля: спарсили баланс: {stats['balance']}")
                    except Exception as e:
                        logger.error(f"Ошибка парсинга баланса: {e}")

                # 2. Если есть ID пользователя, грузим профиль для рейтинга и отзывов
                if stats["funpay_user_id"]:
                    profile_url = f"https://funpay.com/users/{stats['funpay_user_id']}/"
                    prof_resp = await client.get(profile_url)
                    logger.info(f"Синхронизация профиля: URL {profile_url}, код ответа: {prof_resp.status_code}, длина ответа: {len(prof_resp.text)}")
                    
                    if prof_resp.status_code == 200:
                        p_soup = BeautifulSoup(prof_resp.text, "html.parser")
                        html_text = prof_resp.text
                        
                        # 1. Парсинг точного рейтинга (Оценка) из класса rating-value (самый точный способ)
                        rating_div = p_soup.find(class_=re.compile(r"\brating-value\b", re.I))
                        if rating_div:
                            rating_text = rating_div.text.strip().replace(",", ".")
                            num_match = re.search(r"([\d.]+)", rating_text)
                            if num_match:
                                try:
                                    stats["rating"] = float(num_match.group(1))
                                    logger.info(f"Синхронизация профиля: спарсили точный рейтинг из rating-value: {stats['rating']}")
                                except ValueError:
                                    pass

                        # Фаллбек 1: Если класса rating-value нет, ищем регулярным выражением
                        if stats["rating"] == 0.0:
                            rating_match = re.search(r"([\d.]+)\s*(?:из|out of)\s*5", html_text, re.IGNORECASE)
                            if rating_match:
                                try:
                                    stats["rating"] = float(rating_match.group(1))
                                    logger.info(f"Синхронизация профиля: фаллбек регулярки спарсил рейтинг: {stats['rating']}")
                                except ValueError:
                                    pass

                        # Фаллбек 2: Ищем точечно в class="rating-mini" или "big-rating"
                        if stats["rating"] == 0.0:
                            rating_span = p_soup.find(class_="rating-mini") or p_soup.find(class_="big-rating")
                            if rating_span:
                                try:
                                    r_val = re.sub(r"[^\d.]", "", rating_span.text.strip())
                                    if r_val:
                                        stats["rating"] = float(r_val)
                                        logger.info(f"Синхронизация профиля: фаллбек спарсил рейтинг из rating-mini: {stats['rating']}")
                                except ValueError:
                                    pass

                        # Если рейтинг всё еще 0.0 (например, на сайте стоит "? из 5"),
                        # рассчитываем средний балл по реальным звездам из последних отзывов на странице,
                        # строго игнорируя фильтры отзывов в шапке
                        if stats["rating"] == 0.0:
                            review_items = p_soup.find_all(class_=re.compile(r"review-item-rating|review-item", re.I))
                            stars = []
                            for item in review_items:
                                star_el = item.find(class_=re.compile(r"rating[1-5]", re.I))
                                if star_el:
                                    for cls in star_el.get("class", []):
                                        m = re.match(r"^rating([1-5])$", cls, re.IGNORECASE)
                                        if m:
                                            stars.append(int(m.group(1)))
                            if stars:
                                stats["rating"] = round(sum(stars) / len(stars), 2)
                                logger.info(f"Синхронизация профиля: рейтинг рассчитан по звездам последних отзывов: {stats['rating']}")

                        # 2. Парсинг количества отзывов по ссылке #reviews
                        reviews_link = p_soup.find("a", href=re.compile(r"#reviews"))
                        if reviews_link:
                            try:
                                rev_text = re.sub(r"\D", "", reviews_link.text)
                                if rev_text:
                                    stats["reviews_count"] = int(rev_text)
                                    logger.info(f"Синхронизация профиля: спарсили отзывы по ссылке #reviews: {stats['reviews_count']}")
                            except ValueError:
                                pass
                        else:
                            rev_text_match = re.search(r"(\d+)\s+(?:отзыв|отзывов|отзыва|review|reviews)", html_text, re.IGNORECASE)
                            if rev_text_match:
                                stats["reviews_count"] = int(rev_text_match.group(1))
                                logger.info(f"Синхронизация профиля: фаллбек спарсили отзывы (regex): {stats['reviews_count']}")

                return stats
            except Exception as e:
                logger.error(f"Исключение при синхронизации профиля Funpay: {str(e)}")
                return stats

    async def get_active_lots(self) -> List[Dict[str, Any]]:
        """
        Парсит лоты непосредственно со страницы публичного профиля пользователя на Funpay.
        """
        async with self._get_client() as client:
            lots = []
            try:
                # 1. Сначала получим ID пользователя из главной страницы
                main_resp = await client.get("https://funpay.com/")
                user_id = None
                if main_resp.status_code == 200:
                    soup = BeautifulSoup(main_resp.text, "html.parser")
                    body = soup.find("body")
                    if body and body.has_attr("data-app-data"):
                        try:
                            app_data = json.loads(body.get("data-app-data"))
                            user_id = str(app_data.get("userId"))
                        except:
                            pass
                
                if not user_id:
                    user_id = "20052933" # Дефолтный ID, если не спарсился
                    
                profile_url = f"https://funpay.com/users/{user_id}/"
                logger.info(f"Загрузка лотов из публичного профиля: {profile_url}")
                profile_resp = await client.get(profile_url)
                
                if profile_resp.status_code == 200:
                    soup = BeautifulSoup(profile_resp.text, "html.parser")
                    rows = soup.find_all("a", class_="tc-item")
                    logger.info(f"Парсинг профиля: найдено {len(rows)} лотов")
                    
                    for row in rows:
                        href = row.get("href", "")
                        lot_id_match = re.search(r"id=(\d+)", href)
                        if not lot_id_match:
                            continue
                        lot_id = lot_id_match.group(1)
                        
                        desc_div = row.find(class_="tc-desc-text") or row.find(class_="tc-desc")
                        lot_name = desc_div.text.strip() if desc_div else "Без названия"
                        lot_name = re.sub(r'\s+', ' ', lot_name)
                        
                        price_val = 0.0
                        price_div = row.find(class_="tc-price")
                        if price_div:
                            if price_div.has_attr("data-s"):
                                price_val = float(price_div["data-s"])
                            else:
                                price_text = price_div.text.strip().replace(" ", "").replace(",", ".")
                                price_match = re.search(r"([\d.]+)", price_text)
                                if price_match:
                                    price_val = float(price_match.group(1))
                                    
                        amount_val = 1
                        amount_div = row.find(class_=re.compile(r"tc-amount", re.I))
                        if amount_div:
                            amount_text = amount_div.text.strip()
                            amount_match = re.search(r"(\d+)", amount_text)
                            if amount_match:
                                amount_val = int(amount_match.group(1))
                                
                        category_name = "Другое"
                        parent = row.find_parent(class_=re.compile(r"^(offer|mb20|tc-subcategory|yours-offers)$", re.I))
                        if parent:
                            # 1. Сначала ищем h3, h5, h4, h2 заголовки, где лежит реальное название игры/категории
                            hdr = parent.find(["h3", "h5", "h4", "h2"])
                            if hdr:
                                # Находим подкатегорию (обычно внутри span с классом text-muted или просто span)
                                sub_el = hdr.find("span", class_="text-muted") or hdr.find("span")
                                sub_name = sub_el.text.strip() if sub_el else ""
                                
                                # Находим название игры (внутри ссылки <a> или как текст заголовка)
                                game_el = hdr.find("a")
                                if game_el:
                                    game_name = game_el.text.strip()
                                else:
                                    # Если ссылки нет, вычитаем текст подкатегории из полного текста
                                    game_name = hdr.text.replace(sub_name, "").strip() if sub_name else hdr.text.strip()
                                    
                                # Чистим лишние пробелы и переносы
                                game_name = re.sub(r'\s+', ' ', game_name).strip()
                                sub_name = re.sub(r'\s+', ' ', sub_name).strip()
                                
                                if game_name and sub_name:
                                    category_name = f"{game_name} / {sub_name}"
                                elif game_name:
                                    category_name = game_name
                                else:
                                    category_name = hdr.text.strip().split("\n")[0].strip()
                            else:
                                # 2. Фаллбек на случай если заголовков нет, но есть класс tc-header (игнорируем если там написано 'Описание')
                                hdr_el = parent.find(class_=re.compile(r"tc-header|tc-title|game-title", re.I))
                                if hdr_el and "описание" not in hdr_el.text.lower() and "description" not in hdr_el.text.lower():
                                    category_name = hdr_el.text.strip().split("\n")[0].strip()

                        # Проверяем наличие значка молнии (встроенной автовыдачи) на самом Funpay
                        has_native_delivery = False
                        if (row.find("span", class_="lightning") or 
                            row.find("i", class_=re.compile(r"lightning|flash|auto-dlv", re.I)) or 
                            row.find(class_=re.compile(r"auto-dlv-icon|sc-offer-icons", re.I)) or
                            "⚡" in row.text):
                            has_native_delivery = True

                        lots.append({
                            "lot_id": lot_id,
                            "lot_name": lot_name,
                            "price": price_val,
                            "amount": amount_val,
                            "category": category_name,
                            "native_auto_delivery": has_native_delivery
                        })
                    return lots
                else:
                    logger.error(f"Не удалось загрузить публичный профиль: {profile_resp.status_code}")
                    return []
            except Exception as e:
                logger.error(f"Исключение при парсинге лотов из профиля Funpay: {str(e)}")
                return lots

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

                soup = BeautifulSoup(response.text, "html.parser")
                contact_items = soup.find_all("a", class_=re.compile(r"contact-item", re.I))
                
                chats = []
                for item in contact_items:
                    node_id = item.get("data-id")
                    if not node_id:
                        href = item.get("href", "")
                        node_match = re.search(r"node=(\d+)", href)
                        if node_match:
                            node_id = node_match.group(1)
                    
                    if not node_id:
                        continue

                    # Никнейм
                    name_el = item.find(class_=re.compile(r"contact-item-name|media-heading", re.I))
                    username = name_el.text.strip() if name_el else "Пользователь"

                    # Аватар
                    avatar_el = item.find(class_=re.compile(r"avatar|contact-item-avatar", re.I))
                    avatar_url = None
                    if avatar_el and avatar_el.has_attr("style"):
                        style = avatar_el["style"]
                        url_match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
                        if url_match:
                            avatar_url = url_match.group(1)
                    
                    # Последнее сообщение
                    msg_el = item.find(class_=re.compile(r"contact-item-msg|contact-item-text", re.I))
                    last_message = msg_el.text.strip() if msg_el else ""
                    last_message = re.sub(r'\s+', ' ', last_message)

                    # Непрочитанные
                    is_unread = "unread" in item.get("class", [])
                    unread_count = 0
                    counter_el = item.find(class_=re.compile(r"contact-item-counter|badge", re.I))
                    if counter_el:
                        try:
                            unread_count = int(re.sub(r"\D", "", counter_el.text))
                            is_unread = True
                        except:
                            is_unread = True
                            unread_count = 1

                    chats.append({
                        "node_id": node_id,
                        "username": username,
                        "avatar_url": avatar_url,
                        "last_message": last_message,
                        "is_unread": is_unread,
                        "unread_count": unread_count
                    })
                return chats
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

                soup = BeautifulSoup(response.text, "html.parser")
                msg_blocks = soup.find_all(class_=re.compile(r"chat-msg", re.I))
                
                messages = []
                for msg in msg_blocks:
                    # Имя автора сообщения
                    author_div = msg.find(class_=re.compile(r"chat-msg-author", re.I))
                    author = author_div.text.strip() if author_div else "Система"
                    
                    # Текст сообщения
                    text_div = msg.find(class_=re.compile(r"chat-msg-text", re.I))
                    if not text_div:
                        continue
                    text = text_div.text.strip()

                    # Время сообщения
                    time_div = msg.find(class_=re.compile(r"chat-msg-date|chat-msg-time", re.I))
                    time_str = time_div.text.strip() if time_div else ""

                    is_me = "chat-msg-mine" in msg.get("class", []) or author.lower() in ["я", "вы"]
                    
                    messages.append({
                        "author": author,
                        "text": text,
                        "is_me": is_me,
                        "time": time_str
                    })
                return messages
            except Exception as e:
                logger.error(f"Ошибка получения сообщений из чата {node_id}: {e}")
                return []

    async def get_lot_details(self, lot_id: str) -> Dict[str, Any]:
        """
        Загружает страницу редактирования лота, парсит все поля формы и извлекает:
        - Текущую цену и количество.
        - Состояние встроенной автовыдачи FunPay (активна ли, какой текст загружен).
        - Полный словарь полей формы для последующего сохранения.
        - Парсит цены покупателей с учетом комиссии.
        - Извлекает все поля ввода с их названиями и опциями для динамической настройки.
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
                soup = BeautifulSoup(html, "html.parser")
                
                # Ищем форму редактирования предложения или лота
                form = soup.find("form", class_="form-offer-editor") or soup.find("form", action=re.compile(r"/lots/(save|offerSave)", re.I)) or soup.find("form")
                if not form:
                    logger.error(f"Форма редактирования лота {lot_id} не найдена.")
                    return {}

                form_action = form.get("action", "")
                
                # Парсим комиссии/цены покупателей
                buyer_prices = []
                table = soup.find("table", class_="table-buyers-prices")
                if table:
                    tbody = table.find("tbody")
                    rows = tbody.find_all("tr") if tbody else table.find_all("tr")
                    for row in rows:
                        th = row.find("th")
                        td = row.find("td")
                        if th and td:
                            buyer_prices.append({
                                "method": th.text.strip(),
                                "price": td.text.strip()
                            })

                fields = {}
                form_fields = []
                
                # Парсим все поля ввода
                for inp in form.find_all(["input", "select", "textarea"]):
                    name = inp.get("name")
                    if not name:
                        continue
                    
                    el_type = inp.get("type", inp.name)
                    val = inp.get("value", "")
                    
                    # Особая обработка для чекбоксов
                    if el_type == "checkbox":
                        val = "1" if inp.has_attr("checked") else "0"
                    
                    # Особая обработка для select (текст опций)
                    options = []
                    if inp.name == "select":
                        el_type = "select"
                        selected_option = inp.find("option", selected=True)
                        val = selected_option.get("value", "") if selected_option else ""
                        for opt in inp.find_all("option"):
                            opt_label = opt.text.strip()
                            if not opt_label:
                                opt_label = "-- не выбрано --"
                            options.append({
                                "value": opt.get("value", ""),
                                "label": opt_label
                            })
                    
                    # Особая обработка для textarea (текст лежит внутри тега)
                    if inp.name == "textarea":
                        el_type = "textarea"
                        val = inp.text
                    
                    fields[name] = val
                    
                    # Пропускаем скрытые системные поля и поля, которые не должны редактироваться пользователем (например, Способ получения)
                    if el_type == "hidden" or name == "fields[method]":
                        continue
                    
                    # Парсим человекочитаемое имя (label)
                    label_text = ""
                    
                    # Список дружелюбных имен для стандартных полей, чтобы не было путаницы
                    label_overrides = {
                        "fields[summary][ru]": "Краткое описание (RU)",
                        "fields[summary][en]": "Краткое описание (EN)",
                        "fields[desc][ru]": "Подробное описание (RU)",
                        "fields[desc][en]": "Подробное описание (EN)",
                        "fields[payment_msg][ru]": "Сообщение покупателю после оплаты (RU)",
                        "fields[payment_msg][en]": "Сообщение покупателю после оплаты (EN)",
                        "price": "Цена товара (Вы получите)",
                        "amount": "Остаток товара (Количество)",
                        "active": "Объявление активно на FunPay",
                        "deactivate_after_sale": "Деактивировать после продажи",
                        "fields[type]": "Тип предложения",
                        "fields[method]": "Способ получения",
                    }
                    
                    if name in label_overrides:
                        label_text = label_overrides[name]
                    else:
                        parent_group = inp.find_parent(class_=re.compile(r"form-group|form-row", re.I))
                        if parent_group:
                            label_el = parent_group.find("label")
                            if label_el:
                                label_text = label_el.text.strip()
                                label_text = re.sub(r'\s+', ' ', label_text).strip()
                                
                        inp_id = inp.get("id")
                        if not label_text and inp_id:
                            label_el = soup.find("label", {"for": inp_id})
                            if label_el:
                                label_text = label_el.text.strip()
                                
                        if not label_text and inp.parent.name == "label":
                            label_text = inp.parent.text.strip()
                            
                        if not label_text:
                            label_text = inp.get("placeholder", name)
                            
                        label_text = re.sub(r'\s+', ' ', label_text).strip().rstrip(":")
                    
                    form_fields.append({
                        "name": name,
                        "label": label_text,
                        "type": el_type,
                        "value": val,
                        "options": options if el_type == "select" else None
                    })

                # Выделяем нужные параметры
                price = float(fields.get("price", "0").replace(",", ".")) if "price" in fields else 0.0
                amount = int(fields.get("amount", "1")) if "amount" in fields else 1

                # Находим поля родной автовыдачи
                native_auto_delivery_enabled = False
                native_auto_delivery_text = ""
                supports_native_auto_delivery = any("auto_delivery" in k or "secrets" in k for k in fields.keys())
                
                # Ищем поле галочки автовыдачи
                if "auto_delivery" in fields:
                    native_auto_delivery_enabled = fields.get("auto_delivery") == "1"
                
                # Ищем поле текста автовыдачи (обычно 'secrets' или 'auto_delivery_text')
                if "secrets" in fields:
                    native_auto_delivery_text = fields.get("secrets", "")
                elif "auto_delivery_text" in fields:
                    native_auto_delivery_text = fields.get("auto_delivery_text", "")

                return {
                    "lot_id": lot_id,
                    "price": price,
                    "amount": amount,
                    "native_auto_delivery_enabled": native_auto_delivery_enabled,
                    "native_auto_delivery_text": native_auto_delivery_text,
                    "supports_native_auto_delivery": supports_native_auto_delivery,
                    "fields": fields,
                    "form_fields": form_fields,
                    "buyer_prices": buyer_prices,
                    "form_action": form_action
                }
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

                soup = BeautifulSoup(response.text, "html.parser")
                form = soup.find("form", class_="form-offer-editor") or soup.find("form", action=re.compile(r"/lots/(save|offerSave)", re.I)) or soup.find("form")
                if not form:
                    logger.error("Форма сохранения не найдена.")
                    return False

                # Определяем URL отправки формы
                action_path = form.get("action", "/lots/offerSave")
                if not action_path.startswith("http"):
                    save_url = f"https://funpay.com{action_path}"
                else:
                    save_url = action_path

                # Парсим свежие базовые поля формы
                payload = {}
                for inp in form.find_all(["input", "select", "textarea"]):
                    name = inp.get("name")
                    if not name:
                        continue
                    
                    # Особая обработка чекбоксов (если отмечен - посылаем значение, иначе пропускаем)
                    if inp.name == "input" and inp.get("type") == "checkbox":
                        if inp.has_attr("checked"):
                            payload[name] = inp.get("value", "1")
                        continue
                        
                    val = inp.get("value", "")
                    if inp.name == "textarea":
                        val = inp.text
                    payload[name] = val

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

