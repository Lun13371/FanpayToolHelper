from typing import Dict, List
from fastapi import WebSocket

class ChatBroadcastManager:
    """
    Управляет активными WebSocket-подключениями фронтенда
    для трансляции новых сообщений в чатах в реальном времени.
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

    async def broadcast_chat_update(self, account_id: int, update_type: str, data: dict):
        """Отправляет событие чата всем подключенным вкладкам аккаунта."""
        if account_id in self.active_connections:
            payload = {
                "type": update_type,  # e.g., "new_message", "chat_update"
                "data": data
            }
            for connection in self.active_connections[account_id]:
                try:
                    await connection.send_json(payload)
                except Exception:
                    pass

# Глобальный синглтон трансляции чата
chat_broadcast_manager = ChatBroadcastManager()
