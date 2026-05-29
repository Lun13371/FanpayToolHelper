from typing import Any, List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.api.deps import get_current_user
from app.models.user import User, UserRole
from app.models.delivery import AutoDeliveryItem
from app.models.review import AutoReviewTemplate
from app.models.competitor import CompetitorBlacklist
from app.api.accounts import verify_account_access

router = APIRouter(prefix="/delivery", tags=["Склад автовыдачи и Настройки"])

# =========================================================================
# СХЕМЫ PYDANTIC ДЛЯ АВТОВЫДАЧИ
# =========================================================================
class DeliveryItemCreate(BaseModel):
    account_id: int
    category_id: Optional[str] = None
    lot_name: str = Field(..., description="Точное имя лота на Funpay")
    content: str = Field(..., description="Выдаваемый ключ, ссылка или текст")
    is_multi_use: bool = Field(default=False, description="Многоразовый ли товар (например, инструкция)")

class DeliveryItemBulkCreate(BaseModel):
    account_id: int
    lot_name: str
    items_content: str = Field(..., description="Список ключей, разделенный переносами строк")
    is_multi_use: bool = False

class DeliveryItemUpdate(BaseModel):
    category_id: Optional[str] = None
    lot_name: Optional[str] = None
    content: Optional[str] = None
    is_multi_use: Optional[bool] = None
    is_sold: Optional[bool] = None

class DeliveryItemResponse(BaseModel):
    id: int
    account_id: int
    category_id: Optional[str]
    lot_name: Optional[str]
    content: str
    is_multi_use: bool
    is_sold: bool
    created_at: datetime

    class Config:
        from_attributes = True

# =========================================================================
# СХЕМЫ PYDANTIC ДЛЯ ШАБЛОНОВ ОТЗЫВОВ
# =========================================================================
class ReviewTemplateCreate(BaseModel):
    account_id: int
    text: str = Field(..., min_length=2)

class ReviewTemplateResponse(BaseModel):
    id: int
    account_id: int
    text: str
    created_at: datetime

    class Config:
        from_attributes = True

# =========================================================================
# СХЕМЫ PYDANTIC ДЛЯ ЧЕРНОГО СПИСКА
# =========================================================================
class CompetitorCreate(BaseModel):
    account_id: int
    username: str = Field(..., min_length=2)

class CompetitorResponse(BaseModel):
    id: int
    account_id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True


# =========================================================================
# РОУТЫ: АВТОВЫДАЧА (УПРАВЛЕНИЕ ТОВАРАМИ)
# =========================================================================

@router.get("/items", response_model=List[DeliveryItemResponse])
async def list_delivery_items(
    account_id: int,
    lot_name: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user) # Импортируется неявно из deps
) -> Any:
    """Получить список товаров на складе автовыдачи (с фильтром по лоту)."""
    await verify_account_access(db, current_user, account_id)
    
    query = select(AutoDeliveryItem).where(AutoDeliveryItem.account_id == account_id)
    if lot_name:
        query = query.where(AutoDeliveryItem.lot_name == lot_name)
        
    res = await db.execute(query)
    return res.scalars().all()


