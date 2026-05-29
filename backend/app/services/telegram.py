import logging
import httpx
from typing import Optional
from app.config import settings

logger = logging.getLogger("fanpay.telegram")

class TelegramService:
    @staticmethod
    async def send_message(
        text: str, 
        chat_id: Optional[str] = None, 
        button_text: Optional[str] = None, 
        button_url: Optional[str] = None
    ) -> bool:
        """
        Отправляет текстовое сообщение в Telegram-чат.
        Если chat_id не указан, используется глобальный ADMIN_CHAT_ID.
        Поддерживает встраивание инлайн-кнопок со ссылками для перенаправления в панель управления.
        """
        token = settings.TELEGRAM_BOT_TOKEN
        target_chat_id = chat_id or settings.TELEGRAM_ADMIN_CHAT_ID

        if not token or not target_chat_id:
            logger.warning("Telegram оповещения не настроены: отсутствует токен или chat_id.")
            return False

        url = f"https://api.telegram.org/bot{token}/sendMessage"
        
        payload = {
            "chat_id": target_chat_id,
            "text": text,
            "parse_mode": "HTML"
        }

        # Если переданы параметры для кнопки, формируем InlineKeyboardMarkup
        if button_text and button_url:
            payload["reply_markup"] = {
                "inline_keyboard": [[
                    {
                        "text": button_text,
                        "url": button_url
                    }
                ]]
            }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return True
                else:
                    logger.error(f"Ошибка отправки в Telegram: {res.status_code} - {res.text}")
                    return False
        except Exception as e:
            logger.error(f"Исключение при отправке сообщения в Telegram: {str(e)}")
            return False
