"""
The users endpoints: admins manage accounts and engineers; engineers set their own availability.

An engineer is a user whose role is "engineer" plus a row in engineer_profiles (sub-specialty,
phone, availability). Accounts are never deleted, only deactivated, so their tickets stay.
"""

from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from _shared.assignment import assign_waiting_tickets
from _shared.database import get_db
from _shared.errors import AppError
from _shared.models import UNFINISHED, EngineerProfile, Ticket, TicketCategory, User
from _shared.security import get_current_user, hash_password, require_admin
from schemas import (
    AccountCreate, AccountEdit, AccountOut, AccountPage, AvailabilityIn, EngineerOut, PasswordReset, PasswordResetOut,
)

router = APIRouter()


@router.get("/ping")
def ping():
    """Answers straight away (no login, no database). The app calls it on opening to start this service up."""
    return {"ok": True}


def account_out(user):
    profile = user.engineer_profile
    return AccountOut(
        id=user.id, email=user.email, full_name=user.full_name, role=user.role,
        is_active=user.is_active, created_at=user.created_at,
        category_id=profile.category_id if profile else None,
        category_name=profile.category.name if profile else None,
        specialty=profile.specialty if profile else None,
        phone=profile.phone if profile else None,
        availability=profile.availability if profile else None,
    )


def apply_role(db, user, body):
    """
    Saves the role, and keeps the engineer profile in step with it:
    - becoming an engineer creates or updates the profile (sub-specialty and phone);
    - deactivating an engineer keeps the profile, so reactivating brings it back, and sets
      them Off duty;
    - stopping being an engineer removes the profile.
    Deactivated or not an engineer any more: their unfinished tickets go back to Open, and
    the caller hands them to other engineers where possible.
    """
    if body.role == "engineer" and (body.category_id is None or db.get(TicketCategory, body.category_id) is None):
        raise AppError(400, "validation_error", "Please check the highlighted fields",
                       {"category_id": "Pick a sub-specialty for engineers"})

    if body.role == "engineer":
        if user.engineer_profile is None:
            user.engineer_profile = EngineerProfile(category_id=body.category_id, phone=body.phone)
        else:
            user.engineer_profile.category_id = body.category_id
            user.engineer_profile.phone = body.phone
        if not body.is_active:
            user.engineer_profile.availability = "off_duty"
    elif user.engineer_profile is not None:
        user.engineer_profile = None  # deletes the profile row

    if user.id is not None and (body.role != "engineer" or not body.is_active):
        for ticket in db.scalars(select(Ticket).where(Ticket.assignee_id == user.id, Ticket.status.in_(UNFINISHED))):
            ticket.assignee_id = None
            ticket.assigned_at = None
            ticket.status = "open"

    user.role = body.role


# ---------- Accounts (admin) ----------

@router.get("/", response_model=AccountPage)
def list_accounts(
    q: str | None = None,
    role: Literal["employee", "engineer", "admin"] | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = select(User)
    if q and q.strip():
        text = f"%{q.strip()}%"
        query = query.where(or_(User.full_name.ilike(text), User.email.ilike(text)))
    if role:
        query = query.where(User.role == role)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    # One page at a time, with each engineer's profile and category loaded in the same go.
    users = db.scalars(query.order_by(User.full_name, User.id).limit(per_page).offset((page - 1) * per_page)
                       .options(selectinload(User.engineer_profile).selectinload(EngineerProfile.category)))
    return AccountPage(accounts=[account_out(u) for u in users], total=total)


@router.post("/", response_model=AccountOut, status_code=201)
def create_account(body: AccountCreate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email)):
        raise AppError(409, "email_taken", "That email already has an account", {"email": "Already has an account"})
    user = User(email=body.email, full_name=body.full_name, password_hash=hash_password(body.password),
                is_active=body.is_active)
    apply_role(db, user, body)
    db.add(user)
    db.flush()
    assign_waiting_tickets(db)  # a new or changed engineer may be able to take waiting tickets
    db.commit()
    db.refresh(user)
    return account_out(user)


@router.put("/password-reset", response_model=PasswordResetOut)
def reset_password(body: PasswordReset, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """An admin sets a new password for someone who forgot theirs (there's no email sending)."""
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None:
        raise AppError(400, "not_found", "No account uses this email", {"email": "No account uses this email"})
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return PasswordResetOut(full_name=user.full_name, email=user.email)


@router.put("/{user_id}", response_model=AccountOut)
def edit_account(user_id: int, body: AccountEdit, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise AppError(400, "not_found", "Account not found")
    # So the app always keeps at least one admin who can get in.
    if user.id == admin.id and (body.role != "admin" or not body.is_active):
        raise AppError(400, "own_account", "You can't change your own role or deactivate yourself")
    user.full_name = body.full_name
    user.is_active = body.is_active
    apply_role(db, user, body)
    db.flush()
    assign_waiting_tickets(db)  # a new or changed engineer may be able to take waiting tickets
    db.commit()
    db.refresh(user)
    return account_out(user)


# ---------- Engineers ----------

@router.get("/engineers", response_model=list[EngineerOut])
def list_engineers(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    engineers = db.scalars(select(User).join(User.engineer_profile).where(User.is_active).order_by(User.full_name))
    # Everyone's unfinished count in one query: {engineer id: count}.
    counts = dict(db.execute(select(Ticket.assignee_id, func.count()).where(Ticket.status.in_(UNFINISHED))
                             .group_by(Ticket.assignee_id)).all())
    return [
        EngineerOut(id=u.id, email=u.email, full_name=u.full_name, category_id=u.engineer_profile.category_id,
                    category_name=u.engineer_profile.category.name, specialty=u.engineer_profile.specialty,
                    phone=u.engineer_profile.phone, availability=u.engineer_profile.availability,
                    open_tickets=counts.get(u.id, 0))
        for u in engineers
    ]


def own_profile(user):
    if user.engineer_profile is None:
        raise AppError(403, "forbidden", "Only engineers have an availability")
    return user.engineer_profile


@router.get("/engineers/me", response_model=AccountOut)
def my_engineer_profile(user: User = Depends(get_current_user)):
    own_profile(user)
    return account_out(user)


@router.put("/engineers/me/availability", response_model=AccountOut)
def set_my_availability(body: AvailabilityIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    own_profile(user).availability = body.availability
    db.flush()
    assign_waiting_tickets(db)  # a new or changed engineer may be able to take waiting tickets
    db.commit()
    return account_out(user)
