"""Auth API router: login, logout, me."""
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.hash import bcrypt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import verify_password, create_access_token, get_current_user
from backend.config import settings
from backend.db import get_db
from backend.models import User
from backend.services.ldap_auth import authenticate as ldap_authenticate

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserInfo(BaseModel):
    id: int
    username: str
    display_name: str

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    token: str
    user: UserInfo


def _get_or_create_ldap_user(db: Session, ldap_info: dict) -> User:
    """Find a user by LDAP username, creating one if missing.

    The local password_hash is set to a random unusable value — login for
    LDAP-managed accounts always goes through the LDAP bind path.
    """
    username = ldap_info["username"]
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        user = User(
            username=username,
            password_hash=bcrypt.hash(secrets.token_urlsafe(32)),
            display_name=ldap_info.get("display_name") or username,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        new_display = ldap_info.get("display_name")
        if new_display and user.display_name != new_display:
            user.display_name = new_display
            db.commit()
            db.refresh(user)
    return user


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    if settings.ldap_url:
        ldap_info = ldap_authenticate(body.username, body.password)
        if ldap_info is not None:
            user = _get_or_create_ldap_user(db, ldap_info)
            token = create_access_token(user.id, user.username)
            return LoginResponse(
                token=token,
                user=UserInfo(id=user.id, username=user.username, display_name=user.display_name),
            )

    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_access_token(user.id, user.username)
    return LoginResponse(
        token=token,
        user=UserInfo(id=user.id, username=user.username, display_name=user.display_name),
    )


@router.post("/logout")
def logout():
    return {"ok": True}


@router.get("/me", response_model=UserInfo)
def me(current_user: User = Depends(get_current_user)):
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        display_name=current_user.display_name,
    )
