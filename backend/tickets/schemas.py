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
    """
    A new ticket. Admins and engineers can pick any priority. Employees can only pick Low or
    Medium (checked in the router), and can ask for High or Critical straight away by sending
    `requested_priority` with a reason: the ticket starts at Medium with that request pending.
    """

    priority: Literal["low", "medium", "high", "critical"] = "low"
    requested_priority: Literal["high", "critical"] | None = None
    escalation_reason: str | None = None


class AssignIn(BaseModel):
    """The engineer to assign, or None to unassign."""

    assignee_id: int | None = None


class StatusIn(BaseModel):
    """Moving a ticket. Blocked needs a reason, Resolved needs a summary (checked in the router)."""

    status: Literal["open", "assigned", "in_progress", "blocked", "resolved", "closed"]
    blocked_reason: str | None = None
    resolution_summary: str | None = None


class PriorityIn(BaseModel):
    priority: Literal["low", "medium", "high", "critical"]


class EscalationRequest(BaseModel):
    """An employee asking for High or Critical, with a reason."""

    requested_priority: Literal["high", "critical"]
    reason: str

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value):
        return not_blank(value, "Please say why it needs a higher priority")


class EscalationDecision(BaseModel):
    decision: Literal["approve", "reject"]


class NoteIn(BaseModel):
    body: str

    @field_validator("body")
    @classmethod
    def clean_body(cls, value):
        return not_blank(value, "Please write something")


class NoteOut(BaseModel):
    id: int
    ticket_id: int
    author_id: int
    author_name: str
    author_role: str
    body: str
    created_at: datetime
    updated_at: datetime


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
    reporter_email: str  # so the engineer can contact them
    assignee_id: int | None
    assignee_name: str | None
    escalation_status: str
    requested_priority: str | None
    escalation_reason: str | None
    blocked_reason: str | None
    resolution_summary: str | None
    created_at: datetime
    due_at: datetime  # 3 days after created_at
    assigned_at: datetime | None
    resolved_at: datetime | None
    updated_at: datetime


class TicketPage(BaseModel):
    """One page of the ticket list, and how many tickets match altogether."""

    tickets: list[TicketOut]
    total: int
