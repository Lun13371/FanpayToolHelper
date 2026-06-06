import logging
import re
from typing import List, Dict, Any, Optional, Tuple
import httpx

from app.services.fanpay_client import FanpayClient
from app.services.fanpay.parsers import parse_category_offers_list

logger = logging.getLogger("fanpay.agents.scraper")

# Ключевые слова для автоматического определения типа лота по subcategory_name / описаниям
_DIGITAL_KEYWORDS = [
    "гайд", "guide", "инструкция", "чеклист", "checklist", "схема", "таблица",
    "файл", "pdf", "видео", "video", "скрипт", "macro", "макрос", "шаблон",
    "template", "build", "билд", "tier list", "тир лист", "стратегия", "strategy",
    "обучение", "tutorial", "курс", "course", "советы", "tips",
]
_SERVICE_KEYWORDS = [
    "услуга", "помощь", "service", "помогу", "прокачка", "буст", "boost",
    "выполню", "квест", "quest", "задание", "ачивка", "achievement", "консультация",
    "сопровождение", "coaching", "тренировка", "обучу", "научу",
]
_RESELL_KEYWORDS = [
    "ключ", "key", "код", "code", "карта", "card", "пополнение", "recharge",
    "подписка", "subscription", "пин", "pin", "gift card", "подарочная",
]


class AgentScraperService:
    """
    Сервис парсинга объявлений из категорий FunPay.

    Умеет:
    1. Парсить лоты любой категории (lots/chips)
    2. Определять потенциальный тип лота (classic/digital/resell/service) по тексту
    3. Находить самого дешёвого поставщика в категории для оценки маржи перепродажи
    """

    @classmethod
    async def scrape_category_offers(
        cls,
        node_id: str,
        category_type: str = "lots",
        client: Optional[FanpayClient] = None,
    ) -> List[Dict[str, Any]]:
        """
        Скачивает страницу предложений категории (lots или chips) и парсит её.
        """
        url = f"https://funpay.com/{category_type}/{node_id}/"
        logger.info(f"Запуск сбора предложений для категории {node_id} ({category_type}) по адресу: {url}...")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        }
        proxy_url = client.proxy_url if client else None

        # 1. Анонимный парсинг
        try:
            async with httpx.AsyncClient(proxy=proxy_url, headers=headers, follow_redirects=True, timeout=15.0) as ac:
                response = await ac.get(url)
                if response.status_code == 200 and "tc-item" in response.text:
                    offers = parse_category_offers_list(response.text)
                    if offers:
                        logger.info(f"Анонимный парсинг категории {node_id} успешен. Спарсено {len(offers)} предложений.")
                        return offers
                logger.warning(f"Анонимный парсинг вернул пустой результат или статус {response.status_code}. Пробуем авторизованный fallback...")
        except Exception as e:
            logger.warning(f"Ошибка анонимного парсинга категории {node_id}: {e}. Пробуем авторизованный fallback...")

        # 2. Авторизованный fallback
        if not client:
            logger.warning(f"Авторизованный клиент не передан. Сбор предложений для {node_id} невозможен.")
            return []

        try:
            async with client._get_client() as active_http_client:
                response = await active_http_client.get(url)
            if response.status_code == 200:
                offers = parse_category_offers_list(response.text)
                logger.info(f"Авторизованный парсинг категории {node_id} успешен. Спарсено {len(offers)} предложений.")
                return offers
            else:
                logger.error(f"Авторизованный запрос к категории {node_id} завершился со статусом {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Критическая ошибка авторизованного сбора категории {node_id}: {e}")
            return []

    @classmethod
    def classify_lot_type(cls, subcategory_name: str, offers_sample: List[Dict[str, Any]]) -> str:
        """
        Определяет потенциальный тип лота по названию подкатегории и образцу офферов.

        Возвращает: "digital" | "resell" | "service" | "classic"

        Логика:
        - digital  — если в заголовках много упоминаний файлов/гайдов
        - resell   — если много ключей/кодов/карт активации (легко перекупить)
        - service  — если буст/услуги без передачи ресурсов
        - classic  — всё остальное (валюта, ресурсы, аккаунты)
        """
        sub_lower = subcategory_name.lower()
        all_text = sub_lower + " " + " ".join(
            (o.get("description", "") + " " + o.get("title", "")).lower()
            for o in offers_sample[:20]
        )

        digital_score = sum(1 for kw in _DIGITAL_KEYWORDS if kw in all_text)
        service_score = sum(1 for kw in _SERVICE_KEYWORDS if kw in all_text)
        resell_score  = sum(1 for kw in _RESELL_KEYWORDS  if kw in all_text)

        # Порог: >2 совпадений = этот тип
        scores = {"digital": digital_score, "service": service_score, "resell": resell_score}
        best = max(scores, key=scores.get)
        if scores[best] >= 2:
            return best
        return "classic"

    @classmethod
    def find_cheapest_supplier(
        cls,
        offers: List[Dict[str, Any]],
        exclude_user: Optional[str] = None,
        top_n: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Находит топ-N самых дешёвых продавцов в категории.
        Используется ResellScout для оценки маржи перепродажи.

        exclude_user — имя аккаунта самого пользователя (чтобы не считать себя поставщиком).
        """
        valid = [
            o for o in offers
            if float(o.get("price", 0)) > 0
            and (not exclude_user or o.get("user", "") != exclude_user)
        ]
        valid.sort(key=lambda o: float(o.get("price", 0)))
        return valid[:top_n]

    @classmethod
    def calc_resell_margin(
        cls,
        buy_price: float,
        sell_price: float,
        funpay_commission: float = 0.07,
    ) -> float:
        """
        Считает маржу перепродажи в процентах.
        sell_price * (1 - commission) - buy_price
        """
        net_sell = sell_price * (1 - funpay_commission)
        if buy_price <= 0:
            return 0.0
        return round((net_sell - buy_price) / buy_price * 100, 1)

    @classmethod
    async def scrape_all_category_types(
        cls,
        node_id: str,
        client: Optional[FanpayClient] = None,
    ) -> Tuple[List[Dict[str, Any]], str]:
        """
        Пробует спарсить категорию сначала как 'lots', потом как 'chips'.
        Возвращает (offers, category_type_used).
        Нужно для поддержки всех типов категорий FunPay без заранее заданного типа.
        """
        for ctype in ("lots", "chips"):
            offers = await cls.scrape_category_offers(node_id, ctype, client)
            if offers:
                return offers, ctype
        return [], "lots"
