"""
The dashboard: GET / answers with the view for your role, and GET /locations is the admin's
Locations report (one building, floor or seat level at a time).

- Facility Admin: tickets reported in the chosen date range, plus what needs attention right now
  (overdue, escalations, blocked, waiting for an engineer), the workload per sub-specialty, and
  the tickets they submitted themselves.
- Engineer: the tickets assigned to them.
- Employee: the tickets they reported.

The admin numbers are counted by the database (GROUP BY, COUNT, AVG), so the dashboard stays
quick with tens of thousands of tickets; only the short lists load actual ticket rows.
The engineer and employee views only ever load that person's own tickets.
"""

from collections import Counter
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from _shared.assignment import MAX_OPEN_TICKETS, PRIORITY_ORDER
from _shared.database import get_db
from _shared.models import (
    DUE_DAYS, STATUSES, UNFINISHED, Building, EngineerProfile, Floor, Seat, Ticket, TicketCategory, TicketView, User,
    due_at, ticket_number,
)
from _shared.errors import AppError
from _shared.security import get_current_user, require_admin
from schemas import (
    AdminDashboard, Averages, Bar, EmployeeDashboard, EngineerDashboard, EngineerRow, LocationReport, LocationRow,
    MyTicketRow, TicketList, TicketRow, WorkloadRow,
)

router = APIRouter()


@router.get("/ping")
def ping():
    """Answers straight away (no login, no database). The app calls it on opening to start this service up."""
    return {"ok": True}


PRIORITIES = ["critical", "high", "medium", "low"]
LIST_SIZE = 50  # the most tickets sent in each Needs attention list (the total is sent too)

# Load what a ticket row shows in a few batched queries, instead of one query per ticket.
ROW_OPTIONS = [selectinload(Ticket.building), selectinload(Ticket.floor), selectinload(Ticket.seat),
               selectinload(Ticket.category), selectinload(Ticket.assignee)]
NEWS_OPTIONS = [*ROW_OPTIONS, selectinload(Ticket.notes)]  # the employee and engineer lists also check notes


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


def percent(part, whole):
    return round(100 * part / whole) if whole else None


def hours(seconds):
    return round(seconds / 3600, 2) if seconds is not None else None


# ---------- Admin ----------

def range_filter(date_from, date_to):
    """The tickets reported in the date range, as conditions a query adds to its WHERE."""
    in_range = []
    if date_from:
        in_range.append(Ticket.created_at >= date_from)
    if date_to:
        in_range.append(Ticket.created_at < date_to + timedelta(days=1))  # "to" includes that day
    return in_range


