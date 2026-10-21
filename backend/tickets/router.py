"""
The tickets endpoints: submit, list (with search and filters), view, edit and delete.

Who sees what: employees see the tickets they reported, engineers also see the ones
assigned to them, admins see everything. A ticket you can't see answers "not found".
"""

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session

from _shared.database import get_db
from _shared.errors import AppError
from _shared.models import Building, Floor, Seat, Ticket, TicketCategory, User, ticket_number
from _shared.security import get_current_user, require_admin
from schemas import TicketAdminEdit, TicketIn, TicketOut

router = APIRouter()

Status = Literal["open", "in_progress", "blocked", "resolved", "closed"]
Priority = Literal["low", "medium", "high", "critical"]

# For "highest priority first": critical = 1 ... low = 4.
PRIORITY_ORDER = case({"critical": 1, "high": 2, "medium": 3, "low": 4}, value=Ticket.priority)


def visible_tickets(user):
    """A query for the tickets this user is allowed to see."""
    query = select(Ticket)
    if user.role == "engineer":
        return query.where(or_(Ticket.reporter_id == user.id, Ticket.assignee_id == user.id))
    if user.role != "admin":
        return query.where(Ticket.reporter_id == user.id)
    return query


def get_visible_ticket(db, user, ticket_id):
    ticket = db.scalar(visible_tickets(user).where(Ticket.id == ticket_id))
    if ticket is None:
        raise AppError(400, "not_found", "Ticket not found")
    return ticket


def check_location(db, body):
    """
    The category and building must exist, the floor must be in that building, and a typed
    seat code must be a seat on that floor. Returns the seat's id (None when no seat was typed).
    """
    errors = {}
    if body.category_id is None or db.get(TicketCategory, body.category_id) is None:
        errors["category_id"] = "Pick a category"
    if body.building_id is None or db.get(Building, body.building_id) is None:
        errors["building_id"] = "Pick a building"
    floor = db.get(Floor, body.floor_id) if body.floor_id is not None else None
    if floor is None or floor.building_id != body.building_id:
        errors["floor_id"] = "Pick a floor in this building"
    seat = None
    if body.seat_code and floor:
        seat = db.scalar(select(Seat).where(Seat.floor_id == floor.id, Seat.code == body.seat_code))
        if seat is None:
            errors["seat_code"] = f"There is no seat {body.seat_code} on {floor.name}"
    if errors:
        raise AppError(400, "validation_error", "Please check the highlighted fields", errors)
    return seat.id if seat else None


def ticket_out(ticket):
    return TicketOut(
        id=ticket.id,
        number=ticket_number(ticket.id),
        title=ticket.title,
        description=ticket.description,
        status=ticket.status,
        priority=ticket.priority,
        category_id=ticket.category_id,
        category_name=ticket.category.name,
        category_type=ticket.category.type,
        building_id=ticket.building_id,
        building_name=ticket.building.name,
        floor_id=ticket.floor_id,
        floor_name=ticket.floor.name if ticket.floor else None,
        seat_id=ticket.seat_id,
        seat_code=ticket.seat.code if ticket.seat else None,
        reporter_id=ticket.reporter_id,
        reporter_name=ticket.reporter.full_name,
        assignee_id=ticket.assignee_id,
        assignee_name=ticket.assignee.full_name if ticket.assignee else None,
        escalation_status=ticket.escalation_status,
        blocked_reason=ticket.blocked_reason,
        resolution_summary=ticket.resolution_summary,
        created_at=ticket.created_at,
        assigned_at=ticket.assigned_at,
        resolved_at=ticket.resolved_at,
        updated_at=ticket.updated_at,
    )


@router.get("/", response_model=list[TicketOut])
def list_tickets(
    q: str | None = None,
    status: Status | None = None,
    priority: Priority | None = None,
    category_id: int | None = None,
    building_id: int | None = None,
    floor_id: int | None = None,
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    sort: Literal["newest", "oldest", "priority"] = "newest",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = visible_tickets(user)

    if q and q.strip():
        text = q.strip()
        matches = [Ticket.title.ilike(f"%{text}%"), Ticket.description.ilike(f"%{text}%")]
        # "TKT-1001" or "1001" finds ticket id 1.
        number = text.upper().removeprefix("TKT-")
        if number.isdigit() and int(number) > 1000:
            matches.append(Ticket.id == int(number) - 1000)
        query = query.where(or_(*matches))

    if status:
        query = query.where(Ticket.status == status)
    if priority:
        query = query.where(Ticket.priority == priority)
    if category_id:
        query = query.where(Ticket.category_id == category_id)
    if building_id:
        query = query.where(Ticket.building_id == building_id)
    if floor_id:
        query = query.where(Ticket.floor_id == floor_id)
    if date_from:
        query = query.where(Ticket.created_at >= date_from)
    if date_to:
        # "to" includes that whole day.
        query = query.where(Ticket.created_at < date_to + timedelta(days=1))

    if sort == "oldest":
        query = query.order_by(Ticket.created_at, Ticket.id)
    elif sort == "priority":
        query = query.order_by(PRIORITY_ORDER, Ticket.created_at.desc())
    else:
        query = query.order_by(Ticket.created_at.desc(), Ticket.id.desc())

    return [ticket_out(t) for t in db.scalars(query)]


@router.post("/", response_model=TicketOut)
def create_ticket(body: TicketIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    seat_id = check_location(db, body)
    ticket = Ticket(**body.model_dump(exclude={"seat_code"}), seat_id=seat_id, reporter_id=user.id, status="open")
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ticket_out(get_visible_ticket(db, user, ticket_id))


@router.put("/{ticket_id}", response_model=TicketOut)
def edit_ticket(ticket_id: int, body: TicketAdminEdit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = get_visible_ticket(db, user, ticket_id)
    is_admin = user.role == "admin"
    reporter_can_edit = ticket.reporter_id == user.id and ticket.status == "open"
    if not is_admin and not reporter_can_edit:
        raise AppError(403, "forbidden", "You can only edit your own tickets while they are Open")
    if body.priority is not None and body.priority != ticket.priority and not is_admin:
        raise AppError(403, "forbidden", "Only Facility Admins can change the priority here")
    ticket.seat_id = check_location(db, body)
    # Leaving priority out (None) keeps the ticket's current priority.
    for field, value in body.model_dump(exclude={"seat_code"}, exclude_none=True).items():
        setattr(ticket, field, value)
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


@router.delete("/{ticket_id}")
def delete_ticket(ticket_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ticket = get_visible_ticket(db, admin, ticket_id)
    db.delete(ticket)  # its notes go too
    db.commit()
    return {"message": f"{ticket_number(ticket_id)} deleted"}
