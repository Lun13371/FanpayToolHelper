import re
import json
import logging
from typing import List, Optional, Tuple, Dict, Any
from bs4 import BeautifulSoup

logger = logging.getLogger("fanpay.parsers")

def extract_csrf_token(html: str) -> Optional[str]:
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

def parse_profile_stats(html_main: str, html_profile: Optional[str] = None) -> Dict[str, Any]:
    """
    Парсит HTML главной страницы и HTML профиля для получения статистики аккаунта.
    Возвращает словарь со статистикой.
    """
    stats = {
        "funpay_user_id": None,
        "balance": 0.0,
        "rating": 0.0,
        "reviews_count": 0,
        "username": "Unknown"
    }
    
    # --- 1. Парсинг главной страницы ---
    soup_main = BeautifulSoup(html_main, "html.parser")
    
    # Никнейм
    username_el = soup_main.find("div", class_="user-link-name")
    if username_el:
        stats["username"] = username_el.text.strip()

    # ID пользователя
    body = soup_main.find("body")
    if body and body.has_attr("data-app-data"):
        try:
            app_data = json.loads(body.get("data-app-data"))
            stats["funpay_user_id"] = str(app_data.get("userId"))
        except:
            pass

    if not stats["funpay_user_id"]:
        user_bar = soup_main.find(class_="user-bar")
        user_link = user_bar.find("a", href=re.compile(r"/users/\d+/")) if user_bar else None
        if not user_link:
            user_link = soup_main.find("a", class_="avatar", href=re.compile(r"/users/\d+/"))
        if user_link:
            href = user_link.get("href", "")
            id_match = re.search(r"/users/(\d+)/", href)
            if id_match:
                stats["funpay_user_id"] = id_match.group(1)

    # Баланс
    balance_span = soup_main.find("span", class_="badge badge-balance") or soup_main.find(class_="badge-balance")
    if balance_span:
        try:
            balance_text = balance_span.text.strip()
            balance_clean = re.sub(r"[^\d.,]", "", balance_text).replace(",", ".")
            if balance_clean:
                stats["balance"] = float(balance_clean)
        except Exception as e:
            logger.error(f"Ошибка парсинга баланса: {e}")

    # --- 2. Парсинг страницы профиля (если предоставлена) ---
    if html_profile and stats["funpay_user_id"]:
        p_soup = BeautifulSoup(html_profile, "html.parser")
        
        # Рейтинг
        rating_div = p_soup.find(class_=re.compile(r"\brating-value\b", re.I))
        if rating_div:
            rating_text = rating_div.text.strip().replace(",", ".")
            num_match = re.search(r"([\d.]+)", rating_text)
            if num_match:
                try:
                    stats["rating"] = float(num_match.group(1))
                except ValueError:
                    pass

        if stats["rating"] == 0.0:
            rating_match = re.search(r"([\d.]+)\s*(?:из|out of)\s*5", html_profile, re.IGNORECASE)
            if rating_match:
                try:
                    stats["rating"] = float(rating_match.group(1))
                except ValueError:
                    pass

        if stats["rating"] == 0.0:
            rating_span = p_soup.find(class_="rating-mini") or p_soup.find(class_="big-rating")
            if rating_span:
                try:
                    r_val = re.sub(r"[^\d.]", "", rating_span.text.strip())
                    if r_val:
                        stats["rating"] = float(r_val)
                except ValueError:
                    pass

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

        # Количество отзывов
        reviews_link = p_soup.find("a", href=re.compile(r"#reviews"))
        if reviews_link:
            try:
                rev_text = re.sub(r"\D", "", reviews_link.text)
                if rev_text:
                    stats["reviews_count"] = int(rev_text)
            except ValueError:
                pass
        else:
            rev_text_match = re.search(r"(\d+)\s+(?:отзыв|отзывов|отзыва|review|reviews)", html_profile, re.IGNORECASE)
            if rev_text_match:
                stats["reviews_count"] = int(rev_text_match.group(1))

    return stats

