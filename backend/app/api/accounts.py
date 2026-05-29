from typing import Any, List, Optional, Dict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.api.deps import get_current_user, get_current_owner_or_admin
from app.models.user import User, UserRole
from app.models.account import FanpayAccount
from app.models.permission import ManagerPermission
from app.services.scheduler import scheduler_manager
from app.services.fanpay_client import FanpayClient

router = APIRouter(prefix="/accounts", tags=["Аккаунты Fanpay"])

# Схемы Pydantic
class AccountCreate(BaseModel):
    name: str = Field(..., description="Название для удобства")
    golden_key: str = Field(..., description="Токен golden_key с Funpay")
    proxy_url: Optional[str] = Field(default="", description="Прокси SOCKS5/HTTP")
    telegram_chat_id: Optional[str] = None
    system_prompt: Optional[str] = None
    fallback_template: Optional[str] = None

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    golden_key: Optional[str] = None
    proxy_url: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    system_prompt: Optional[str] = None
    fallback_template: Optional[str] = None

class AccountResponse(BaseModel):
    id: int
    user_id: int
    name: str
    is_active: bool
    last_status: str
    telegram_chat_id: Optional[str]
    system_prompt: str
    fallback_template: str
    created_at: datetime
    
    # Статистика аккаунта с Funpay
    funpay_user_id: Optional[str] = None
    balance: float = 0.0
    rating: float = 0.0
    reviews_count: int = 0
    last_raised: Optional[datetime] = None
    
    # Время последней полной синхронизации и кэш лотов
    last_synced: Optional[datetime] = None
    lots_cache: Optional[List[Dict[str, Any]]] = None
    
    # Скрываем golden_key и proxy_url от менеджеров
    golden_key: Optional[str] = None
    proxy_url: Optional[str] = None

    class Config:
        from_attributes = True


async def check_manager_permission(db: AsyncSession, manager_id: int, account_id: int) -> bool:
    """Вспомогательная функция для проверки прав менеджера на аккаунт."""
    query = select(ManagerPermission).where(
        ManagerPermission.manager_id == manager_id,
        ManagerPermission.account_id == account_id
    )
    res = await db.execute(query)
    return res.scalar_one_or_none() is not None


