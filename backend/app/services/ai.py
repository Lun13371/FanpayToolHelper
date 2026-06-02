import logging
import re
from datetime import datetime
from typing import List, Optional, Tuple
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
import litellm

from app.models.ai_key import AIKey
from app.config import settings

logger = logging.getLogger("fanpay.ai")

class AIService:
    @staticmethod
    def parse_and_add_keys(keys_string: str) -> List[str]:
        """
        Разбирает строку с ключами (разделенными запятыми, пробелами или переносами строк)
        и возвращает список чистых ключей.
        """
        # Находим все подстроки, похожие на API ключи (обычно fw_... или аналогичные буквенно-цифровые строки)
        # Для Fireworks AI ключи часто начинаются с fw_
        raw_keys = re.split(r'[\s,\n\r]+', keys_string)
        clean_keys = [k.strip() for k in raw_keys if len(k.strip()) > 10]
        return clean_keys

    @classmethod
    async def import_batch_keys(cls, db: AsyncSession, keys_string: str) -> int:
        """
        Пакетный импорт ключей ИИ в базу данных. Возвращает количество успешно добавленных ключей.
        """
        keys = cls.parse_and_add_keys(keys_string)
        added_count = 0
        
        for val in keys:
            # Проверяем, существует ли уже такой ключ
            query = select(AIKey).where(AIKey.key_value == val)
            res = await db.execute(query)
            existing = res.scalar_one_or_none()
            
            if not existing:
                new_key = AIKey(key_value=val, is_active=True)
                db.add(new_key)
                added_count += 1
                
        if added_count > 0:
            await db.commit()
            
        return added_count

    @staticmethod
    async def get_next_key(db: AsyncSession) -> Optional[AIKey]:
        """
        Выбирает следующий рабочий ключ по алгоритму Round-Robin (наименее используемый по времени).
        """
        # Ищем активный ключ с наименьшим количеством ошибок и самым старым временем использования
        query = (
            select(AIKey)
            .where(AIKey.is_active == True)
            .where(AIKey.error_count < 5) # Ключи с 5 ошибками подряд временно игнорируются
            .order_by(AIKey.last_used_at.asc())
        )
        res = await db.execute(query)
        key = res.scalars().first()
        return key

    @classmethod
    async def mark_key_success(cls, db: AsyncSession, key: AIKey):
        """
        Помечает успешный вызов ключа ИИ: сбрасывает счетчик ошибок и обновляет last_used_at.
        """
        key.total_calls += 1
        key.error_count = 0
        key.last_used_at = datetime.utcnow()
        db.add(key)
        await db.commit()

    @classmethod
    async def mark_key_failure(cls, db: AsyncSession, key: AIKey):
        """
        Фиксирует ошибку при использовании ключа ИИ. Если ошибок >= 5, ключ деактивируется.
        """
        key.error_count += 1
        key.last_used_at = datetime.utcnow()
        if key.error_count >= 5:
            key.is_active = False
            logger.error(f"Ключ ИИ (ID: {key.id}) деактивирован из-за частых ошибок.")
        db.add(key)
        await db.commit()

    @classmethod
    async def log_interaction(
        cls,
        db: AsyncSession,
        key_id: Optional[int],
        model: str,
        action_type: str,
        prompt: str,
        response: Optional[str],
        status: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        error_message: Optional[str] = None,
        account_id: Optional[int] = None
    ):
        """
        Сохраняет запись о взаимодействии с ИИ в базу данных.
        Обрабатывает ошибки локально, чтобы сбой сохранения лога никогда не ломал основную логику.
        """
        try:
            from app.models.ai_log import AILog
            log_entry = AILog(
                key_id=key_id,
                model=model,
                action_type=action_type,
                prompt=prompt,
                response=response,
                status=status,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                error_message=error_message,
                account_id=account_id,
                created_at=datetime.utcnow()
            )
            db.add(log_entry)
            await db.commit()
        except Exception as ex:
            logger.error(f"Ошибка сохранения лога взаимодействия с ИИ: {ex}")

    @classmethod
    async def generate_response(
        cls, 
        db: AsyncSession, 
        system_prompt: str, 
        history: List[Tuple[str, str]], # Список кортежей (отправитель, текст)
        screenshot_base64: Optional[str] = None,
        account_id: Optional[int] = None,
        action_type: str = "chat_reply"
    ) -> str:
        """
        Генерирует ответ ИИ на основе системного промпта, истории переписки и опционального скриншота.
        Реализует отказоустойчивость: пробует разные ключи из базы данных.
        Если все ключи не сработали, бросает исключение для отправки Fallback-шаблона.
        """
        max_attempts = 3
        attempt = 0
        
        # Формируем сообщения для LiteLLM
        messages = [{"role": "system", "content": system_prompt}]
        
        # Переносим историю в сообщения (последние 12 сообщений берутся во внешнем коде, здесь мы их просто упаковываем)
        for sender, text in history:
            role = "user" if sender == "buyer" else "assistant"
            messages.append({"role": role, "content": text})
            
        # Добавляем скриншот, если он передан
        if screenshot_base64:
            # Если есть скриншот, используем Vision-формат для последнего сообщения пользователя
            # Если последнее сообщение истории было от покупателя, мы модифицируем его
            if messages and messages[-1]["role"] == "user":
                last_text = messages[-1]["content"]
                messages[-1]["content"] = [
                    {"type": "text", "text": last_text},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{screenshot_base64}"
                        }
                    }
                ]
            else:
                # Если в истории не было сообщений или последнее было от ассистента, создаем новое
                messages.append({
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Посмотри на этот скриншот."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{screenshot_base64}"
                            }
                        }
                    ]
                })

        # Модели по умолчанию для текстовых запросов (в порядке приоритета)
        # Kimi K2.5 — оптимальный выбор: молниеносно быстрая и невероятно умная модель на вашем ключе!
        text_models = [
            "accounts/fireworks/models/kimi-k2p5",
            "accounts/fireworks/models/gpt-oss-120b",
            "accounts/fireworks/models/deepseek-v4-pro"
        ]
        
        vision_models = [
            "accounts/fireworks/models/qwen2-5-vl-72b-instruct"
        ]
        
        candidate_models = vision_models if screenshot_base64 else text_models

        # Формируем текст промпта для сохранения логов
        prompt_log_text = f"[System Prompt]\n{system_prompt}\n\n[History]\n" + "\n".join([f"{sender}: {text}" for sender, text in history])
        if screenshot_base64:
            prompt_log_text += "\n\n[Attached Screenshot: Yes]"

        while attempt < max_attempts:
            key_obj = await cls.get_next_key(db)
            if not key_obj:
                raise RuntimeError("Нет активных ключей ИИ в базе данных")
                
            # Пробуем кандидат-модели по очереди
            for model in candidate_models:
                try:
                    logger.info(f"Запрос к ИИ (ID ключа: {key_obj.id}) с моделью {model}...")
                    response = await litellm.acompletion(
                        model=model,
                        custom_llm_provider="fireworks_ai",
                        messages=messages,
                        api_key=key_obj.key_value,
                        temperature=0.7,
                        max_tokens=3000,
                        timeout=90.0
                    )
                    
                    # Извлекаем текст ответа
                    reply = response.choices[0].message.content.strip()
                    
                    # Фиксируем успех ключа
                    await cls.mark_success(db, key_obj)
                    
                    # Сохраняем подробный успешный лог взаимодействия
                    usage = getattr(response, 'usage', None)
                    prompt_tokens = usage.prompt_tokens if usage else 0
                    completion_tokens = usage.completion_tokens if usage else 0
                    total_tokens = usage.total_tokens if usage else 0
                    
                    await cls.log_interaction(
                        db=db,
                        key_id=key_obj.id,
                        model=model,
                        action_type=action_type,
                        prompt=prompt_log_text,
                        response=reply,
                        status="success",
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=total_tokens,
                        account_id=account_id
                    )
                    
                    return reply
                    
                except litellm.NotFoundError as e:
                    # Если модель не найдена на этом провайдере/аккаунте, пробуем следующую
                    logger.warning(f"Модель {model} не найдена или не развернута: {str(e)}. Пробуем следующую из списка...")
                    await cls.log_interaction(
                        db=db,
                        key_id=key_obj.id,
                        model=model,
                        action_type=action_type,
                        prompt=prompt_log_text,
                        response=None,
                        status="error",
                        error_message=f"Model NotFoundError: {str(e)}",
                        account_id=account_id
                    )
                    continue
                except Exception as e:
                    # Если другая ошибка (неверный ключ, лимиты), фиксируем сбой ключа и выходим из цикла моделей, чтобы взять другой ключ!
                    logger.warning(f"Сбой вызова ИИ с ключом ID {key_obj.id} для модели {model}: {str(e)}")
                    await cls.log_interaction(
                        db=db,
                        key_id=key_obj.id,
                        model=model,
                        action_type=action_type,
                        prompt=prompt_log_text,
                        response=None,
                        status="error",
                        error_message=str(e),
                        account_id=account_id
                    )
                    break
            else:
                # Если все модели из списка выдали NotFoundError, засчитываем попытку ключа и идем на следующий круг
                attempt += 1
                await cls.mark_failure(db, key_obj)
                continue
                
            # Сюда попадаем, если вышли по break (ошибка ключа, а не модели)
            attempt += 1
            await cls.mark_failure(db, key_obj)
                
        raise RuntimeError("Превышено количество попыток запроса к ИИ. Все выбранные ключи и модели дали сбой.")

    @classmethod
    async def mark_success(cls, db: AsyncSession, key: AIKey):
        await cls.mark_key_success(db, key)

    @classmethod
    async def mark_failure(cls, db: AsyncSession, key: AIKey):
        await cls.mark_key_failure(db, key)

    @classmethod
    async def classify_reviews_batch(
        cls,
        db: AsyncSession,
        reviews: List[dict]
    ) -> List[dict]:
        """
        Использует ИИ (быструю и экономную модель Qwen или Llama) для пакетной классификации отзывов.
        Возвращает список отзывов с добавленныи ключом "tags".
        Если вызов ИИ завершился ошибкой или ключей нет, возвращается исходный список (с тегами по умолчанию).
        """
        if not reviews:
            return []

        # Сначала проверяем, есть ли рабочий ключ в БД
        key_obj = await cls.get_next_key(db)
        if not key_obj:
            # Нет ключей, возвращаем как есть
            return []

        system_prompt = """Ты — профессиональный аналитик отзывов и NLP-классификатор. Твоя задача — проанализировать список отзывов покупателей на FunPay и классифицировать каждый отзыв по тегам.
Используй СТРОГО только следующие теги:
- Положительные теги (радости): "⚡ Быстрая выдача", "🤝 Отличное общение", "💎 Отличное качество", "👍 Рекомендую"
- Отрицательные теги (боли): "⏳ Долгое ожидание", "⚠️ Проблема с товаром", "❌ Игнор / Грубость", "👎 Плохой опыт"

Для каждого отзыва выбери от 1 до 3 подходящих тегов из списка выше на основе семантики текста (даже если есть сарказм, скрытый смысл или сложные речевые обороты).
Верни ответ СТРОГО в формате JSON: массив объектов, где каждый объект содержит "index" (номер отзыва, начиная с 0) и "tags" (список выбранных строк-тегов). Без лишних слов, без Markdown-разметки или backticks, только чистый JSON-массив.
Пример ответа:
[
  {"index": 0, "tags": ["⚡ Быстрая выдача", "💎 Отличное качество"]},
  {"index": 1, "tags": ["⏳ Долгое ожидание", "❌ Игнор / Грубость"]}
]"""

        user_input = ""
        for idx, rev in enumerate(reviews):
            text = rev.get("text", "") or "[без текста]"
            user_input += f"Отзыв #{idx}:\nОценка: {rev.get('rating', 5)} звезд\nТекст: '{text}'\nТовар: '{rev.get('lot_info', '')}'\n\n"

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input}
        ]

        candidate_models = [
            "accounts/fireworks/models/qwen2p5-coder-32b-instruct",
            "accounts/fireworks/models/llama-3-3-70b-instruct",
            "accounts/fireworks/models/kimi-k2p5"
        ]

        max_attempts = 3
        attempt = 0
        reply = None

        while attempt < max_attempts:
            current_key = await cls.get_next_key(db)
            if not current_key:
                break
                
            for model in candidate_models:
                try:
                    response = await litellm.acompletion(
                        model=model,
                        custom_llm_provider="fireworks_ai",
                        messages=messages,
                        api_key=current_key.key_value,
                        temperature=0.1, # Низкая температура для точного следования формату
                        max_tokens=2000,
                        timeout=40.0
                    )
                    reply = response.choices[0].message.content.strip()
                    await cls.mark_success(db, current_key)
                    
                    # Сохраняем подробный успешный лог взаимодействия
                    usage = getattr(response, 'usage', None)
                    prompt_tokens = usage.prompt_tokens if usage else 0
                    completion_tokens = usage.completion_tokens if usage else 0
                    total_tokens = usage.total_tokens if usage else 0
                    
                    await cls.log_interaction(
                        db=db,
                        key_id=current_key.id,
                        model=model,
                        action_type="review_classification",
                        prompt=f"[System Prompt]\n{system_prompt}\n\n[Input]\n{user_input}",
                        response=reply,
                        status="success",
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=total_tokens
                    )
                    break
                except litellm.NotFoundError as e:
                    await cls.log_interaction(
                        db=db,
                        key_id=current_key.id,
                        model=model,
                        action_type="review_classification",
                        prompt=f"[System Prompt]\n{system_prompt}\n\n[Input]\n{user_input}",
                        response=None,
                        status="error",
                        error_message=f"Model NotFoundError: {str(e)}"
                    )
                    continue
                except Exception as e:
                    logger.warning(f"Сбой пакетной классификации отзывов ИИ с ключом ID {current_key.id} для модели {model}: {str(e)}")
                    await cls.log_interaction(
                        db=db,
                        key_id=current_key.id,
                        model=model,
                        action_type="review_classification",
                        prompt=f"[System Prompt]\n{system_prompt}\n\n[Input]\n{user_input}",
                        response=None,
                        status="error",
                        error_message=str(e)
                    )
                    break
            
            if reply:
                break
            
            attempt += 1
            await cls.mark_failure(db, current_key)

        if not reply:
            return []

        # Парсим ответ ИИ
        try:
            # Очищаем от Markdown-блоков, если они вдруг есть
            clean_reply = reply.strip()
            if clean_reply.startswith("```json"):
                clean_reply = clean_reply.replace("```json", "", 1)
            if clean_reply.endswith("```"):
                clean_reply = clean_reply.rsplit("```", 1)[0]
            clean_reply = clean_reply.strip()

            import json
            classified_data = json.loads(clean_reply)
            
            # Сопоставляем обратно в список отзывов
            for item in classified_data:
                idx = item.get("index")
                tags = item.get("tags", [])
                if idx is not None and 0 <= idx < len(reviews):
                    # Валидируем теги, чтобы ИИ не выдумал свои
                    valid_allowed_tags = [
                        "⚡ Быстрая выдача", "🤝 Отличное общение", "💎 Отличное качество", "👍 Рекомендую",
                        "⏳ Долгое ожидание", "⚠️ Проблема с товаром", "❌ Игнор / Грубость", "👎 Плохой опыт"
                    ]
                    filtered_tags = [t for t in tags if t in valid_allowed_tags]
                    if not filtered_tags:
                        # Если пустые или невалидные, дадим по умолчанию
                        rating = reviews[idx].get("rating", 5)
                        filtered_tags = ["👍 Рекомендую"] if rating >= 4 else ["👎 Плохой опыт"]
                    reviews[idx]["tags"] = filtered_tags
            
            return reviews
        except Exception as e:
            logger.error(f"Ошибка разбора JSON ответа ИИ при классификации отзывов: {str(e)}. Ответ ИИ был: {reply}")
            return []
