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

class SemanticMemoryService:
    """
    Сервис семантической памяти.
    Генерирует эмбеддинги через Fireworks AI (модель qwen3-embedding-8b)
    и выполняет векторный поиск в pgvector с резервным Python-алгоритмом.
    """
    
    @classmethod
    async def get_embedding(cls, db: AsyncSession, text: str) -> Optional[List[float]]:
        """
        Генерирует вектор эмбеддинга для переданного текста.
        """
        # Получаем следующий рабочий ключ ИИ из базы данных
        key_obj = await AIService.get_next_key(db)
        if not key_obj:
            logger.error("Нет активных ключей ИИ в базе данных для генерации эмбеддингов.")
            return None
            
        url = "https://api.fireworks.ai/inference/v1/embeddings"
        headers = {
            "Authorization": f"Bearer {key_obj.key_value}",
            "Content-Type": "application/json"
        }
        payload = {
            # Правильный ID для Fireworks embeddings API (без accounts/fireworks/models/ prefix)
            "model": "fireworks/qwen3-embedding-8b",   # $0.10/M, serverless ✅
            "input": text
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers, timeout=20.0)
                
                if response.status_code == 200:
                    await AIService.mark_key_success(db, key_obj)
                    data = response.json()
                    # Модель qwen3-embedding-8b возвращает список флоатов размерности 4096
                    vector = data["data"][0]["embedding"]
                    return vector
                else:
                    logger.warning(f"Ошибка Fireworks API ({response.status_code}): {response.text}")
                    await AIService.mark_key_failure(db, key_obj)
                    return None
        except Exception as e:
            logger.error(f"Исключение при генерации эмбеддинга: {e}")
            await AIService.mark_key_failure(db, key_obj)
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
        
        # Получаем вектор для инсайта
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
        Если СУБД поддерживает pgvector, использует векторный оператор <=>.
        В противном случае (или при сбое) делает вычисление схожести на Python (fallback).
        """
        vector = await cls.get_embedding(db, query_text)
        if not vector or not isinstance(vector, (list, tuple)) or len(vector) == 0:
            logger.warning("Не удалось получить эмбеддинг для поиска. Делаем простой текстовый поиск...")
            stmt = select(AgentInsight).where(AgentInsight.content.like(f"%{query_text}%")).limit(limit)
            res = await db.execute(stmt)
            return list(res.scalars().all())
            
        try:
            # Пытаемся выполнить векторный поиск средствами СУБД
            # Проверяем что embedding не пустой и это список float
            if not isinstance(vector, (list, tuple)) or len(vector) == 0:
                raise ValueError("invalid embedding shape")
            distance_threshold = 1.0 - threshold
            stmt = (
                select(AgentInsight)
                .where(AgentInsight.embedding.is_not(None))   # исключаем NULL embedding
                .where(AgentInsight.embedding.op("<=>")(vector) < distance_threshold)
                .order_by(AgentInsight.embedding.op("<=>")(vector))
                .limit(limit)
            )
            res = await db.execute(stmt)
            return list(res.scalars().all())
            
        except Exception as ex:
            logger.warning(f"Векторный поиск СУБД сбойнул или не поддерживается ({ex}). Переключаемся на Python-вычисления...")
            
            # Fallback: загружаем все инсайты и вычисляем косинусное сходство на Python
            stmt = select(AgentInsight)
            res = await db.execute(stmt)
            all_insights = res.scalars().all()
            
            results_with_scores = []
            for insight in all_insights:
                emb = insight.embedding
                # pgvector возвращает numpy array — нельзя делать bool(array), только is None
                if emb is None:
                    continue
                try:
                    emb_list = list(emb)
                    if not emb_list:
                        continue
                except Exception:
                    continue
                    
                score = cls._cosine_similarity(vector, emb_list)
                if score >= threshold:
                    results_with_scores.append((insight, score))
                    
            # Сортируем по убыванию сходства
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
        norm_v1 = math.sqrt(sum(x * x for x in v1))
        norm_v2 = math.sqrt(sum(x * x for x in v2))
        
        if norm_v1 == 0.0 or norm_v2 == 0.0:
            return 0.0
            
        return dot_product / (norm_v1 * norm_v2)
