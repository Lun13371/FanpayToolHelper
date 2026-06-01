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
from app.models.lot_template import LotTemplate, LotCreationTemplate
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


# Схемы для шаблонов публикации новых лотов
class LotCreationTemplateCreate(BaseModel):
    name: str = Field(..., description="Название шаблона")
    node_id: str = Field(..., description="ID категории на Funpay")
    game_name: str = Field(..., description="Название игры")
    subcategory_name: str = Field(..., description="Название подкатегории")
    fields: Dict[str, Any] = Field(default_factory=dict, description="Значения полей формы")

class LotCreationTemplateUpdate(BaseModel):
    name: Optional[str] = None
    fields: Optional[Dict[str, Any]] = None

class LotCreationTemplateResponse(BaseModel):
    id: int
    user_id: int
    name: str
    node_id: str
    game_name: str
    subcategory_name: str
    fields: Dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


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


# =========================================================================
# УПРАВЛЕНИЕ ШАБЛОНАМИ ПУБЛИКАЦИИ ЛОТОВ (LOT CREATION TEMPLATES)
# =========================================================================

@router.get("/creation", response_model=List[LotCreationTemplateResponse])
async def list_creation_templates(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить список всех глобальных шаблонов публикации лотов."""
    owner_id = get_owner_id(current_user)
    query = select(LotCreationTemplate).where(LotCreationTemplate.user_id == owner_id)
    res = await db.execute(query)
    return res.scalars().all()


@router.post("/creation", response_model=LotCreationTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_creation_template(
    data: LotCreationTemplateCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Создать новый шаблон публикации лота (только для Владельцев/Админа)."""
    if current_user.role == UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="Менеджеры не могут создавать глобальные шаблоны")
        
    new_template = LotCreationTemplate(
        user_id=current_user.id,
        name=data.name,
        node_id=data.node_id,
        game_name=data.game_name,
        subcategory_name=data.subcategory_name,
        fields=data.fields
    )
    db.add(new_template)
    await db.commit()
    await db.refresh(new_template)
    return new_template


@router.put("/creation/{template_id}", response_model=LotCreationTemplateResponse)
async def update_creation_template(
    template_id: int,
    data: LotCreationTemplateUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Редактировать параметры шаблона публикации лота (только для Владельцев/Админа)."""
    if current_user.role == UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="Менеджеры не могут редактировать шаблоны")

    template = await db.get(LotCreationTemplate, template_id)
    if not template or template.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)

    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/creation/{template_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_creation_template(
    template_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Удалить шаблон публикации лота (только для Владельцев/Админа)."""
    if current_user.role == UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="Менеджеры не могут удалять шаблоны")

    template = await db.get(LotCreationTemplate, template_id)
    if not template or template.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    await db.delete(template)
    await db.commit()
    return None


@router.get("/creation/form-fields")
async def get_creation_template_form_fields(
    node_id: str,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Получить динамическую форму создания лота для настройки шаблона."""
    from app.services.fanpay_client import FanpayClient
    owner_id = get_owner_id(current_user)
    
    # Ищем любой верифицированный аккаунт владельца для парсинга полей с Funpay
    query = select(FanpayAccount).where(
        FanpayAccount.user_id == owner_id,
        FanpayAccount.cookies != None
    )
    res = await db.execute(query)
    account = res.scalars().first()
    
    if not account:
        raise HTTPException(
            status_code=400, 
            detail="Необходимо иметь хотя бы один верифицированный аккаунт в менеджере для загрузки структуры полей с Funpay."
        )
        
    client = FanpayClient(account.golden_key, account.proxy_url, account.user_agent, account.cookies)
    details = await client.get_creation_form_details(node_id)
    if not details:
        raise HTTPException(status_code=400, detail="Не удалось загрузить структуру полей с Funpay.")
    return details

