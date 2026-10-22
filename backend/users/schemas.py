"""What each users request must contain and what each reply returns."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from _shared.validation import check_email, check_person, check_phone

Role = Literal["employee", "engineer", "admin"]
Availability = Literal["available", "busy", "off_duty"]


class AccountEdit(BaseModel):
    """What an admin can change on an account. Engineers also need a sub-specialty (a ticket category)."""

    full_name: str
    role: Role
    is_active: bool = True
    category_id: int | None = None
    phone: str | None = None

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value):
        return check_person(value)

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        return check_phone(value)  # an empty phone box is saved as "no phone"


class AccountCreate(AccountEdit):
    """A new account, made by an admin, with a starting password the person can change."""

    email: str
    password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return check_email(value)


class AccountOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    # Only filled in for engineers.
    category_id: int | None  # their sub-specialty
    category_name: str | None
    specialty: str | None  # facility / technology, from the category
    phone: str | None
    availability: str | None


class EngineerOut(BaseModel):
    id: int
    email: str
    full_name: str
    category_id: int
    category_name: str
    specialty: str
    phone: str | None
    availability: str
    open_tickets: int  # assigned to them and not Resolved or Closed yet


class AccountPage(BaseModel):
    """One page of accounts, and how many match altogether."""

    accounts: list[AccountOut]
    total: int


class PasswordReset(BaseModel):
    """An admin setting a new password for the account with this email."""

    email: str
    new_password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return check_email(value)


class PasswordResetOut(BaseModel):
    full_name: str  # whose password was reset, so the admin can check it was the right person
    email: str


class AvailabilityIn(BaseModel):
    availability: Availability
