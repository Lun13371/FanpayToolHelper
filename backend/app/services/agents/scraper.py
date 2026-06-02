import logging
import re
from typing import List, Dict, Any, Optional
import httpx

from app.services.fanpay_client import FanpayClient
from app.services.fanpay.parsers import parse_category_offers_list

logger = logging.getLogger("fanpay.agents.scraper")

class AgentScraperService:
    """
    Сервис парсинга объявлений из категорий FunPay.
    Парсит категорию анонимно (для безопасности), 
    а при блокировке/ошибке автоматически делает fallback на авторизованный аккаунт.
    """
    
    @classmethod
    async def scrape_category_offers(
        cls, 
        node_id: str, 
        category_type: str = "lots", 
        client: Optional[FanpayClient] = None
    ) -> List[Dict[str, Any]]:
        """
        Скачивает страницу предложений категории (lots или chips) и парсит ее.
        """
        # Ссылка на страницу категории
        url = f"https://funpay.com/{category_type}/{node_id}/"
        logger.info(f"Запуск сбора предложений для категории {node_id} ({category_type}) по адресу: {url}...")
        
        # 1. Попытка анонимного парсинга
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
        }
        
        # Если у аккаунта-клиента есть прокси, попробуем использовать его и для анонимного запроса
        proxy_url = client.proxy_url if client else None
        
        try:
            async with httpx.AsyncClient(proxy=proxy_url, headers=headers, follow_redirects=True, timeout=15.0) as async_client:
                response = await async_client.get(url)
                
                if response.status_code == 200 and "tc-item" in response.text:
                    offers = parse_category_offers_list(response.text)
                    if offers:
                        logger.info(f"Анонимный парсинг категории {node_id} успешен. Спарсено {len(offers)} предложений.")
                        return offers
                
                # Если страница содержит признаки блокировки или пустая
                logger.warning(f"Анонимный парсинг вернул пустой результат или статус {response.status_code}. Пробуем авторизованный fallback...")
        except Exception as e:
            logger.warning(f"Ошибка анонимного парсинга категории {node_id}: {e}. Пробуем авторизованный fallback...")
            
        # 2. Авторизованный fallback (через сессию FanpayClient)
        if not client:
            logger.warning(f"Авторизованный клиент не передан. Сбор предложений для {node_id} невозможен.")
            return []
            
        try:
            # Запрашиваем страницу через сессию авторизованного клиента
            # Метод client._get_client() возвращает контекстный менеджер PersistentClientWrapper
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