def parse_active_lots_list(html: str) -> List[Dict[str, Any]]:
    """
    Парсит страницу профиля пользователя и возвращает список активных лотов.
    """
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.find_all("a", class_="tc-item")
    lots = []
    
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
            hdr = parent.find(["h3", "h5", "h4", "h2"])
            if hdr:
                sub_el = hdr.find("span", class_="text-muted") or hdr.find("span")
                sub_name = sub_el.text.strip() if sub_el else ""
                
                game_el = hdr.find("a")
                if game_el:
                    game_name = game_el.text.strip()
                else:
                    game_name = hdr.text.replace(sub_name, "").strip() if sub_name else hdr.text.strip()
                    
                game_name = re.sub(r'\s+', ' ', game_name).strip()
                sub_name = re.sub(r'\s+', ' ', sub_name).strip()
                
                if game_name and sub_name:
                    category_name = f"{game_name} / {sub_name}"
                elif game_name:
                    category_name = game_name
                else:
                    category_name = hdr.text.strip().split("\n")[0].strip()
            else:
                hdr_el = parent.find(class_=re.compile(r"tc-header|tc-title|game-title", re.I))
                if hdr_el and "описание" not in hdr_el.text.lower() and "description" not in hdr_el.text.lower():
                    category_name = hdr_el.text.strip().split("\n")[0].strip()

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

def parse_paid_orders_list(html: str) -> List[Dict[str, Any]]:
    """
    Парсит страницу продаж 'https://funpay.com/orders/trade' и находит оплаченные заказы.
    """
    soup = BeautifulSoup(html, "html.parser")
    order_rows = soup.find_all("a", class_="tc-item")
    paid_orders = []
    
    for row in order_rows:
        status_div = row.find(class_="tc-status")
        if not status_div:
            continue
        
        status_text = status_div.text.strip().lower()
        is_paid = "оплачен" in status_text or "доставки" in status_text or "отправки" in status_text

        if is_paid:
            id_div = row.find(class_="tc-order")
            order_id = id_div.text.strip() if id_div else None
            
            order_desc_div = row.find(class_="order-desc")
            if order_desc_div:
                desc_inner = order_desc_div.find("div")
                lot_name = desc_inner.text.strip() if desc_inner else order_desc_div.text.strip()
            else:
                title_div = row.find(class_="tc-desc-text") or row.find(class_="tc-desc") or row.find(class_="tc-title")
                lot_name = title_div.text.strip() if title_div else "Неизвестный лот"
            lot_name = re.sub(r'\s+', ' ', lot_name)

            buyer_div = row.find(class_="tc-user")
            buyer_name = buyer_div.text.strip() if buyer_div else "Покупатель"

            order_url = row.get("href")
            
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

def parse_chat_node_id_and_history(html: str) -> Tuple[Optional[str], List[Tuple[str, str]]]:
    """
    Извлекает из страницы заказа:
    1. ID чата (node) для переписки.
    2. Последние сообщения (отправитель 'buyer'/'seller', текст).
    """
    soup = BeautifulSoup(html, "html.parser")

    # Извлекаем node ID из формы чата или контейнера
    chat_form = soup.find("form", class_="chat-form")
    node_id = None
    if chat_form and chat_form.has_attr("data-node"):
        node_id = chat_form["data-node"]
    else:
        chat_container = soup.find(class_="chat")
        if chat_container and chat_container.has_attr("data-node"):
            node_id = chat_container["data-node"]

    if not node_id:
        match = re.search(r'data-node\s*=\s*[\'"](\d+)[\'"]', html)
        if match:
            node_id = match.group(1)

    # Извлекаем сообщения чата
    messages = []
    msg_blocks = soup.find_all(class_="chat-msg")
    
    for msg in msg_blocks:
        author_div = msg.find(class_="chat-msg-author")
        if not author_div:
            continue
        
        author = author_div.text.strip().lower()
        
        text_div = msg.find(class_="chat-msg-text")
        if not text_div:
            continue
        text = text_div.text.strip()

        is_me = "chat-msg-mine" in msg.get("class", []) or author in ("я", "вы")
        role = "seller" if is_me else "buyer"
        
        messages.append((role, text))

    return node_id, messages[-12:]

def parse_dialogs_list(html: str) -> List[Dict[str, Any]]:
    """
    Парсит страницу диалогов https://funpay.com/chat/ и возвращает список активных чатов.
    """
    soup = BeautifulSoup(html, "html.parser")
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

        name_el = item.find(class_=re.compile(r"contact-item-name|media-heading", re.I))
        username = name_el.text.strip() if name_el else "Пользователь"

        avatar_el = item.find(class_=re.compile(r"avatar|contact-item-avatar", re.I))
        avatar_url = None
        if avatar_el and avatar_el.has_attr("style"):
            style = avatar_el["style"]
            url_match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
            if url_match:
                avatar_url = url_match.group(1)
        
        msg_el = item.find(class_=re.compile(r"contact-item-msg|contact-item-text", re.I))
        last_message = msg_el.text.strip() if msg_el else ""
        last_message = re.sub(r'\s+', ' ', last_message)

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