def admin_dashboard(db, user, date_from, date_to):
    in_range = range_filter(date_from, date_to)
    now = datetime.now(timezone.utc)
    deadline = Ticket.created_at + timedelta(days=DUE_DAYS)
    unfinished = Ticket.status.in_(UNFINISHED)

    def grouped(*columns, where=(), joins=(), limit=None):
        """[(column values..., count)] for tickets matching `where`, biggest count first."""
        query = select(*columns, func.count()).select_from(Ticket)
        for join in joins:
            query = query.join(join)
        query = query.where(*where).group_by(*columns).order_by(func.count().desc())
        return db.execute(query.limit(limit)).all()

    def ticket_list(where, order):
        """The first LIST_SIZE matching tickets, and how many match altogether."""
        total = db.scalar(select(func.count()).select_from(Ticket).where(*where))
        rows = db.scalars(select(Ticket).where(*where).order_by(*order).limit(LIST_SIZE).options(*ROW_OPTIONS))
        return TicketList(total=total, tickets=[ticket_row(t) for t in rows])

    # Tiles: tickets in the range by status.
    status_counts = dict(grouped(Ticket.status, where=in_range))
    by_status = {status: status_counts.get(status, 0) for status in STATUSES}

    # Response times for tickets in the range. Postgres works out the averages in seconds.
    def average_seconds(later):
        return func.avg(func.extract("epoch", later - Ticket.created_at))

    assign_secs, resolve_secs, resolved, on_time = db.execute(
        select(average_seconds(Ticket.assigned_at), average_seconds(Ticket.resolved_at),
               func.count(Ticket.resolved_at), func.count().filter(Ticket.resolved_at <= deadline)).where(*in_range)
    ).one()

    # Engineers: unfinished right now, and on-time % for their tickets in the range.
    open_counts = dict(grouped(Ticket.assignee_id, where=[unfinished]))
    on_time_by = {engineer_id: (count, good) for engineer_id, count, good in db.execute(
        select(Ticket.assignee_id, func.count(), func.count().filter(Ticket.resolved_at <= deadline))
        .where(Ticket.resolved_at.is_not(None), *in_range).group_by(Ticket.assignee_id)
    )}
    engineers = []
    # Workload per sub-specialty: {category id: WorkloadRow}, every category, filled in below.
    waiting_counts = dict(grouped(Ticket.category_id, where=[Ticket.status == "open"]))
    workload = {c.id: WorkloadRow(category_name=c.name, type=c.type, on_duty=0, used=0, capacity=0,
                                  waiting=waiting_counts.get(c.id, 0))
                for c in db.scalars(select(TicketCategory).order_by(TicketCategory.type, TicketCategory.id))}
    for engineer in db.scalars(select(User).join(User.engineer_profile).where(User.is_active).order_by(User.full_name)
                               .options(selectinload(User.engineer_profile).selectinload(EngineerProfile.category))):
        profile = engineer.engineer_profile
        count, good = on_time_by.get(engineer.id, (0, 0))
        engineers.append(EngineerRow(
            id=engineer.id, full_name=engineer.full_name, category_name=profile.category.name,
            specialty=profile.specialty, availability=profile.availability,
            open_tickets=open_counts.get(engineer.id, 0), on_time_percent=percent(good, count),
        ))
        row = workload[profile.category_id]
        row.used += open_counts.get(engineer.id, 0)
        if profile.availability != "off_duty":
            row.on_duty += 1
            row.capacity += MAX_OPEN_TICKETS

    priority_counts = dict(grouped(Ticket.priority, where=[unfinished]))
    pending = Ticket.escalation_status == "pending"
    decided = Ticket.escalation_status.in_(["approved", "rejected"])

    return AdminDashboard(
        total=sum(by_status.values()),
        by_status=by_status,
        averages=Averages(hours_to_assign=hours(assign_secs), hours_to_resolve=hours(resolve_secs),
                          percent_on_time=percent(on_time, resolved)),
        categories=[Bar(label=name, type=kind, value=n) for name, kind, n in
                    grouped(TicketCategory.name, TicketCategory.type, joins=[Ticket.category], where=in_range)],
        by_priority=[Bar(label=p.capitalize(), value=priority_counts.get(p, 0)) for p in PRIORITIES],
        ticket_cap=MAX_OPEN_TICKETS,
        engineers=engineers,
        workload=list(workload.values()),
        waiting_to_close=db.scalar(select(func.count()).select_from(Ticket).where(Ticket.status == "resolved")),
        overdue=ticket_list([unfinished, deadline < now], [Ticket.created_at]),  # most late first
        waiting=ticket_list([Ticket.status == "open"], [PRIORITY_ORDER, Ticket.created_at]),  # auto-assign's order
        blocked=ticket_list([Ticket.status == "blocked"], [Ticket.updated_at]),  # longest first
        pending_escalations=ticket_list([pending], [Ticket.updated_at]),
        decided_escalations=ticket_list([decided, *in_range], [Ticket.updated_at.desc()]),
        submitted=submitted_view(db, user),
    )


def location_report(db, date_from, date_to, building_id, floor_id):
    """
    Tickets per location for the Locations report, one level at a time: every building, then
    (with building_id) that building's floors, then (with floor_id too) that floor's seats.
    """
    in_range = range_filter(date_from, date_to)

    def count_by(*columns, join, where):
        query = (select(*columns, func.count(Ticket.id)).select_from(Ticket).outerjoin(join)
                 .where(*in_range, *where).group_by(*columns).order_by(func.count(Ticket.id).desc()))
        return [LocationRow(id=item_id, label=label or "No seat given", value=n) for item_id, label, n in db.execute(query)]

    if building_id is None:
        rows = count_by(Building.id, Building.name, join=Ticket.building, where=[])
        return LocationReport(level="buildings", rows=rows)
    building = db.get(Building, building_id)
    if building is None:
        raise AppError(400, "not_found", "Building not found")
    if floor_id is None:
        rows = count_by(Floor.id, Floor.name, join=Ticket.floor, where=[Ticket.building_id == building_id])
        return LocationReport(level="floors", building_name=building.name, rows=rows)
    floor = db.get(Floor, floor_id)
    if floor is None or floor.building_id != building_id:
        raise AppError(400, "not_found", "Floor not found")
    rows = count_by(Seat.id, Seat.code, join=Ticket.seat, where=[Ticket.floor_id == floor_id])
    return LocationReport(level="seats", building_name=building.name, floor_name=floor.name, rows=rows)


# ---------- Engineer and employee ----------

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
    mine = db.scalars(select(Ticket).where(Ticket.reporter_id == user.id).order_by(Ticket.updated_at.desc())
                      .options(*NEWS_OPTIONS)).all()
    rows = with_news(db, user, mine)
    # News first, then unfinished, then Resolved / Closed (each keeps newest change first).
    rows.sort(key=lambda r: (r.news is None, r.status not in UNFINISHED))
    return EmployeeDashboard(by_status=count_by_status(mine), tickets=rows)


def engineer_dashboard(db, user):
    assigned = db.scalars(select(Ticket).where(Ticket.assignee_id == user.id, Ticket.status != "closed")
                          .options(*NEWS_OPTIONS)).all()
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
        return admin_dashboard(db, user, date_from, date_to)
    if user.role == "engineer":
        return engineer_dashboard(db, user)
    return employee_dashboard(db, user)


@router.get("/locations", response_model=LocationReport)
def locations(
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    building_id: int | None = None,
    floor_id: int | None = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return location_report(db, date_from, date_to, building_id, floor_id)
