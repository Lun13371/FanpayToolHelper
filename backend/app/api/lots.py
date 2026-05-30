from typing import Any, List, Optional, Dict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.models.account import FanpayAccount
from app.models.lot import LotSettings
from app.api.accounts import check_manager_permission, verify_account_access
from app.services.fanpay_client import FanpayClient

# Схемы для ответов и запросов, связанных с аккаунтами на Funpay
from app.api.accounts import AccountResponse

router = APIRouter(prefix="/lots", tags=["Настройка Демпинга"])
accounts_lots_router = APIRouter(prefix="/accounts", tags=["Демпинг и Синхронизация лотов"])

class LotCreate(BaseModel):
    account_id: int
    lot_id: str = Field(..., description="ID лота на Funpay")
    lot_name: str
    min_price: float
    undercut_value: float = 0.01

class LotUpdate(BaseModel):
    lot_name: Optional[str] = None
    min_price: Optional[float] = None
    undercut_value: Optional[float] = None
    is_active: Optional[bool] = None

class LotResponse(BaseModel):
    id: int
    account_id: int
    lot_id: str
    lot_name: str
    min_price: float
    undercut_value: float
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


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


@router.get("", response_model=List[LotResponse])
async def list_lots(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить список настроенных лотов для выбранного аккаунта."""
    await verify_account_access(db, current_user, account_id)
    
    query = select(LotSettings).where(LotSettings.account_id == account_id)
    res = await db.execute(query)
    return res.scalars().all()


@router.post("", response_model=LotResponse, status_code=status.HTTP_201_CREATED)
async def create_lot(
    data: LotCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Создать настройки демпинга для лота."""
    await verify_account_access(db, current_user, data.account_id)

    # Проверяем уникальность настроек демпинга на этом аккаунте
    query = select(LotSettings).where(
        LotSettings.account_id == data.account_id,
        LotSettings.lot_id == data.lot_id
    )
    res = await db.execute(query)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Настройки демпинга для этого лота уже существуют")

    new_lot = LotSettings(
        account_id=data.account_id,
        lot_id=data.lot_id,
        lot_name=data.lot_name,
        min_price=data.min_price,
        undercut_value=data.undercut_value,
        is_active=False
    )
    db.add(new_lot)
    await db.commit()
    await db.refresh(new_lot)
    return new_lot


@router.put("/{lot_id_db}", response_model=LotResponse)
async def update_lot(
    lot_id_db: int,
    data: LotUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Обновить настройки демпинга лота."""
    lot = await db.get(LotSettings, lot_id_db)
    if not lot:
        raise HTTPException(status_code=404, detail="Лот не найден")

    await verify_account_access(db, current_user, lot.account_id)

    # Обновляем поля
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(lot, key, value)

    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    return lot


@router.delete("/{lot_id_db}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_lot(
    lot_id_db: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Удалить лот из списка демпинга."""
    lot = await db.get(LotSettings, lot_id_db)
    if not lot:
        raise HTTPException(status_code=404, detail="Лот не найден")

    await verify_account_access(db, current_user, lot.account_id)

    await db.delete(lot)
    await db.commit()
    return None


# =========================================================================
# ПЕРЕНЕСЕННЫЕ РОУТЫ СИНХРОНИЗАЦИИ И ПОДНЯТИЯ ИЗ ACCOUNTS.PY
# =========================================================================

@accounts_lots_router.post("/{account_id}/sync-full", response_model=AccountResponse)
async def sync_account_full(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Выполняет полную ручную синхронизацию профиля (баланс, отзывы) и лотов с Funpay, сохраняя кэш в БД."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    await verify_account_access(db, current_user, account_id)

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


@accounts_lots_router.post("/{account_id}/sync-stats", response_model=AccountResponse)
async def sync_account_stats(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Синхронизирует баланс, рейтинг, отзывы аккаунта с Funpay."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    await verify_account_access(db, current_user, account_id)

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


@accounts_lots_router.get("/{account_id}/sync-lots")
async def sync_account_lots(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получает список лотов из кэша БД. Если кэша нет — выполняет синхронизацию."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    await verify_account_access(db, current_user, account_id)

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


@accounts_lots_router.post("/{account_id}/lots/update-price")
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

    await verify_account_access(db, current_user, account_id)

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


@accounts_lots_router.get("/{account_id}/lots/{lot_id}/native-delivery", response_model=NativeDeliveryResponse)
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

    await verify_account_access(db, current_user, account_id)

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


@accounts_lots_router.post("/{account_id}/lots/{lot_id}/native-delivery")
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

    await verify_account_access(db, current_user, account_id)

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


@accounts_lots_router.post("/{account_id}/raise")
async def raise_account_lots(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Вручную запускает поднятие лотов на Funpay."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    await verify_account_access(db, current_user, account_id)

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
