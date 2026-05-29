from typing import Dict, List
from fastapi import WebSocket

class LogBroadcastManager:
    """
    Управляет активными WebSocket-подключениями фронтенда
    для трансляции логов ботов в реальном времени.
    """
    def __init__(self):
        # { account_id: [WebSocket, ...] }
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, account_id: int):
        """Регистрация нового подключения."""
        await websocket.accept()
        if account_id not in self.active_connections:
            self.active_connections[account_id] = []
        self.active_connections[account_id].append(websocket)

    def disconnect(self, websocket: WebSocket, account_id: int):
        """Удаление отключившегося клиента."""
        if account_id in self.active_connections:
            if websocket in self.active_connections[account_id]:
                self.active_connections[account_id].remove(websocket)
            if not self.active_connections[account_id]:
                del self.active_connections[account_id]

    async def broadcast_log(self, account_id: int, level: str, message: str, timestamp: str):
        """Отправка сообщения лога всем подключенным клиентам этого аккаунта."""
        if account_id in self.active_connections:
            payload = {
                "level": level,
                "message": message,
                "timestamp": timestamp
            }
            # Отправляем всем параллельно
            for connection in self.active_connections[account_id]:
                try:
                    await connection.send_json(payload)
                except Exception:
                    # Игнорируем мертвые сокеты, отключение произойдет в событии WebSocketDisconnect
                    pass

# Глобальный синглтон для бродкаста логов
log_broadcast_manager = LogBroadcastManager()
