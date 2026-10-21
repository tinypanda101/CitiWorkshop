"""What the dashboard replies with. Each role gets its own shape."""

from datetime import datetime

from pydantic import BaseModel


class Bar(BaseModel):
    """One row in a bar list, e.g. {"label": "High", "value": 4}."""

    label: str
    value: int
    type: str | None = None  # facility / technology, for categories


class TicketRow(BaseModel):
    """A ticket in a dashboard list."""

    id: int
    number: str
    title: str
    status: str
    priority: str
    location: str
    category_name: str
    category_type: str  # facility / technology
    assignee_name: str | None
    blocked_reason: str | None
    requested_priority: str | None
    escalation_status: str
    escalation_reason: str | None
    created_at: datetime
    due_at: datetime  # 3 days after created_at
    assigned_at: datetime | None
    resolved_at: datetime | None
    updated_at: datetime


class MyTicketRow(TicketRow):
    """A ticket with what's new since this person last looked at it."""

    news: str | None  # "note" (a new note from someone else), "update" (the ticket changed) or None


class EngineerRow(BaseModel):
    id: int
    full_name: str
    specialty: str
    availability: str
    open_tickets: int  # unfinished tickets assigned to them right now
    on_time_percent: int | None  # of their tickets resolved in the date range


class Averages(BaseModel):
    """Hours, or None when there is nothing to average yet."""

    hours_to_assign: float | None
    hours_to_resolve: float | None
    percent_on_time: int | None  # of the resolved tickets, how many were resolved within 3 days


class AdminDashboard(BaseModel):
    role: str = "admin"
    # Tickets reported in the date range.
    total: int
    by_status: dict[str, int]
    averages: Averages
    categories: list[Bar]
    top_buildings: list[Bar]
    top_floors: list[Bar]
    top_seats: list[Bar]
    # Right now, whatever the date range.
    by_priority: list[Bar]  # unfinished tickets
    ticket_cap: int  # the most unfinished tickets auto-assign gives one engineer
    engineers: list[EngineerRow]
    waiting_to_close: int  # Resolved but not Closed yet
    overdue: list[TicketRow]  # unfinished and past the deadline, most late first
    waiting: list[TicketRow]  # Open: no engineer yet
    blocked: list[TicketRow]
    escalations: list[TicketRow]  # waiting for review first, then approved / rejected in the range


class EmployeeDashboard(BaseModel):
    """The tickets someone submitted. Also the engineer's Submitted Tickets tab."""

    role: str = "employee"
    by_status: dict[str, int]
    tickets: list[MyTicketRow]


class EngineerDashboard(BaseModel):
    role: str = "engineer"
    by_status: dict[str, int]  # their assigned tickets that aren't Closed
    assigned: list[MyTicketRow]  # in working order: overdue, then priority, then due soonest
    submitted: EmployeeDashboard
