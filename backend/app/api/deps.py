from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.config import settings
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

async def get_current_user(
    db: AsyncSession = Depends(get_session),
    token: str = Depends(oauth2_scheme)
) -> User:
    """
    Извлекает и верифицирует текущего пользователя из JWT токена.
    Проверяет флаги активности и одобрения админом.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось верифицировать учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    query = select(User).where(User.username == username)
    result = await db.execute(query)
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception
        
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Пользователь деактивирован")
        
    if not user.is_approved and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Ваш аккаунт ожидает подтверждения администратором")

    return user

async def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Проверяет, имеет ли текущий пользователь роль Супер-Администратора."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав. Требуется роль Супер-Администратора."
        )
    return current_user

async def get_current_owner_or_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Проверяет, является ли пользователь владельцем магазина или админом."""
    if current_user.role not in [UserRole.OWNER, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав. Требуется роль Владельца или Администратора."
        )
    return current_user
