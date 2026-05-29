from typing import Any, List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.models.lot import LotSettings
from app.models.lot_template import LotTemplate
from app.api.accounts import verify_account_access

router = APIRouter(prefix="/lots/templates", tags=["Шаблоны Демпинга"])

class TemplateCreate(BaseModel):
    name: str = Field(..., description="Название шаблона")
    min_price: float = Field(..., description="Минимальная цена лота")
    undercut_value: float = Field(default=0.01, description="Шаг снижения цены")
    is_active: bool = Field(default=True)

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    min_price: Optional[float] = None
    undercut_value: Optional[float] = None
    is_active: Optional[bool] = None

class TemplateResponse(BaseModel):
    id: int
    user_id: int
    name: str
    min_price: float
    undercut_value: float
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class TemplateApply(BaseModel):
    account_id: int
    lot_id: str
    lot_name: str


def get_owner_id(user: User) -> int:
    """Возвращает ID владельца организации (для получения общих шаблонов)."""
    if user.role == UserRole.MANAGER and user.parent_id:
        return user.parent_id
    return user.id


@router.get("", response_model=List[TemplateResponse])
async def list_templates(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить список всех глобальных шаблонов демпинга."""
    owner_id = get_owner_id(current_user)
    query = select(LotTemplate).where(LotTemplate.user_id == owner_id)
    res = await db.execute(query)
    return res.scalars().all()


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: TemplateCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Создать новый глобальный шаблон демпинга (только для Владельцев/Админа)."""
    if current_user.role == UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="Менеджеры не могут создавать глобальные шаблоны")
        
    new_template = LotTemplate(
        user_id=current_user.id,
        name=data.name,
        min_price=data.min_price,
        undercut_value=data.undercut_value,
        is_active=data.is_active
    )
    db.add(new_template)
    await db.commit()
    await db.refresh(new_template)
    return new_template


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: int,
    data: TemplateUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Редактировать параметры шаблона (только для Владельцев/Админа)."""
    if current_user.role == UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="Менеджеры не могут редактировать шаблоны")

    template = await db.get(LotTemplate, template_id)
    if not template or template.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    # Обновляем поля
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)

    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Удалить глобальный шаблон (только для Владельцев/Админа)."""
    if current_user.role == UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="Менеджеры не могут удалять шаблоны")

    template = await db.get(LotTemplate, template_id)
    if not template or template.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    await db.delete(template)
    await db.commit()
    return None


@router.post("/{template_id}/apply")
async def apply_template_to_lot(
    template_id: int,
    data: TemplateApply,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Применить глобальный шаблон к конкретному лоту аккаунта (создает или обновляет правила демпинга)."""
    # 1. Проверяем доступ к аккаунту
    await verify_account_access(db, current_user, data.account_id)

    # 2. Проверяем шаблон
    owner_id = get_owner_id(current_user)
    template = await db.get(LotTemplate, template_id)
    if not template or template.user_id != owner_id:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    # 3. Ищем существующие настройки демпинга для этого лота
    query = select(LotSettings).where(
        LotSettings.account_id == data.account_id,
        LotSettings.lot_id == data.lot_id
    )
    res = await db.execute(query)
    lot_settings = res.scalar_one_or_none()

    if lot_settings:
        # Обновляем существующие
        lot_settings.lot_name = data.lot_name
        lot_settings.min_price = template.min_price
        lot_settings.undercut_value = template.undercut_value
        lot_settings.is_active = template.is_active
    else:
        # Создаем новые
        lot_settings = LotSettings(
            account_id=data.account_id,
            lot_id=data.lot_id,
            lot_name=data.lot_name,
            min_price=template.min_price,
            undercut_value=template.undercut_value,
            is_active=template.is_active
        )
    
    db.add(lot_settings)
    await db.commit()
    await db.refresh(lot_settings)
    
    return {"success": True, "message": f"Шаблон '{template.name}' успешно применен к лоту '{data.lot_name}'!", "lot_settings_id": lot_settings.id}
