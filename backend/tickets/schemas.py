"""What each tickets request must contain and what each reply returns."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator


def not_blank(value, message):
    value = value.strip()
    if not value:
        raise ValueError(message)
    return value


class TicketEdit(BaseModel):
    """The details the reporter fills in. Used when editing a ticket."""

    title: str
    description: str
    # Allowed to be empty here so check_location (router.py) can answer "Pick a building"
    # instead of "Input should be a valid integer". Only the seat is really optional.
    category_id: int | None = None
    building_id: int | None = None
    floor_id: int | None = None
    seat_code: str | None = None  # typed by the person, e.g. "HQ-201"; must be a seat on that floor

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        return not_blank(value, "Please enter a short title")

    @field_validator("description")
    @classmethod
    def clean_description(cls, value):
        return not_blank(value, "Please describe the problem")

    @field_validator("seat_code")
    @classmethod
    def clean_seat_code(cls, value):
        # Seat codes are saved in capitals; an empty box means "no seat".
        if value is None or not value.strip():
            return None
        return value.strip().upper()


class TicketAdminEdit(TicketEdit):
    """Admins can also change the priority to any level when editing."""

    priority: Literal["low", "medium", "high", "critical"] | None = None


class TicketIn(TicketEdit):
    """A new ticket. Employees can only pick Low or Medium; higher needs an escalation."""

    priority: Literal["low", "medium"] = "low"


class TicketOut(BaseModel):
    id: int
    number: str  # TKT-1001
    title: str
    description: str
    status: str
    priority: str
    category_id: int
    category_name: str
    category_type: str
    building_id: int
    building_name: str
    floor_id: int | None
    floor_name: str | None
    seat_id: int | None
    seat_code: str | None
    reporter_id: int
    reporter_name: str
    assignee_id: int | None
    assignee_name: str | None
    escalation_status: str
    blocked_reason: str | None
    resolution_summary: str | None
    created_at: datetime
    assigned_at: datetime | None
    resolved_at: datetime | None
    updated_at: datetime
