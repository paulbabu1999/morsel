"""Authentication: email/password signup + login, bcrypt hashing, JWT sessions,
and the FastAPI dependency that turns a Bearer token into the current user_id.

The authenticated user_id is what flows into every data endpoint and, via
db.app_tx / run_readonly_sql, into the RLS GUC — so Row-Level Security isolates
each user's meals/profile automatically.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import config, repo

_security = HTTPBearer(auto_error=True)


# --- password hashing ------------------------------------------------------

def hash_password(password: str) -> str:
    # bcrypt caps at 72 bytes; truncate defensively.
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))
    except Exception:
        return False


# --- tokens ----------------------------------------------------------------

def create_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=config.JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "exp": exp}, config.JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
        return payload.get("sub")
    except Exception:
        return None


def current_user_id(creds: HTTPAuthorizationCredentials = Depends(_security)) -> str:
    """FastAPI dependency: the authenticated user's id, or 401."""
    uid = decode_token(creds.credentials)
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return uid


# --- signup / login --------------------------------------------------------

def signup(email: str, password: str) -> tuple[str, str]:
    """Create an account; return (user_id, token). Raises 409 if email taken."""
    email = (email or "").strip().lower()
    if len(password or "") < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password must be at least 8 characters")
    if repo.get_user_by_email(email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user_id = "u-" + uuid.uuid4().hex
    repo.create_user(user_id, email, hash_password(password))
    return user_id, create_token(user_id)


def login(email: str, password: str) -> tuple[str, str]:
    """Verify credentials; return (user_id, token). Raises 401 on mismatch."""
    user = repo.get_user_by_email((email or "").strip().lower())
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return user["id"], create_token(user["id"])
