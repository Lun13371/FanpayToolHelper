import re
import logging
from datetime import datetime, timedelta
from typing import List, Tuple, Dict, Any
from bs4 import BeautifulSoup

logger = logging.getLogger("fanpay.parser")

def parse_funpay_datetime(date_text: str) -> Tuple[str, int]:
    """
    Parses Funpay date-time string and returns a tuple (date "DD.MM", hour 0-23).
    """
    date_text = date_text.lower().strip()
    now_dt = datetime.now()
    
    # Extract hour and minute if present (HH:MM)
    hour_val = 12  # default
    time_match = re.search(r"(\d{2}):(\d{2})", date_text)
    if time_match:
        hour_val = int(time_match.group(1))
        
    if "сегодня" in date_text:
        return now_dt.strftime("%d.%m"), hour_val
    if "вчера" in date_text:
        yesterday_dt = now_dt - timedelta(days=1)
        return yesterday_dt.strftime("%d.%m"), hour_val
        
    months = {
        "янв": "01", "фев": "02", "мар": "03", "апр": "04", "май": "05", "мая": "05",
        "июн": "06", "июл": "07", "авг": "08", "сен": "09", "окт": "10", "ноя": "11", "дек": "12"
    }
    m = re.search(r"(\d+)\s+([а-яё]+)", date_text)
    if m:
        day_str = f"{int(m.group(1)):02d}"
        month_name = m.group(2)[:3]
        month_str = months.get(month_name, "01")
        return f"{day_str}.{month_str}", hour_val
        
    return now_dt.strftime("%d.%m"), hour_val


def parse_dt_local(date_text: str) -> str:
    """
    Parses a simplified Funpay date string and returns the date ("DD.MM").
    """
    date_text = date_text.lower().strip()
    now_dt = datetime.now()
    if "сегодня" in date_text:
        return now_dt.strftime("%d.%m")
    if "вчера" in date_text:
        return (now_dt - timedelta(days=1)).strftime("%d.%m")
    m = re.search(r"(\d+)\s+([а-яё]+)", date_text)
    if m:
        months = {
            "янв": "01", "фев": "02", "мар": "03", "апр": "04", "май": "05", "мая": "05",
            "июн": "06", "июл": "07", "авг": "08", "сен": "09", "окт": "10", "ноя": "11", "дек": "12"
        }
        return f"{int(m.group(1)):02d}.{months.get(m.group(2)[:3], '01')}"
    return now_dt.strftime("%d.%m")


def parse_trade_orders(html: str) -> List[Dict[str, Any]]:
    """
    Parses Funpay orders page (/orders/trade) and extracts orders details.
    """
    soup = BeautifulSoup(html, "html.parser")
    order_rows = soup.find_all("a", class_="tc-item")
    completed_orders = []

    for row in order_rows:
        classname = row.get("class", [])
        
        is_completed = "warning" not in classname and "info" not in classname
        is_refunded = "warning" in classname
        is_pending = "info" in classname

        status_div = row.find(class_="tc-status")
        if status_div:
            status_text = status_div.text.strip()
        else:
            if is_refunded:
                status_text = "Возвращен"
            elif is_pending:
                status_text = "Оплачен"
            else:
                status_text = "Закрыт"

        # Order price
        price_div = row.find(class_="tc-price")
        price_text = price_div.text.strip() if price_div else "0"
        price_val = float(re.sub(r'[^\d.]', '', price_text.replace(",", ".")) or 0)

        # Order ID
        id_div = row.find(class_="tc-order")
        order_id = id_div.text.strip() if id_div else "Unknown"

        # Lot Name
        order_desc_div = row.find(class_="order-desc")
        if order_desc_div:
            desc_inner = order_desc_div.find("div")
            lot_name = desc_inner.text.strip() if desc_inner else order_desc_div.text.strip()
        else:
            title_div = row.find(class_="tc-desc-text") or row.find(class_="tc-desc") or row.find(class_="tc-title")
            lot_name = title_div.text.strip() if title_div else "Неизвестный лот"
        lot_name = re.sub(r'\s+', ' ', lot_name)

        # Buyer Name
        buyer_div = row.find(class_="tc-user")
        buyer_name = buyer_div.text.strip() if buyer_div else "Покупатель"

        # Order Date
        date_div = row.find(class_="tc-date") or row.find(class_="tc-date-time")
        raw_date = date_div.text.strip() if date_div else ""
        formatted_date, hour_val = parse_funpay_datetime(raw_date)

        completed_orders.append({
            "order_id": order_id,
            "lot_name": lot_name,
            "buyer_name": buyer_name,
            "price": price_val,
            "date": formatted_date,
            "hour": hour_val,
            "is_completed": is_completed,
            "is_refunded": is_refunded,
            "is_pending": is_pending,
            "status": status_text
        })

    return completed_orders


def parse_profile_reviews(html: str) -> List[Dict[str, Any]]:
    """
    Parses Funpay profile page and extracts client reviews.
    """
    soup = BeautifulSoup(html, "html.parser")
    review_elements = soup.find_all(class_="review-item")
    recent_reviews = []

    for item in review_elements:
        # 1. Rating
        rating_val = 5
        star_el = item.find(class_=re.compile(r"rating[1-5]", re.I))
        if star_el:
            for cls in star_el.get("class", []):
                m = re.match(r"^rating([1-5])$", cls, re.IGNORECASE)
                if m:
                    rating_val = int(m.group(1))
                    break
        
        # 2. Review text
        text_div = item.find(class_="review-item-text") or item.find(class_="review-item-detail")
        text = text_div.text.strip() if text_div else ""
        
        # 3. Buyer Name
        user_div = item.find(class_="review-item-user") or item.find(class_="review-item-author") or item.find("a")
        buyer = user_div.text.strip() if user_div else "Покупатель"
        
        # 4. Lot info
        item_div = item.find(class_="review-item-lot") or item.find(class_="text-muted")
        lot_info = ""
        if item_div:
            lot_info = item_div.text.strip()
            lot_info = re.sub(r'\s+', ' ', lot_info)
            
        # 5. Review Date
        date_div = item.find(class_="review-item-date") or item.find(class_="text-muted")
        date_str = date_div.text.strip() if date_div else ""
        
        recent_reviews.append({
            "rating": rating_val,
            "text": text,
            "buyer": buyer,
            "lot_info": lot_info,
            "date": date_str
        })

    return recent_reviews