async def verify_account_access(db: AsyncSession, user: User, account_id: int):
    """Вспомогательный метод для проверки доступа пользователя к аккаунту."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт Fanpay не найден")
        
    if user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, user.id, account_id):
            raise HTTPException(status_code=403, detail="Менеджер не имеет доступа к этому аккаунту")
    elif user.role == UserRole.OWNER:
        if account.user_id != user.id:
            raise HTTPException(status_code=403, detail="Владелец не имеет доступа к чужому аккаунту")


@router.get("", response_model=List[AccountResponse])
async def list_accounts(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получение списка аккаунтов, доступных текущему пользователю."""
    if current_user.role == UserRole.ADMIN:
        query = select(FanpayAccount)
    elif current_user.role == UserRole.OWNER:
        # Владелец видит свои аккаунты
        query = select(FanpayAccount).where(FanpayAccount.user_id == current_user.id)
    else: # MANAGER
        # Менеджер видит только аккаунты, к которым владелец дал доступ
        query = select(FanpayAccount).join(
            ManagerPermission,
            ManagerPermission.account_id == FanpayAccount.id
        ).where(ManagerPermission.manager_id == current_user.id)

    res = await db.execute(query)
    accounts = res.scalars().all()

    # Фильтруем чувствительные данные для менеджеров
    response_list = []
    for acc in accounts:
        resp = AccountResponse.from_orm(acc)
        if current_user.role != UserRole.MANAGER:
            # Администраторы и владельцы видят токен и прокси
            resp.golden_key = acc.golden_key
            resp.proxy_url = acc.proxy_url
        response_list.append(resp)

    return response_list


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    data: AccountCreate,
    db: AsyncSession = Depends(get_session),
    owner: User = Depends(get_current_owner_or_admin)
) -> Any:
    """Добавление нового аккаунта Funpay (Для Владельцев/Админа)."""
    from app.config import settings
    # Strict proxy check, except in dev environment
    if not data.proxy_url and settings.ENVIRONMENT != "dev":
        raise HTTPException(status_code=400, detail="Прокси SOCKS5/HTTP строго обязателен для каждого аккаунта в продакшене ради безопасности!")

    new_account = FanpayAccount(
        user_id=owner.id,
        name=data.name,
        golden_key=data.golden_key,
        proxy_url=data.proxy_url,
        is_active=False,
        telegram_chat_id=data.telegram_chat_id,
        system_prompt=data.system_prompt or "Ты вежливый менеджер магазина. Отвечай кратко и помогай клиенту.",
        fallback_template=data.fallback_template or "В данный момент линия поддержки перегружена. Оператор ответит вам в течение нескольких минут.",
        last_status="Not Verified"
    )
    db.add(new_account)
    await db.commit()
    await db.refresh(new_account)

    resp = AccountResponse.from_orm(new_account)
    resp.golden_key = new_account.golden_key
    resp.proxy_url = new_account.proxy_url
    return resp


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: int,
    data: AccountUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Редактирование параметров аккаунта."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Менеджеры не имеют права редактировать ключевые параметры
    if current_user.role == UserRole.MANAGER:
        # Проверяем доступ к логу
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
        
        # Менеджер может редактировать только промпты
        if data.golden_key or data.proxy_url or data.name:
            raise HTTPException(status_code=403, detail="Менеджеры не могут редактировать токены, прокси или имя аккаунта")
    else:
        # Владельцы могут редактировать только свои
        if current_user.role == UserRole.OWNER and account.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Доступ запрещен к чужому аккаунту")

    # Обновляем поля
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(account, key, value)

    db.add(account)
    await db.commit()
    await db.refresh(account)

    resp = AccountResponse.from_orm(account)
    if current_user.role != UserRole.MANAGER:
        resp.golden_key = account.golden_key
        resp.proxy_url = account.proxy_url
    return resp


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_account(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    owner: User = Depends(get_current_owner_or_admin)
) -> Any:
    """Удаление аккаунта Funpay (Для Владельца/Админа)."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    if owner.role == UserRole.OWNER and account.user_id != owner.id:
        raise HTTPException(status_code=403, detail="У вас нет прав на удаление этого аккаунта")

    # Останавливаем планировщик для этого аккаунта
    scheduler_manager.unregister_account_jobs(account_id)

    await db.delete(account)
    await db.commit()
    return None


@router.post("/{account_id}/verify")
async def verify_account(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Запускает Camoufox в фоне, проверяет golden_key и прокси, 
    извлекает куки и User-Agent, и обновляет сессию в БД.
    """
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role == UserRole.OWNER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    async def progress_callback(status_text: str):
        account.last_status = status_text
        db.add(account)
        await db.commit()

    # Запускаем асинхронную проверку сессии через FanpayClient
    await progress_callback("Verifying: Configuring proxy connection... (10%)")

    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies
    )

    # Определяем внешний IP и Гео через текущее подключение
    await progress_callback("Verifying: Checking connection IP & Geo... (30%)")
    ip, geo = await client.get_connection_ip_and_geo()
    if ip:
        account.ip_address = ip
        account.geo_location = geo
        await progress_callback(f"Verifying: Connected via {ip} ({geo or 'Unknown'}) (45%)")
    else:
        account.ip_address = "Direct/Unknown"
        account.geo_location = "Unknown"
        await progress_callback("Verifying: Connected via direct IP (45%)")

    await progress_callback("Verifying: Extracting session info... (70%)")
    success, username, cookies = await client.verify_session()

    if success:
        account.cookies = cookies
        account.user_agent = client.user_agent
        account.last_status = f"Active ({username})"
        account.name = f"{account.name} ({username})" if username not in account.name else account.name
        db.add(account)
        await db.commit()
        return {"success": True, "message": f"Аккаунт {username} успешно верифицирован!", "status": account.last_status}
    else:
        account.last_status = "Verification Failed"
        db.add(account)
        await db.commit()
        raise HTTPException(status_code=400, detail=f"Ошибка верификации: {username}")