def parse_chat_messages_history(html: str) -> List[Dict[str, Any]]:
    """
    Разбирает историю сообщений конкретного чата по полученному HTML.
    """
    soup = BeautifulSoup(html, "html.parser")
    msg_blocks = soup.find_all(class_=re.compile(r"chat-msg", re.I))
    messages = []
    
    for msg in msg_blocks:
        author_div = msg.find(class_=re.compile(r"chat-msg-author", re.I))
        author = author_div.text.strip() if author_div else "Система"
        
        text_div = msg.find(class_=re.compile(r"chat-msg-text", re.I))
        if not text_div:
            continue
        text = text_div.text.strip()

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

def parse_lot_edit_form_details(html: str) -> Dict[str, Any]:
    """
    Парсит форму страницы редактирования лота и вытаскивает все поля ввода,
    а также текущую цену, остаток и активные флаги.
    """
    soup = BeautifulSoup(html, "html.parser")
    form = soup.find("form", class_="form-offer-editor") or soup.find("form", action=re.compile(r"/lots/(save|offerSave)", re.I)) or soup.find("form")
    details = {
        "form_action": "/lots/offerSave",
        "fields": {},
        "price": 0.0,
        "amount": 1,
        "active": False
    }
    
    if not form:
        return details
        
    details["form_action"] = form.get("action", "/lots/offerSave")
    
    for inp in form.find_all(["input", "select", "textarea"]):
        name = inp.get("name")
        if not name:
            continue
            
        # Настройка чекбоксов
        if inp.name == "input" and inp.get("type") == "checkbox":
            if inp.has_attr("checked"):
                details["fields"][name] = inp.get("value", "1")
                if name == "active":
                    details["active"] = True
            continue
            
        val = inp.get("value", "")
        if inp.name == "textarea":
            val = inp.text
            
        details["fields"][name] = val
        
        # Вытаскиваем точные цену и количество
        if name == "price":
            try:
                details["price"] = float(val)
            except:
                pass
        elif name == "amount":
            try:
                details["amount"] = int(val)
            except:
                pass
                
    return details

def parse_lot_creation_form_details(html: str) -> Dict[str, Any]:
    """
    Разбирает страницу создания лота для node_id, извлекает все поля формы
    и доступные параметры.
    """
    soup = BeautifulSoup(html, "html.parser")
    form = soup.find("form", action=re.compile(r"/lots/(save|offerSave)", re.I)) or soup.find("form")
    details = {
        "form_action": "/lots/offerSave",
        "fields": {},
        "options": {}
    }
    
    if not form:
        return details
        
    details["form_action"] = form.get("action", "/lots/offerSave")
    
    for inp in form.find_all(["input", "select", "textarea"]):
        name = inp.get("name")
        if not name:
            continue
            
        if inp.name == "input" and inp.get("type") == "checkbox":
            if inp.has_attr("checked"):
                details["fields"][name] = inp.get("value", "1")
            continue
            
        val = inp.get("value", "")
        if inp.name == "textarea":
            val = inp.text
            
        details["fields"][name] = val
        
        # Собираем опции для выпадающих списков <select>
        if inp.name == "select":
            details["options"][name] = []
            for opt in inp.find_all("option"):
                opt_val = opt.get("value", "")
                opt_text = opt.text.strip()
                details["options"][name].append({
                    "value": opt_val,
                    "text": opt_text,
                    "selected": opt.has_attr("selected")
                })
                
    return details

def parse_all_categories_list(html: str) -> List[Dict[str, Any]]:
    """
    Парсит главную страницу Funpay и возвращает список всех игр и подкатегорий.
    """
    soup = BeautifulSoup(html, "html.parser")
    promo_game_sections = soup.find_all(class_=re.compile(r"promo-game|game-title", re.I)) or soup.find_all(class_="tc-game")
    categories = []
    
    for section in promo_game_sections:
        # Название игры
        title_el = section.find(["h3", "h4", "a", "span"])
        if not title_el:
            title_el = section
        game_name = title_el.text.strip()
        game_name = re.sub(r'\s+', ' ', game_name)
        
        if not game_name or any(w in game_name.lower() for w in ("описание", "контакты", "чат", "помощь")):
            continue
            
        # Находим ссылку на саму игру
        href = ""
        link_el = section if section.name == "a" else section.find("a")
        if link_el:
            href = link_el.get("href", "")
            
        game_id = None
        game_id_match = re.search(r"/(?:lots|categories|games)/(\d+)/", href)
        if game_id_match:
            game_id = game_id_match.group(1)
            
        subcategories = []
        # Пытаемся найти вложенные подразделы
        sub_list = section.find_next_sibling(class_=re.compile(r"tc-subcategories|promo-subcategories", re.I))
        if sub_list:
            for sub_a in sub_list.find_all("a"):
                sub_href = sub_a.get("href", "")
                sub_id_match = re.search(r"/lots/(\d+)/", sub_href)
                sub_id = sub_id_match.group(1) if sub_id_match else None
                
                if sub_id:
                    sub_name = sub_a.text.strip()
                    subcategories.append({
                        "node_id": sub_id,
                        "name": sub_name,
                        "url": f"https://funpay.com/lots/{sub_id}/"
                    })
                    
        categories.append({
            "game_id": game_id,
            "name": game_name,
            "url": href if href.startswith("http") else f"https://funpay.com{href}",
            "subcategories": subcategories
        })
        
    return categories

