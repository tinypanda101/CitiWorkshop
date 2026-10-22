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
    category_name: str  # their sub-specialty
    specialty: str
    availability: str
    open_tickets: int  # unfinished tickets assigned to them right now
    on_time_percent: int | None  # of their tickets resolved in the date range


class WorkloadRow(BaseModel):
    """One sub-specialty: unfinished tickets its engineers hold, out of what the on-duty ones can take."""

    category_name: str
    type: str  # facility / technology
    on_duty: int  # engineers who aren't Off duty
    used: int  # unfinished tickets assigned to this sub-specialty's engineers
    capacity: int  # on_duty x the ticket cap
    waiting: int  # Open tickets in this category with no engineer


class LocationRow(BaseModel):
    id: int | None  # None for "No seat given"
    label: str
    value: int


class LocationReport(BaseModel):
    """Ticket counts for one level: every building, one building's floors, or one floor's seats."""

    level: str  # buildings / floors / seats
    building_name: str | None = None
    floor_name: str | None = None
    rows: list[LocationRow]


class Averages(BaseModel):
    """Hours, or None when there is nothing to average yet."""

    hours_to_assign: float | None
    hours_to_resolve: float | None
    percent_on_time: int | None  # of the resolved tickets, how many were resolved within 3 days


class TicketList(BaseModel):
    """The first few tickets of a list, and how many there are altogether."""

    total: int
    tickets: list[TicketRow]


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


class AdminDashboard(BaseModel):
    role: str = "admin"
    # Tickets reported in the date range.
    total: int
    by_status: dict[str, int]
    averages: Averages
    categories: list[Bar]
    # Right now, whatever the date range.
    by_priority: list[Bar]  # unfinished tickets
    ticket_cap: int  # the most unfinished tickets auto-assign gives one engineer
    engineers: list[EngineerRow]
    workload: list[WorkloadRow]  # one per sub-specialty
    waiting_to_close: int  # Resolved but not Closed yet
    overdue: TicketList  # unfinished and past the deadline, most late first
    waiting: TicketList  # Open: no engineer yet
    blocked: TicketList
    pending_escalations: TicketList  # waiting for review, whatever the date range
    decided_escalations: TicketList  # approved / rejected, on tickets in the range
    submitted: EmployeeDashboard  # the tickets this admin submitted themselves
