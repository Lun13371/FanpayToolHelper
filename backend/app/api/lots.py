from typing import Any, List, Optional, Dict
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

from app.database import get_session
from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.models.account import FanpayAccount
from app.models.lot import LotSettings
from app.models.global_category import FunpayGlobalCategory
from app.api.accounts import check_manager_permission, verify_account_access
from app.services.fanpay_client import FanpayClient

logger = logging.getLogger("fanpay.api.lots")

# Схемы для ответов и запросов, связанных с аккаунтами на Funpay
from app.api.accounts import AccountResponse

router = APIRouter(prefix="/lots", tags=["Настройка Демпинга"])
accounts_lots_router = APIRouter(prefix="/accounts", tags=["Демпинг и Синхронизация лотов"])

class GlobalCategoryResponse(BaseModel):
    id: int
    game_name: str
    subcategory_name: str
    node_id: str
    category_type: str

    class Config:
        from_attributes = True

class NewLotCreatePayload(BaseModel):
    node_id: str
    fields: Dict[str, Any]

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
    supports_native_auto_delivery: bool = False
    buyer_prices: Optional[List[Dict[str, str]]] = None
    form_fields: Optional[List[Dict[str, Any]]] = None

class NativeDeliveryUpdate(BaseModel):
    price: Optional[float] = None
    native_auto_delivery_enabled: Optional[bool] = None
    native_auto_delivery_text: Optional[str] = None
    fields: Optional[Dict[str, Any]] = None


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

        # 3. Синхронизируем и рассчитываем финансовую аналитику (выручка, возвраты, облако слов)
        try:
            from app.api.analytics import get_account_sales_stats
            await get_account_sales_stats(
                account_id=account.id,
                pages=3,
                force_refresh=True,
                db=db,
                current_user=current_user
            )
        except Exception as ae:
            import logging
            logging.getLogger("fanpay.api.lots").warning(
                f"Не удалось обновить финансовую аналитику при глобальной синхронизации: {str(ae)}"
            )
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
        native_auto_delivery_text=details["native_auto_delivery_text"],
        supports_native_auto_delivery=details.get("supports_native_auto_delivery", False),
        buyer_prices=details.get("buyer_prices"),
        form_fields=details.get("form_fields")
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
        native_auto_delivery_text=data.native_auto_delivery_text,
        custom_fields=data.fields
    )

    if not success:
        raise HTTPException(status_code=400, detail="Не удалось сохранить настройки автовыдачи на Funpay")

    # 3. Обновляем кэш лотов в БД!
    if account.lots_cache:
        # Пытаемся получить новую цену из переданных полей (может быть в 'price' или 'data.price')
        new_price = data.price
        if new_price is None and data.fields and "price" in data.fields:
            try:
                new_price = float(data.fields["price"])
            except:
                pass
                
        # Пытаемся получить новое название лота
        new_name = None
        if data.fields:
            if "fields[summary][ru]" in data.fields:
                new_name = data.fields["fields[summary][ru]"]
            elif "fields[summary][en]" in data.fields:
                new_name = data.fields["fields[summary][en]"]

        updated_lots = []
        for l in account.lots_cache:
            if l.get("lot_id") == lot_id:
                if new_price is not None:
                    l["price"] = new_price
                if new_name is not None:
                    l["lot_name"] = new_name
            updated_lots.append(l)
        account.lots_cache = updated_lots
        db.add(account)
        await db.commit()

    return {"success": True, "message": "Настройки лота успешно изменены на Funpay!"}


