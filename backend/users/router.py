"""
The users endpoints: admins manage accounts and engineers; engineers set their own availability.

An engineer is a user whose role is "engineer" plus a row in engineer_profiles (specialty,
phone, availability). Accounts are never deleted, only deactivated, so their tickets stay.
"""

from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from _shared.assignment import assign_waiting_tickets
from _shared.database import get_db
from _shared.errors import AppError
from _shared.models import UNFINISHED, EngineerProfile, Ticket, User
from _shared.security import get_current_user, hash_password, require_admin
from schemas import AccountCreate, AccountEdit, AccountOut, AvailabilityIn, EngineerOut

router = APIRouter()

def account_out(user):
    profile = user.engineer_profile
    return AccountOut(
        id=user.id, email=user.email, full_name=user.full_name, role=user.role,
        is_active=user.is_active, created_at=user.created_at,
        specialty=profile.specialty if profile else None,
        phone=profile.phone if profile else None,
        availability=profile.availability if profile else None,
    )


def open_ticket_count(db, user_id):
    return db.scalar(select(func.count()).select_from(Ticket).where(
        Ticket.assignee_id == user_id, Ticket.status.in_(UNFINISHED)))


def apply_role(db, user, body):
    """
    Saves the role, and keeps the engineer profile in step with it:
    becoming an engineer creates or updates the profile; stopping being one (or being
    deactivated) removes it and unassigns their unfinished tickets, which go back to Open and
    are handed to other engineers automatically (by the caller) where possible.
    """
    is_engineer = body.role == "engineer" and body.is_active
    if body.role == "engineer" and body.specialty is None:
        raise AppError(400, "validation_error", "Please check the highlighted fields",
                       {"specialty": "Pick a specialty for engineers"})

    if is_engineer:
        if user.engineer_profile is None:
            user.engineer_profile = EngineerProfile(specialty=body.specialty, phone=body.phone)
        else:
            user.engineer_profile.specialty = body.specialty
            user.engineer_profile.phone = body.phone
    elif user.engineer_profile is not None:
        user.engineer_profile = None  # deletes the profile row
        for ticket in db.scalars(select(Ticket).where(Ticket.assignee_id == user.id, Ticket.status.in_(UNFINISHED))):
            ticket.assignee_id = None
            ticket.assigned_at = None
            ticket.status = "open"

    user.role = body.role


# ---------- Accounts (admin) ----------

@router.get("/", response_model=list[AccountOut])
def list_accounts(
    q: str | None = None,
    role: Literal["employee", "engineer", "admin"] | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = select(User).order_by(User.full_name)
    if q and q.strip():
        text = f"%{q.strip()}%"
        query = query.where(or_(User.full_name.ilike(text), User.email.ilike(text)))
    if role:
        query = query.where(User.role == role)
    return [account_out(u) for u in db.scalars(query)]


@router.post("/", response_model=AccountOut)
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
    return [
        EngineerOut(id=u.id, email=u.email, full_name=u.full_name, specialty=u.engineer_profile.specialty,
                    phone=u.engineer_profile.phone, availability=u.engineer_profile.availability,
                    open_tickets=open_ticket_count(db, u.id))
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