@router.post("/items", response_model=DeliveryItemResponse, status_code=status.HTTP_201_CREATED)
async def create_delivery_item(
    data: DeliveryItemCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Добавить один товар (ключ/инструкцию) на склад автовыдачи."""
    await verify_account_access(db, current_user, data.account_id)

    new_item = AutoDeliveryItem(
        account_id=data.account_id,
        category_id=data.category_id,
        lot_name=data.lot_name,
        content=data.content,
        is_multi_use=data.is_multi_use,
        is_sold=False
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    return new_item


@router.post("/items/bulk", response_model=List[DeliveryItemResponse], status_code=status.HTTP_201_CREATED)
async def bulk_create_delivery_items(
    data: DeliveryItemBulkCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Пакетное добавление ключей на склад автовыдачи (через переносы строк)."""
    await verify_account_access(db, current_user, data.account_id)

    # Разделяем контент по переносам строк
    lines = [line.strip() for line in data.items_content.split("\n") if line.strip()]
    
    added_items = []
    for line in lines:
        new_item = AutoDeliveryItem(
            account_id=data.account_id,
            lot_name=data.lot_name,
            content=line,
            is_multi_use=data.is_multi_use,
            is_sold=False
        )
        db.add(new_item)
        added_items.append(new_item)

    if added_items:
        await db.commit()
        for item in added_items:
            await db.refresh(item)
            
    return added_items


@router.put("/items/{item_id}", response_model=DeliveryItemResponse)
async def update_delivery_item(
    item_id: int,
    data: DeliveryItemUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Обновить товар на складе (изменить ключ или сбросить статус продажи)."""
    item = await db.get(AutoDeliveryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Товар на складе не найден")

    await verify_account_access(db, current_user, item.account_id)

    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)

    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_delivery_item(
    item_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Удалить товар со склада автовыдачи."""
    item = await db.get(AutoDeliveryItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден")

    await verify_account_access(db, current_user, item.account_id)

    await db.delete(item)
    await db.commit()
    return None


# =========================================================================
# РОУТЫ: ШАБЛОНЫ ОТЗЫВОВ BUYER-у
# =========================================================================

@router.get("/reviews", response_model=List[ReviewTemplateResponse])
async def list_review_templates(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Список шаблонов авто-отзывов для аккаунта."""
    await verify_account_access(db, current_user, account_id)
    
    query = select(AutoReviewTemplate).where(AutoReviewTemplate.account_id == account_id)
    res = await db.execute(query)
    return res.scalars().all()


@router.post("/reviews", response_model=ReviewTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_review_template(
    data: ReviewTemplateCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Создать новый шаблон отзыва покупателю."""
    await verify_account_access(db, current_user, data.account_id)

    new_review = AutoReviewTemplate(account_id=data.account_id, text=data.text)
    db.add(new_review)
    await db.commit()
    await db.refresh(new_review)
    return new_review


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_review_template(
    review_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Удалить шаблон отзыва."""
    review = await db.get(AutoReviewTemplate, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Шаблон не найден")

    await verify_account_access(db, current_user, review.account_id)

    await db.delete(review)
    await db.commit()
    return None


# =========================================================================
# РОУТЫ: ЧЕРНЫЙ СПИСК КОНКУРЕНТОВ ДЛЯ ДЕМПИНГА
# =========================================================================

@router.get("/blacklist", response_model=List[CompetitorResponse])
async def list_blacklist_competitors(
    account_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Список заблокированных конкурентов для аккаунта."""
    await verify_account_access(db, current_user, account_id)
    
    query = select(CompetitorBlacklist).where(CompetitorBlacklist.account_id == account_id)
    res = await db.execute(query)
    return res.scalars().all()


@router.post("/blacklist", response_model=CompetitorResponse, status_code=status.HTTP_201_CREATED)
async def create_blacklist_competitor(
    data: CompetitorCreate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Добавить никнейм конкурента в черный список демпинга."""
    await verify_account_access(db, current_user, data.account_id)

    # Проверяем на дубли
    query = select(CompetitorBlacklist).where(
        CompetitorBlacklist.account_id == data.account_id,
        CompetitorBlacklist.username == data.username
    )
    res = await db.execute(query)
    if res.scalar_one_or_none():
         raise HTTPException(status_code=400, detail="Этот конкурент уже в черном списке")

    new_comp = CompetitorBlacklist(account_id=data.account_id, username=data.username)
    db.add(new_comp)
    await db.commit()
    await db.refresh(new_comp)
    return new_comp


@router.delete("/blacklist/{blacklist_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_blacklist_competitor(
    blacklist_id: int,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user)
) -> Any:
    """Удалить конкурента из черного списка."""
    comp = await db.get(CompetitorBlacklist, blacklist_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Запись не найдена в черном списке")

    await verify_account_access(db, current_user, comp.account_id)

    await db.delete(comp)
    await db.commit()
    return None