@router.post("/{account_id}/toggle")
async def toggle_account(
    account_id: int,
    active: bool,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Включение/выключение бота и фоновых задач для выбранного аккаунта."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role == UserRole.OWNER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    if active and (not account.cookies or account.last_status == "Verification Failed"):
         raise HTTPException(status_code=400, detail="Сначала необходимо верифицировать сессию аккаунта (/verify)")

    account.is_active = active
    account.last_status = "Running" if active else "Stopped"
    db.add(account)
    await db.commit()

    # Синхронизируем с планировщиком задач в реальном времени!
    if active:
        scheduler_manager.register_account_jobs(account_id)
    else:
        scheduler_manager.unregister_account_jobs(account_id)

    return {"success": True, "is_active": active, "status": account.last_status}


# =========================================================================
# УПРАВЛЕНИЕ ДОСТУПОМ МЕНЕДЖЕРОВ К АККАУНТУ (Для Владельца)
# =========================================================================

class PermissionGrant(BaseModel):
    manager_id: int
    account_id: int

@router.post("/permissions", status_code=status.HTTP_201_CREATED)
async def grant_permission(
    data: PermissionGrant,
    db: AsyncSession = Depends(get_session),
    owner: User = Depends(get_current_owner_or_admin)
) -> Any:
    """Выдача доступа менеджеру к выбранному аккаунту (Для Владельцев)."""
    # Убеждаемся, что аккаунт принадлежит текущему владельцу
    account = await db.get(FanpayAccount, data.account_id)
    if not account or (owner.role == UserRole.OWNER and account.user_id != owner.id):
         raise HTTPException(status_code=403, detail="Доступ к аккаунту запрещен")

    # Убеждаемся, что менеджер принадлежит текущему владельцу
    manager = await db.get(User, data.manager_id)
    if not manager or manager.role != UserRole.MANAGER or (owner.role == UserRole.OWNER and manager.parent_id != owner.id):
        raise HTTPException(status_code=404, detail="Менеджер не найден в вашей организации")

    # Создаем запись
    query = select(ManagerPermission).where(
        ManagerPermission.manager_id == data.manager_id,
        ManagerPermission.account_id == data.account_id
    )
    res = await db.execute(query)
    if res.scalar_one_or_none():
         return {"success": True, "message": "Доступ уже предоставлен"}

    new_perm = ManagerPermission(manager_id=data.manager_id, account_id=data.account_id)
    db.add(new_perm)
    await db.commit()
    return {"success": True, "message": "Доступ успешно предоставлен менеджеру"}


# =========================================================================
# РОУТЫ УПРАВЛЕНИЯ FUNPAY МЕНЕДЖЕРОМ
# =========================================================================

class LotPriceUpdate(BaseModel):
    lot_id: str
    price: float

class NativeDeliveryResponse(BaseModel):
    lot_id: str
    price: float
    amount: int
    native_auto_delivery_enabled: bool
    native_auto_delivery_text: str

class NativeDeliveryUpdate(BaseModel):
    price: Optional[float] = None
    native_auto_delivery_enabled: Optional[bool] = None
    native_auto_delivery_text: Optional[str] = None


@router.post("/{account_id}/sync-full", response_model=AccountResponse)
async def sync_account_full(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Выполняет полную ручную синхронизацию профиля (баланс, отзывы) и лотов с Funpay, сохраняя кэш в БД."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role == UserRole.OWNER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    if not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию")

    # Запускаем FanpayClient
    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies
    )

    try:
        # 1. Синхронизируем статистику профиля
        stats = await client.sync_profile_and_stats()
        if stats["funpay_user_id"]:
            account.funpay_user_id = stats["funpay_user_id"]
        account.balance = stats["balance"]
        account.rating = stats["rating"]
        account.reviews_count = stats["reviews_count"]
        
        if stats["username"] != "Unknown":
            account.last_status = f"Active ({stats['username']})"
            account.name = f"{account.name.split(' (')[0]} ({stats['username']})"

        # 2. Получаем актуальные лоты и пишем в кэш
        lots = await client.get_active_lots()
        account.lots_cache = lots
        account.last_synced = datetime.utcnow()

        db.add(account)
        await db.commit()
        await db.refresh(account)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка синхронизации: {str(e)}")

    # Фильтруем чувствительные данные
    resp = AccountResponse.from_orm(account)
    if current_user.role != UserRole.MANAGER:
        resp.golden_key = account.golden_key
        resp.proxy_url = account.proxy_url
    return resp


@router.post("/{account_id}/sync-stats", response_model=AccountResponse)
async def sync_account_stats(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Синхронизирует баланс, рейтинг, отзывы аккаунта с Funpay."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role == UserRole.OWNER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    if not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию")

    # Запускаем FanpayClient
    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies
    )

    stats = await client.sync_profile_and_stats()
    
    # Обновляем аккаунт в БД
    if stats["funpay_user_id"]:
        account.funpay_user_id = stats["funpay_user_id"]
    account.balance = stats["balance"]
    account.rating = stats["rating"]
    account.reviews_count = stats["reviews_count"]
    
    # Если спарсился никнейм отличный от Unknown, обновим отображаемый статус
    if stats["username"] != "Unknown":
        account.last_status = f"Active ({stats['username']})"
        account.name = f"{account.name.split(' (')[0]} ({stats['username']})"
        
    db.add(account)
    await db.commit()
    await db.refresh(account)

    # Фильтруем чувствительные данные
    resp = AccountResponse.from_orm(account)
    if current_user.role != UserRole.MANAGER:
        resp.golden_key = account.golden_key
        resp.proxy_url = account.proxy_url
    return resp


