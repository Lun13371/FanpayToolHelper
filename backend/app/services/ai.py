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
    async def generate_response(
        cls, 
        db: AsyncSession, 
        system_prompt: str, 
        history: List[Tuple[str, str]], # Список кортежей (отправитель, текст)
        screenshot_base64: Optional[str] = None
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

        # Модели по умолчанию
        # Если есть скриншот, берем Qwen-VL от Fireworks, если просто текст - Llama 3 70B Instruct
        model = (
            "fireworks_ai/accounts/fireworks/models/qwen2-5-vl-72b-instruct"
            if screenshot_base64 else
            "fireworks_ai/accounts/fireworks/models/llama-v3p1-70b-instruct"
        )

        while attempt < max_attempts:
            key_obj = await cls.get_next_key(db)
            if not key_obj:
                raise RuntimeError("Нет активных ключей ИИ в базе данных")
                
            try:
                # Настраиваем API ключ для вызова
                # LiteLLM берет ключ из переменной окружения или передается через api_key
                response = await litellm.acompletion(
                    model=model,
                    messages=messages,
                    api_key=key_obj.key_value,
                    temperature=0.7,
                    max_tokens=800,
                    timeout=30.0
                )
                
                # Извлекаем текст ответа
                reply = response.choices[0].message.content.strip()
                
                # Фиксируем успех ключа
                await cls.mark_success(db, key_obj)
                return reply
                
            except Exception as e:
                attempt += 1
                logger.warning(f"Ошибка вызова ИИ с ключом ID {key_obj.id}: {str(e)}")
                await cls.mark_failure(db, key_obj)
                
        raise RuntimeError("Превышено количество попыток запроса к ИИ. Все выбранные ключи дали сбой.")

    @classmethod
    async def mark_success(cls, db: AsyncSession, key: AIKey):
        await cls.mark_key_success(db, key)

    @classmethod
    async def mark_failure(cls, db: AsyncSession, key: AIKey):
        await cls.mark_key_failure(db, key)
