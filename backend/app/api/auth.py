from datetime import timedelta
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.core import security
from app.api.deps import get_current_user, get_current_admin, get_current_owner_or_admin
from app.models.user import User, UserRole

router = APIRouter(prefix="/auth", tags=["Аутентификация"])

# Схемы Pydantic для API
class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    role: UserRole = Field(default=UserRole.OWNER)

class UserResponse(BaseModel):
    id: int
    username: str
    role: UserRole
    is_approved: bool
    is_active: bool

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: UserRegister, 
    db: AsyncSession = Depends(get_session)
) -> Any:
    """Регистрация нового пользователя."""
    # Проверяем уникальность имени
    query = select(User).where(User.username == data.username)
    res = await db.execute(query)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Пользователь с таким именем уже существует")

    # Первый зарегистрированный юзер в чистой БД автоматически становится ADMIN-ом
    query_any_users = select(User)
    any_users = await db.execute(query_any_users)
    is_first_user = len(any_users.scalars().all()) == 0

    role = UserRole.ADMIN if is_first_user else data.role
    
    # Администраторы одобряются сразу, обычные пользователи - после одобрения админом
    is_approved = True if role == UserRole.ADMIN else False

    new_user = User(
        username=data.username,
        hashed_password=security.get_password_hash(data.password),
        role=role,
        is_approved=is_approved,
        is_active=True
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_session)
) -> Any:
    """Авторизация и получение JWT токена."""
    query = select(User).where(User.username == form_data.username)
    res = await db.execute(query)
    user = res.scalar_one_or_none()

    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверное имя пользователя или пароль"
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Ваш аккаунт деактивирован")

    if not user.is_approved and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ваш аккаунт ожидает одобрения Супер-Администратором."
        )

    access_token = security.create_access_token(subject=user.username)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)) -> Any:
    """Получение профиля текущего авторизованного пользователя."""
    return current_user


# =========================================================================
# АДМИНИСТРАТИВНЫЕ ЭНДПОИНТЫ (Одобрение пользователей)
# =========================================================================

@router.get("/pending-approvals", response_model=List[UserResponse])
async def get_pending_users(
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin)
) -> Any:
    """Список пользователей, ожидающих одобрения (Только для Админа)."""
    query = select(User).where(User.is_approved == False)
    res = await db.execute(query)
    return res.scalars().all()


@router.post("/approve/{user_id}", response_model=UserResponse)
async def approve_user(
    user_id: int,
    db: AsyncSession = Depends(get_session),
    admin: User = Depends(get_current_admin)
) -> Any:
    """Одобрить регистрацию пользователя (Только для Админа)."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
        
    user.is_approved = True
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# =========================================================================
# УПРАВЛЕНИЕ МЕНЕДЖЕРАМИ (Для Владельца магазина)
# =========================================================================

class ManagerCreate(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)

@router.post("/managers", response_model=UserResponse)
async def create_manager(
    data: ManagerCreate,
    db: AsyncSession = Depends(get_session),
    owner: User = Depends(get_current_owner_or_admin)
) -> Any:
    """Создать аккаунт менеджера/наемного сотрудника (Для владельцев)."""
    query = select(User).where(User.username == data.username)
    res = await db.execute(query)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Менеджер с таким именем уже зарегистрирован")

    new_manager = User(
        username=data.username,
        hashed_password=security.get_password_hash(data.password),
        role=UserRole.MANAGER,
        parent_id=owner.id,
        is_approved=True, # Менеджер, созданный владельцем, одобряется сразу
        is_active=True
    )
    db.add(new_manager)
    await db.commit()
    await db.refresh(new_manager)
    return new_manager


@router.get("/managers", response_model=List[UserResponse])
async def list_managers(
    db: AsyncSession = Depends(get_session),
    owner: User = Depends(get_current_owner_or_admin)
) -> Any:
    """Список всех менеджеров, привязанных к текущему Владельцу."""
    query = select(User).where(User.role == UserRole.MANAGER, User.parent_id == owner.id)
    res = await db.execute(query)
    return res.scalars().all()
