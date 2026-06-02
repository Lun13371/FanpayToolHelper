import logging
from typing import List, Dict, Any, Optional
import httpx
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS

logger = logging.getLogger("fanpay.agents.search")

class AgentSearchService:
    """
    Гибридный сервис веб-поиска для агентов.
    Поддерживает бесплатный поиск через DuckDuckGo и платный через Tavily API.
    """
    @classmethod
    async def search(cls, query: str, api_key: Optional[str] = None, max_results: int = 5) -> List[Dict[str, Any]]:
        """
        Выполняет поиск в вебе. Если передан api_key, использует Tavily. Иначе - DuckDuckGo.
        """
        if api_key:
            try:
                return await cls._search_tavily(query, api_key, max_results)
            except Exception as ex:
                logger.warning(f"Ошибка поиска через Tavily API: {ex}. Переключаемся на DuckDuckGo...")
                
        return await cls._search_ddg(query, max_results)

    @classmethod
    async def _search_tavily(cls, query: str, api_key: str, max_results: int) -> List[Dict[str, Any]]:
        """
        Выполняет поиск через Tavily Search API.
        """
        url = "https://api.tavily.com/search"
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "advanced",
            "max_results": max_results
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=20.0)
            response.raise_for_status()
            data = response.json()
            
            results = []
            for r in data.get("results", []):
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", r.get("snippet", ""))
                })
            return results

    @classmethod
    async def _search_ddg(cls, query: str, max_results: int) -> List[Dict[str, Any]]:
        """
        Выполняет поиск через бесплатный DuckDuckGo.
        Запускается синхронно в блокирующем контексте, так как DDGS синхронный, 
        но оборачивается для async/await совместимости.
        """
        try:
            # Обертка для синхронного DDGS
            import asyncio
            from concurrent.futures import ThreadPoolExecutor
            
            def sync_search():
                with DDGS() as ddgs:
                    return list(ddgs.text(query, max_results=max_results))
                    
            loop = asyncio.get_event_loop()
            with ThreadPoolExecutor() as pool:
                raw_results = await loop.run_in_executor(pool, sync_search)
                
            results = []
            for r in raw_results:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "content": r.get("body", "")
                })
            return results
        except Exception as e:
            logger.error(f"Ошибка поиска через DuckDuckGo: {e}")
            return []

    @classmethod
    async def web_fetch(cls, url: str) -> str:
        """
        Скачивает веб-страницу по URL, извлекает чистый текст, 
        удаляя теги скриптов, стилей и служебной разметки.
        """
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(url, headers=headers, timeout=15.0, follow_redirects=True)
                response.raise_for_status()
                html = response.text
                
            soup = BeautifulSoup(html, "html.parser")
            
            # Удаляем ненужные элементы
            for tag in soup(["script", "style", "noscript", "header", "footer", "nav", "aside", "iframe"]):
                tag.decompose()
                
            # Извлекаем текст
            text = soup.get_text(separator=" ")
            
            # Очищаем лишние пробелы и пустые строки
            clean_lines = []
            for line in text.split("\n"):
                stripped = line.strip()
                if stripped:
                    clean_lines.append(stripped)
                    
            clean_text = " ".join(" ".join(clean_lines).split())
            
            # Ограничиваем длину текста (например, до 12000 символов), чтобы не перегружать контекст LLM
            return clean_text[:12000]
        except Exception as e:
            logger.error(f"Не удалось извлечь содержимое {url}: {e}")
            return f"[Ошибка загрузки страницы: {str(e)}]"