def parse_trade_page_for_raising(html: str, node_id: str, default_category_name: str) -> Tuple[Optional[str], Optional[str], str]:
    """
    Парсит страницу раздела (/trade) для получения параметров поднятия:
    game_id, node_id_from_btn, и отформатированного имени категории.
    """
    soup_trade = BeautifulSoup(html, "html.parser")
    btn_raise = soup_trade.find("button", class_=re.compile(r"raise", re.I)) or soup_trade.find(class_=re.compile(r"raise", re.I))
    
    if not btn_raise:
        return None, None, default_category_name
        
    game_id = btn_raise.get("data-game")
    node_id_from_btn = btn_raise.get("data-node") or node_id
    
    category_name = default_category_name
    
    trade_category = ""
    breadcrumb = soup_trade.find(class_="breadcrumb")
    if breadcrumb:
        lis = [li.text.strip() for li in breadcrumb.find_all("li") if li.text.strip()]
        if lis and lis[0].lower() in ("funpay", "фанпей"):
            lis = lis[1:]
        lis = [item for item in lis if not any(w in item.lower() for w in ("ваши предложения", "ваши предложения", "ваши товары", "поднять", "управление", "предложения"))]
        if lis:
            trade_category = " / ".join(lis)
    
    if not trade_category:
        h1 = soup_trade.find("h1")
        if h1:
            h1_text = h1.text.strip()
            if not any(w in h1_text.lower() for w in ("ваши предложения", "ваши товары", "поднять", "управление", "предложения")):
                trade_category = h1_text
                
    if trade_category:
        category_name = trade_category
        
    if not category_name:
        category_name = btn_raise.text.strip().replace("\n", " ") or f"Раздел {node_id}"
        category_name = re.sub(r"\s+", " ", category_name).strip()
        if any(w in category_name.lower() for w in ("поднять", "предложен", "ваши")):
            category_name = f"Раздел {node_id}"
            
    return game_id, node_id_from_btn, category_name

def parse_lot_details_page(html: str, lot_id: str) -> Dict[str, Any]:
    """
    Разбирает страницу редактирования лота (offerEdit или edit) на составляющие её поля,
    значения, цены покупателей и параметры автовыдачи.
    """
    soup = BeautifulSoup(html, "html.parser")
    form = soup.find("form", class_="form-offer-editor") or soup.find("form", action=re.compile(r"/lots/(save|offerSave)", re.I)) or soup.find("form")
    
    if not form:
        logger.error(f"Форма редактирования лота {lot_id} не найдена в парсере.")
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
        
        # Особая обработка для textarea
        if inp.name == "textarea":
            el_type = "textarea"
            val = inp.text
        
        fields[name] = val
        
        # Пропускаем скрытые системные поля и поля, которые не должны редактироваться пользователем
        if el_type == "hidden" or name == "fields[method]":
            continue
        
        # Парсим человекочитаемое имя (label)
        label_text = ""
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
    price_raw = fields.get("price", "0") or "0"
    try:
        price = float(price_raw.replace(",", ".").strip()) if price_raw.strip() else 0.0
    except ValueError:
        price = 0.0
    
    amount_raw = fields.get("amount", "1") or "1"
    try:
        amount = int(amount_raw.strip()) if amount_raw.strip() else 1
    except ValueError:
        amount = 1

    # Находим поля родной автовыдачи
    native_auto_delivery_enabled = False
    native_auto_delivery_text = ""
    supports_native_auto_delivery = any("auto_delivery" in k or "secrets" in k for k in fields.keys())
    
    if "auto_delivery" in fields:
        native_auto_delivery_enabled = fields.get("auto_delivery") == "1"
    
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
