"""Shared route dependencies (auth, db session, etc.)."""

import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.db import get_db
from backend.models.user import User
from backend.services.auth_service import AuthService

security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Extract and validate the current user from the Authorization header."""
    token = credentials.credentials
    try:
        payload = AuthService.decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user UUID in token",
        )

    user = await AuthService.get_user_by_id(db, user_uuid)
    if not user:
        # Auto-provision user from Supabase JWT claims
        email = payload.get("email")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing email in token payload",
            )
        
        # Try to get username from Supabase user_metadata
        user_metadata = payload.get("user_metadata", {})
        username = user_metadata.get("username") or user_metadata.get("user_name") or email.split("@")[0]
        
        # Check if email or username is already taken to prevent database conflicts
        from sqlalchemy import select
        stmt = select(User).where((User.email == email) | (User.username == username))
        existing_res = await db.execute(stmt)
        existing_user = existing_res.scalar_one_or_none()
        
        if existing_user:
            if existing_user.email == email:
                # Same email but different ID (e.g. old local mock db record).
                # Update the ID to match Supabase UUID.
                existing_user.id = user_uuid
                user = existing_user
                await db.commit()
            else:
                # Username conflict only; append random string suffix
                username = f"{username}_{uuid.uuid4().hex[:4]}"
        
        if not user:
            user = User(
                id=user_uuid,
                email=email,
                username=username,
                hashed_password="supabase-authenticated",
                is_active=True
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


# Type alias for convenience
CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
