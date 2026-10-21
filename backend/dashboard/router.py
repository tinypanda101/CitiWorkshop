"""
The dashboard: one endpoint, GET /, that answers with the view for your role.

- Facility Admin: tickets reported in the chosen date range, plus what needs attention right now
  (overdue, escalations, blocked, waiting for an engineer) and each engineer's workload.
- Engineer: the tickets assigned to them.
- Employee: the tickets they reported.

The numbers are worked out in Python from the ticket rows, so each one is easy to follow.
"""

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from _shared.assignment import MAX_OPEN_TICKETS
from _shared.database import get_db
from _shared.models import STATUSES, UNFINISHED, Ticket, TicketView, User, due_at, ticket_number
from _shared.security import get_current_user
from schemas import (
    AdminDashboard, Averages, Bar, EmployeeDashboard, EngineerDashboard, EngineerRow, MyTicketRow, TicketRow,
)

router = APIRouter()

PRIORITIES = ["critical", "high", "medium", "low"]
TOP = 5  # how many buildings / floors / seats to show


def location(ticket):
    return " · ".join(x for x in [ticket.building.name, ticket.floor.name if ticket.floor else None,
                                   ticket.seat.code if ticket.seat else None] if x)


def ticket_row(ticket):
    return TicketRow(
        id=ticket.id, number=ticket_number(ticket.id), title=ticket.title, status=ticket.status,
        priority=ticket.priority, location=location(ticket),
        category_name=ticket.category.name, category_type=ticket.category.type,
        assignee_name=ticket.assignee.full_name if ticket.assignee else None,
        blocked_reason=ticket.blocked_reason, requested_priority=ticket.requested_priority,
        escalation_status=ticket.escalation_status, escalation_reason=ticket.escalation_reason,
        created_at=ticket.created_at, due_at=due_at(ticket), assigned_at=ticket.assigned_at,
        resolved_at=ticket.resolved_at, updated_at=ticket.updated_at,
    )


def count_by_status(tickets):
    counts = Counter(t.status for t in tickets)
    return {status: counts[status] for status in STATUSES}


def count_by_priority(tickets):
    counts = Counter(t.priority for t in tickets)
    return [Bar(label=p.capitalize(), value=counts[p]) for p in PRIORITIES]


def top(counter, limit=TOP):
    return [Bar(label=label, value=value) for label, value in counter.most_common(limit)]


def average_hours(durations):
    durations = [d for d in durations if d is not None]
    if not durations:
        return None
    return round(sum(d.total_seconds() for d in durations) / len(durations) / 3600, 1)


def on_time_percent(tickets):
    """Of the tickets that have been resolved, how many were resolved by their deadline."""
    resolved = [t for t in tickets if t.resolved_at]
    if not resolved:
        return None
    return round(100 * sum(1 for t in resolved if t.resolved_at <= due_at(t)) / len(resolved))


