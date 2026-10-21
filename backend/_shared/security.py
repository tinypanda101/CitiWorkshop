"""
Passwords and sign-in tokens.

Passwords are stored as bcrypt hashes, never as the real password.
Tokens are JWTs that say who you are and your role, and expire after 8 hours.
"""

import hashlib
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from _shared.database import get_db
from _shared.errors import AppError
from _shared.models import User

TOKEN_HOURS = 8

# The signing key is made from the database password every Lambda already gets.
# In AWS that password is random, so the key is secret without a new setting.
SECRET_KEY = hashlib.sha256(("acme-token-key:" + os.getenv("POSTGRES_PASS", "postgres123")).encode()).hexdigest()

bearer = HTTPBearer(auto_error=False)

# The local dev proxy (bin/proxy-server.js) drops the Authorization header, so locally the
# frontend also sends the token as ?token=. IS_LOCAL is "true" only in LocalStack (infra/locals.tf).
ALLOW_TOKEN_IN_URL = os.getenv("IS_LOCAL", "false") == "true"


def hash_password(plain):
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def check_password(plain, hashed):
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def make_token(user):
    expires = datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS)
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": expires}, SECRET_KEY, algorithm="HS256")


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency for protected endpoints: add `user: User = Depends(get_current_user)`.
    Reads "Authorization: Bearer <token>" and returns the signed-in user, or replies 401.
    """
    token = credentials.credentials if credentials else None
    if token is None and ALLOW_TOKEN_IN_URL:
        token = request.query_params.get("token")
    if token is None:
        raise AppError(401, "not_signed_in", "Please log in")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise AppError(401, "token_expired", "Your session has expired, please log in again")
    except jwt.InvalidTokenError:
        raise AppError(401, "not_signed_in", "Please log in")

    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise AppError(401, "not_signed_in", "Please log in")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """FastAPI dependency for admin-only endpoints: add `admin: User = Depends(require_admin)`."""
    if user.role != "admin":
        raise AppError(403, "forbidden", "Only Facility Admins can do this")
    return user
