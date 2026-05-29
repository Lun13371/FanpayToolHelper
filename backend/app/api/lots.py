from typing import Any, List, Optional
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

router = APIRouter(prefix="/lots", tags=["Настройка Демпинга"])

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