def admin_dashboard(db, date_from, date_to):
    # Tickets reported in the date range: the tiles, response times, categories and locations.
    query = select(Ticket)
    if date_from:
        query = query.where(Ticket.created_at >= date_from)
    if date_to:
        query = query.where(Ticket.created_at < date_to + timedelta(days=1))  # "to" includes that day
    tickets = db.scalars(query.order_by(Ticket.created_at.desc())).all()

    # Unfinished work right now, whatever the date range: Needs attention and the workload bars.
    now = datetime.now(timezone.utc)
    unfinished = db.scalars(select(Ticket).where(Ticket.status.in_(UNFINISHED))).all()
    overdue = sorted((t for t in unfinished if due_at(t) < now), key=due_at)  # most late first
    waiting = sorted((t for t in unfinished if t.status == "open"),
                     key=lambda t: (PRIORITIES.index(t.priority), t.created_at))  # the order auto-assign uses
    blocked = sorted((t for t in unfinished if t.status == "blocked"), key=lambda t: t.updated_at)

    engineers = []
    for user in db.scalars(select(User).join(User.engineer_profile).where(User.is_active).order_by(User.full_name)):
        theirs = [t for t in tickets if t.assignee_id == user.id]
        engineers.append(EngineerRow(
            id=user.id, full_name=user.full_name, specialty=user.engineer_profile.specialty,
            availability=user.engineer_profile.availability,
            open_tickets=sum(1 for t in unfinished if t.assignee_id == user.id),
            on_time_percent=on_time_percent(theirs),
        ))

    categories = Counter((t.category.name, t.category.type) for t in tickets)

    # Escalations: every one waiting for review, plus those decided on tickets in the date range.
    pending = db.scalars(select(Ticket).where(Ticket.escalation_status == "pending").order_by(Ticket.updated_at)).all()
    decided = sorted((t for t in tickets if t.escalation_status in ("approved", "rejected")),
                     key=lambda t: t.updated_at, reverse=True)

    return AdminDashboard(
        total=len(tickets),
        by_status=count_by_status(tickets),
        by_priority=count_by_priority(unfinished),
        ticket_cap=MAX_OPEN_TICKETS,
        engineers=engineers,
        averages=Averages(
            hours_to_assign=average_hours([t.assigned_at - t.created_at for t in tickets if t.assigned_at]),
            hours_to_resolve=average_hours([t.resolved_at - t.created_at for t in tickets if t.resolved_at]),
            percent_on_time=on_time_percent(tickets),
        ),
        waiting_to_close=db.scalar(select(func.count()).select_from(Ticket).where(Ticket.status == "resolved")),
        categories=[Bar(label=name, type=kind, value=value) for (name, kind), value in categories.most_common()],
        top_buildings=top(Counter(t.building.name for t in tickets)),
        top_floors=top(Counter(f"{t.building.name} · {t.floor.name}" for t in tickets if t.floor)),
        top_seats=top(Counter(f"{t.seat.code} ({t.building.name})" for t in tickets if t.seat)),
        overdue=[ticket_row(t) for t in overdue],
        waiting=[ticket_row(t) for t in waiting],
        blocked=[ticket_row(t) for t in blocked],
        escalations=[ticket_row(t) for t in [*pending, *decided]],
    )


def news_since(ticket, seen_at, user_id):
    """What happened since this person last looked: a note from someone else, or a change."""
    if any(n.author_id != user_id and n.created_at > seen_at for n in ticket.notes):
        return "note"
    if ticket.updated_at > seen_at:
        return "update"
    return None


def with_news(db, user, tickets):
    """The tickets as rows, each with its news for this user (never looked at = since it was submitted)."""
    seen = {v.ticket_id: v.seen_at for v in db.scalars(select(TicketView).where(TicketView.user_id == user.id))}
    return [MyTicketRow(**ticket_row(t).model_dump(), news=news_since(t, seen.get(t.id, t.created_at), user.id))
            for t in tickets]


def submitted_view(db, user):
    """The tickets this person submitted: the employee dashboard and the engineer's second tab."""
    mine = db.scalars(select(Ticket).where(Ticket.reporter_id == user.id).order_by(Ticket.updated_at.desc())).all()
    rows = with_news(db, user, mine)
    # News first, then unfinished, then Resolved / Closed (each keeps newest change first).
    rows.sort(key=lambda r: (r.news is None, r.status not in UNFINISHED))
    return EmployeeDashboard(by_status=count_by_status(mine), tickets=rows)


def engineer_dashboard(db, user):
    assigned = db.scalars(select(Ticket).where(Ticket.assignee_id == user.id, Ticket.status != "closed")).all()
    now = datetime.now(timezone.utc)

    def working_order(row):
        # Resolved ones last; before them overdue first, then highest priority, then due soonest.
        overdue = row.due_at < now and row.status in UNFINISHED
        return (row.status == "resolved", not overdue, PRIORITIES.index(row.priority), row.due_at)

    counts = count_by_status(assigned)
    del counts["closed"]
    return EngineerDashboard(
        by_status=counts,
        assigned=sorted(with_news(db, user, assigned), key=working_order),
        submitted=submitted_view(db, user),
    )


def employee_dashboard(db, user):
    return submitted_view(db, user)


@router.get("/", response_model=AdminDashboard | EngineerDashboard | EmployeeDashboard)
def dashboard(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role == "admin":
        return admin_dashboard(db, date_from, date_to)
    if user.role == "engineer":
        return engineer_dashboard(db, user)
    return employee_dashboard(db, user)
