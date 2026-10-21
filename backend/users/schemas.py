"""What each users request must contain and what each reply returns."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Role = Literal["employee", "engineer", "admin"]
Specialty = Literal["facility", "technology"]
Availability = Literal["available", "busy", "off_duty"]


class AccountEdit(BaseModel):
    """What an admin can change on an account. Engineers also need a specialty."""

    full_name: str
    role: Role
    is_active: bool = True
    specialty: Specialty | None = None
    phone: str | None = None

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value):
        if not value.strip():
            raise ValueError("Please enter a name")
        return value.strip()

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value):
        # An empty phone box is saved as "no phone".
        if value is None or not value.strip():
            return None
        return value.strip()


class AccountCreate(AccountEdit):
    """A new account, made by an admin, with a starting password the person can change."""

    email: str
    password: str = Field(min_length=8)

    @field_validator("email")
    @classmethod
    def acme_email(cls, value):
        value = value.strip().lower()
        if not value.endswith("@acme.inc") or value == "@acme.inc":
            raise ValueError("Must be an @acme.inc email address")
        return value


class AccountOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    # Only filled in for engineers.
    specialty: str | None
    phone: str | None
    availability: str | None


class EngineerOut(BaseModel):
    id: int
    email: str
    full_name: str
    specialty: str
    phone: str | None
    availability: str
    open_tickets: int  # assigned to them and not Resolved or Closed yet


class AvailabilityIn(BaseModel):
    availability: Availability