@accounts_lots_router.post("/{account_id}/raise")
async def raise_account_lots(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Вручную запускает поднятие лотов на Funpay с трансляцией прогресса."""
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

    async def event_generator():
        success = False
        raised_any = False
        async for event in client.raise_offers_generator():
            if event.get("type") == "success":
                raised_any = True
                success = True
            elif event.get("type") == "cooldown":
                raised_any = True
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        
        if success or raised_any:
            try:
                account.last_raised = datetime.utcnow()
                db.add(account)
                await db.commit()
            except Exception:
                pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/sync-global-categories", status_code=status.HTTP_200_OK)
async def sync_global_categories(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Синхронизировать и спарсить все глобальные категории товаров с главной страницы Funpay."""
    client = FanpayClient("", "", "", {})
    categories = await client.parse_all_categories_and_subcategories()
    if not categories:
        raise HTTPException(status_code=400, detail="Не удалось спарсить категории. Проверьте соединение с Funpay.")
    
    # Очищаем таблицу и записываем новые
    await db.execute(text("DELETE FROM funpay_global_categories"))
    
    added_count = 0
    for game in categories:
        game_name = game["game_name"]
        for sub in game["subcategories"]:
            query_check = select(FunpayGlobalCategory).where(FunpayGlobalCategory.node_id == sub["node_id"])
            existing = (await db.execute(query_check)).scalar_one_or_none()
            if not existing:
                db_cat = FunpayGlobalCategory(
                    game_name=game_name,
                    subcategory_name=sub["name"],
                    node_id=sub["node_id"],
                    category_type=sub["type"]
                )
                db.add(db_cat)
                added_count += 1
                
    await db.commit()
    return {"success": True, "message": f"Успешно синхронизировано {added_count} подразделов с Funpay."}


@router.get("/global-categories", response_model=List[GlobalCategoryResponse])
async def list_global_categories(
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить список всех доступных игр и категорий на FunPay с поиском."""
    query = select(FunpayGlobalCategory)
    if q:
        search_filter = f"%{q.lower()}%"
        query = query.where(
            (FunpayGlobalCategory.game_name.ilike(search_filter)) |
            (FunpayGlobalCategory.subcategory_name.ilike(search_filter))
        )
    query = query.order_by(FunpayGlobalCategory.game_name.asc(), FunpayGlobalCategory.subcategory_name.asc())
    res = await db.execute(query)
    return res.scalars().all()


@accounts_lots_router.get("/{account_id}/lots/creation-form")
async def get_creation_form(
    account_id: int,
    node_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить динамическую форму создания нового лота для указанной категории (node_id) с Funpay."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
        
    await verify_account_access(db, current_user, account_id)
    
    client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
    details = await client.get_creation_form_details(node_id)
    if not details:
        raise HTTPException(status_code=400, detail="Не удалось загрузить форму создания лота. Возможно, неверный ID категории.")
    return details


@accounts_lots_router.post("/{account_id}/lots/create")
async def create_new_lot(
    account_id: int,
    payload: NewLotCreatePayload,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Создать новый лот на FunPay в указанной категории (node_id)."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
        
    await verify_account_access(db, current_user, account_id)
    
    client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
    success, message = await client.create_lot(payload.node_id, payload.fields)
    if not success:
        raise HTTPException(status_code=400, detail=f"Ошибка создания лота на Funpay: {message}")
        
    # Сразу после создания лота принудительно запускаем синхронизацию списка лотов аккаунта!
    try:
        lots = await client.get_active_lots()
        if lots:
            account.lots_cache = lots
            account.last_synced = datetime.utcnow()
            db.add(account)
            await db.commit()
    except Exception as sync_e:
        logger.warning(f"Не удалось автоматически синхронизировать кэш лотов после создания: {sync_e}")
        
    return {"success": True, "message": message}


@accounts_lots_router.delete("/{account_id}/lots/{lot_id}")
async def delete_account_lot(
    account_id: int,
    lot_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Удалить лот непосредственно на FunPay."""
    account = await db.get(FanpayAccount, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
        
    await verify_account_access(db, current_user, account_id)
    
    client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
    success = await client.delete_lot(lot_id)
    if not success:
        raise HTTPException(status_code=400, detail="Не удалось удалить лот на FunPay.")
        
    # Удаляем локальные настройки демпинга для этого лота, если они были
    q_rule = select(LotSettings).where(
        LotSettings.account_id == account_id,
        LotSettings.lot_id == lot_id
    )
    rule_res = await db.execute(q_rule)
    rule = rule_res.scalar_one_or_none()
    if rule:
        await db.delete(rule)
        await db.commit()
        
    # Синхронизируем кэш лотов
    try:
        lots = await client.get_active_lots()
        account.lots_cache = lots
        account.last_synced = datetime.utcnow()
        db.add(account)
        await db.commit()
    except Exception as sync_e:
        logger.warning(f"Не удалось обновить кэш лотов после удаления: {sync_e}")
        
    return {"success": True, "message": "Лот успешно удален на FunPay!"}
