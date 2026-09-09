import asyncio
import logging
import math
from typing import List, Optional, Any
import httpx
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agents import AgentInsight
from app.models.ai_key import AIKey
from app.services.ai import AIService

logger = logging.getLogger("fanpay.agents.memory")

# Глобальный семафор — не более 2 одновременных запросов к embeddings API гейтвея
# Предотвращает 429 при параллельных воркерах
_EMBEDDING_SEMAPHORE = asyncio.Semaphore(2)


class SemanticMemoryService:
    """
    Сервис семантической памяти.
    Генерирует эмбеддинги через Syntee Gateway (модель из настроек, вкладка «Syntee Gateway»)
    и выполняет векторный поиск в pgvector с резервным Python-алгоритмом.
    """

    @classmethod
    async def get_embedding(cls, db: AsyncSession, text: str) -> Optional[List[float]]:
        """
        Генерирует вектор эмбеддинга для переданного текста через Syntee Gateway.
        Использует семафор для ограничения параллельных запросов (предотвращение 429).
        """
        from app.services import llm_client

        key_obj = await AIService.get_next_key(db)
        if not key_obj:
            logger.error("Нет активных ключей ИИ в базе данных для генерации эмбеддингов.")
            return None

        cfg = await llm_client.get_ai_settings(db)
        model = await llm_client.resolve_embedding_model(db)
        if not model:
            logger.error(
                "Не задана модель эмбеддингов — настройте её во вкладке «Syntee Gateway» "
                "(или убедитесь, что на гейтвее есть группа с embedding-моделью)."
            )
            return None

        url = cfg.gateway_url.rstrip("/") + "/embeddings"
        headers = {
            "Authorization": f"Bearer {key_obj.key_value}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "input": text
        }

        async with _EMBEDDING_SEMAPHORE:
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(url, json=payload, headers=headers, timeout=20.0)

                    if response.status_code == 200:
                        await AIService.mark_key_success(db, key_obj)
                        data = response.json()
                        vector = data["data"][0]["embedding"]
                        # Колонка pgvector имеет фиксированную размерность 4096.
                        # Если гейтвей вернул другую размерность — не сохраняем вектор
                        # (инсайт будет записан без embedding, поиск деградирует до текстового).
                        if len(vector) != 4096:
                            logger.warning(
                                f"Гейтвей вернул эмбеддинг размерности {len(vector)} "
                                f"(колонка рассчитана на 4096) — пропускаю сохранение вектора. "
                                f"Выберите другую embedding-модель во вкладке «Syntee Gateway»."
                            )
                            return None
                        return vector
                    elif response.status_code == 429:
                        # Rate limit — НЕ считаем как ошибку ключа, просто логируем
                        logger.warning(f"Ошибка гейтвея (429): {response.text}")
                        # Не вызываем mark_key_failure — rate limit не деактивирует ключ
                        # Небольшая задержка перед следующим запросом
                        await asyncio.sleep(1.0)
                        return None
                    else:
                        logger.warning(f"Ошибка гейтвея ({response.status_code}): {response.text}")
                        # Создаём exception-подобный объект для корректной классификации
                        class _EmbedError(Exception):
                            pass
                        await AIService.mark_key_failure(db, key_obj, error=_EmbedError(f"{response.status_code} {response.text}"))
                        return None
            except Exception as e:
                logger.error(f"Исключение при генерации эмбеддинга: {e}")
                await AIService.mark_key_failure(db, key_obj, error=e)
                return None

    @classmethod
    async def save_insight(
        cls,
        db: AsyncSession,
        run_id: int,
        game_name: str,
        subcategory_name: str,
        insight_type: str,
        content: str
    ) -> Optional[AgentInsight]:
        """
        Генерирует эмбеддинг для текста инсайта и сохраняет его в семантическую память.
        """
        logger.info(f"Сохранение инсайта семантической памяти для {game_name} -> {subcategory_name}...")

        embedding = await cls.get_embedding(db, content)

        insight = AgentInsight(
            run_id=run_id,
            game_name=game_name,
            subcategory_name=subcategory_name,
            insight_type=insight_type,
            content=content,
            embedding=embedding
        )

        db.add(insight)
        await db.commit()
        await db.refresh(insight)
        return insight

    @classmethod
    async def search_similar_insights(
        cls,
        db: AsyncSession,
        query_text: str,
        limit: int = 5,
        threshold: float = 0.35
    ) -> List[AgentInsight]:
        """
        Ищет похожие инсайты в базе данных.
        Сначала пробует pgvector SQL (с cast), при сбое — Python cosine similarity.
        """
        vector = await cls.get_embedding(db, query_text)
        if not vector or not isinstance(vector, (list, tuple)) or len(vector) == 0:
            logger.warning("Не удалось получить эмбеддинг для поиска. Делаем простой текстовый поиск...")
            stmt = select(AgentInsight).where(AgentInsight.content.like(f"%{query_text}%")).limit(limit)
            res = await db.execute(stmt)
            return list(res.scalars().all())

        # Пробуем pgvector SQL — нужен cast через sqlalchemy
        try:
            from sqlalchemy import cast, text as sa_text
            from pgvector.sqlalchemy import Vector

            distance_threshold = 1.0 - threshold
            vector_cast = cast(vector, Vector(len(vector)))
            stmt = (
                select(AgentInsight)
                .where(AgentInsight.embedding.is_not(None))
                .where(AgentInsight.embedding.op("<=>")(vector_cast) < distance_threshold)
                .order_by(AgentInsight.embedding.op("<=>")(vector_cast))
                .limit(limit)
            )
            res = await db.execute(stmt)
            return list(res.scalars().all())

        except Exception as ex:
            logger.warning(f"Векторный поиск СУБД сбойнул ({type(ex).__name__}: {ex}). Переключаемся на Python-вычисления...")

            # Fallback: загружаем все инсайты с непустым embedding
            stmt = select(AgentInsight).where(AgentInsight.embedding.is_not(None))
            res = await db.execute(stmt)
            all_insights = list(res.scalars().all())

            results_with_scores = []
            for insight in all_insights:
                emb = insight.embedding
                if emb is None:
                    continue
                try:
                    emb_list = list(emb)
                    if not emb_list or len(emb_list) < 2:
                        continue
                except Exception:
                    continue

                score = cls._cosine_similarity(vector, emb_list)
                if score >= threshold:
                    results_with_scores.append((insight, score))

            results_with_scores.sort(key=lambda x: x[1], reverse=True)
            return [item[0] for item in results_with_scores[:limit]]

    @staticmethod
    def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
        """
        Вычисляет косинусное сходство двух векторов.
        """
        if len(v1) != len(v2):
            return 0.0

        dot_product = sum(x * y for x, y in zip(v1, v2))
        norm1 = math.sqrt(sum(x * x for x in v1))
        norm2 = math.sqrt(sum(x * x for x in v2))

        if norm1 == 0.0 or norm2 == 0.0:
            return 0.0

        return dot_product / (norm1 * norm2)
