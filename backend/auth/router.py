"""The auth endpoints: register, login, who am I, change password."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from _shared.database import get_db
from _shared.errors import AppError
from _shared.models import User
from _shared.security import check_password, get_current_user, hash_password, make_token
from schemas import LoginRequest, PasswordChangeRequest, RegisterRequest, TokenOut, UserOut

router = APIRouter()


@router.post("/register", response_model=TokenOut)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Sign up as an employee. You're logged in straight away."""
    if db.scalar(select(User).where(User.email == body.email)) is not None:
        raise AppError(409, "email_taken", "An account with this email already exists", {"email": "Already registered"})

    user = User(email=body.email, full_name=body.full_name, password_hash=hash_password(body.password), role="employee")
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(token=make_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Log in with email and password. The same error for every failure, so it doesn't reveal which accounts exist."""
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not user.is_active or not check_password(body.password, user.password_hash):
        raise AppError(401, "invalid_credentials", "Wrong email or password")
    return TokenOut(token=make_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    """The signed-in person's name, email and role."""
    return user


@router.put("/password")
def change_password(body: PasswordChangeRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Change your own password. You must give the current one."""
    if not check_password(body.current_password, user.password_hash):
        message = "Current password is wrong"
        raise AppError(400, "wrong_password", message, {"current_password": message})
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password changed"}