@router.get("/{account_id}/sync-lots")
async def sync_account_lots(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получает список лотов из кэша БД. Если кэша нет — выполняет синхронизацию."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role == UserRole.OWNER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    # Если в БД уже есть кэш лотов, отдаем его мгновенно!
    if account.lots_cache:
        return account.lots_cache

    if not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию")

    # Запускаем FanpayClient для первичного наполнения кэша
    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies
    )

    try:
        lots = await client.get_active_lots()
        account.lots_cache = lots
        account.last_synced = datetime.utcnow()
        db.add(account)
        await db.commit()
        return lots
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка получения лотов: {str(e)}")


@router.post("/{account_id}/lots/update-price")
async def update_funpay_lot_price(
    account_id: int,
    data: LotPriceUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Изменяет цену лота на самом Funpay в реальном времени."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role == UserRole.OWNER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    if not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию")

    # Запускаем FanpayClient
    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies
    )

    success = await client.update_lot_price(data.lot_id, data.price)
    if not success:
        raise HTTPException(status_code=400, detail="Не удалось изменить цену на Funpay. Проверьте куки/прокси.")

    # Обновляем кэш лотов в БД!
    if account.lots_cache:
        updated_lots = []
        for l in account.lots_cache:
            if l.get("lot_id") == data.lot_id:
                l["price"] = data.price
            updated_lots.append(l)
        account.lots_cache = updated_lots
        db.add(account)
        await db.commit()

    return {"success": True, "message": f"Цена лота {data.lot_id} успешно изменена на {data.price} руб."}


@router.get("/{account_id}/lots/{lot_id}/native-delivery", response_model=NativeDeliveryResponse)
async def get_lot_native_delivery(
    account_id: int,
    lot_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Загружает встроенные настройки автовыдачи лота с Funpay."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role == UserRole.OWNER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    if not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию")

    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies
    )

    details = await client.get_lot_details(lot_id)
    if not details:
        raise HTTPException(status_code=400, detail="Не удалось получить детали лота с Funpay")

    return NativeDeliveryResponse(
        lot_id=details["lot_id"],
        price=details["price"],
        amount=details["amount"],
        native_auto_delivery_enabled=details["native_auto_delivery_enabled"],
        native_auto_delivery_text=details["native_auto_delivery_text"]
    )


@router.post("/{account_id}/lots/{lot_id}/native-delivery")
async def update_lot_native_delivery(
    account_id: int,
    lot_id: str,
    data: NativeDeliveryUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Изменяет встроенные настройки автовыдачи лота на самом Funpay."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role == UserRole.OWNER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    if not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию")

    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies
    )

    # 1. Получаем текущие поля
    details = await client.get_lot_details(lot_id)
    if not details:
        raise HTTPException(status_code=400, detail="Не удалось прочитать форму лота на Funpay")

    # 2. Сохраняем с изменениями
    success = await client.save_lot_settings(
        lot_id=lot_id,
        fields=details["fields"],
        price=data.price,
        native_auto_delivery_enabled=data.native_auto_delivery_enabled,
        native_auto_delivery_text=data.native_auto_delivery_text
    )

    if not success:
        raise HTTPException(status_code=400, detail="Не удалось сохранить настройки автовыдачи на Funpay")

    # 3. Обновляем кэш лотов в БД!
    if account.lots_cache:
        updated_lots = []
        for l in account.lots_cache:
            if l.get("lot_id") == lot_id:
                if data.price is not None:
                    l["price"] = data.price
            updated_lots.append(l)
        account.lots_cache = updated_lots
        db.add(account)
        await db.commit()

    return {"success": True, "message": "Настройки встроенной автовыдачи успешно изменены на Funpay!"}


@router.post("/{account_id}/raise")
async def raise_account_lots(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Вручную запускает поднятие лотов на Funpay."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Проверка прав доступа
    if current_user.role == UserRole.MANAGER:
        if not await check_manager_permission(db, current_user.id, account_id):
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    elif current_user.role == UserRole.OWNER and account.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    if not account.cookies:
        raise HTTPException(status_code=400, detail="Сначала верифицируйте сессию")

    # Запускаем FanpayClient
    client = FanpayClient(
        golden_key=account.golden_key,
        proxy_url=account.proxy_url,
        user_agent=account.user_agent,
        cookies=account.cookies
    )

    success, message = await client.raise_offers()
    
    if success:
        account.last_raised = datetime.utcnow()
        db.add(account)
        await db.commit()

    return {"success": success, "message": message}
