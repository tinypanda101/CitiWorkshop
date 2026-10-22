"""
The tickets endpoints: submit, list (with search and filters), view, edit, delete, assign,
the status workflow, priority, escalation requests and notes.

Who sees what: employees see the tickets they reported, engineers also see the ones
assigned to them, admins see everything. A ticket you can't see answers "not found".
"""

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from _shared.assignment import assign, assign_waiting_tickets, pick_engineer
from _shared.database import get_db
from _shared.errors import AppError
from _shared.models import (
    DUE_DAYS, UNFINISHED, Building, Floor, Seat, Ticket, TicketCategory, TicketNote, TicketView, User, due_at,
    ticket_number,
)
from _shared.security import get_current_user, require_admin
from schemas import (
    AssignIn, EscalationDecision, EscalationRequest, NoteIn, NoteOut, PriorityIn, StatusIn,
    TicketAdminEdit, TicketIn, TicketOut, TicketPage,
)

router = APIRouter()


@router.get("/ping")
def ping():
    """Answers straight away (no login, no database). The app calls it on opening to start this service up."""
    return {"ok": True}


Status = Literal["open", "assigned", "in_progress", "blocked", "resolved", "closed"]
Priority = Literal["low", "medium", "high", "critical"]

# For "highest priority first": critical = 1 ... low = 4.
PRIORITY_ORDER = case({"critical": 1, "high": 2, "medium": 3, "low": 4}, value=Ticket.priority)
PRIORITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}

# What a ticket in the list shows, loaded in a few batched queries instead of one per ticket.
ROW_OPTIONS = [selectinload(Ticket.category), selectinload(Ticket.building), selectinload(Ticket.floor),
               selectinload(Ticket.seat), selectinload(Ticket.reporter), selectinload(Ticket.assignee)]

# The status workflow for engineers: from each status, where they may move a ticket next.
# Open -> Assigned happens by assigning (automatically or by an admin), not by a status change.
# Admins can move any ticket to In Progress, Blocked, Resolved or Closed.
ENGINEER_MOVES = {
    "open": [],
    "assigned": ["in_progress"],
    "in_progress": ["blocked", "resolved"],
    "blocked": ["in_progress"],
    "resolved": ["in_progress", "closed"],
    "closed": [],
}


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
        reporter_email=ticket.reporter.email,
        assignee_id=ticket.assignee_id,
        assignee_name=ticket.assignee.full_name if ticket.assignee else None,
        escalation_status=ticket.escalation_status,
        requested_priority=ticket.requested_priority,
        escalation_reason=ticket.escalation_reason,
        blocked_reason=ticket.blocked_reason,
        resolution_summary=ticket.resolution_summary,
        created_at=ticket.created_at,
        due_at=due_at(ticket),
        assigned_at=ticket.assigned_at,
        resolved_at=ticket.resolved_at,
        updated_at=ticket.updated_at,
    )


@router.get("/", response_model=TicketPage)
def list_tickets(
    q: str | None = None,
    status: Status | None = None,
    priority: Priority | None = None,
    category_id: int | None = None,
    building_id: int | None = None,
    floor_id: int | None = None,
    assigned_to: str | None = None,  # an engineer's id, or "none" for unassigned
    escalation: Literal["pending", "approved", "rejected"] | None = None,
    overdue: bool = False,  # only unfinished tickets past their deadline
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    sort: Literal["newest", "oldest", "priority"] = "newest",
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
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
    if assigned_to == "none":
        query = query.where(Ticket.assignee_id.is_(None))
    elif assigned_to and assigned_to.isdigit():
        query = query.where(Ticket.assignee_id == int(assigned_to))
    if escalation:
        query = query.where(Ticket.escalation_status == escalation)
    if overdue:
        deadline = datetime.now(timezone.utc) - timedelta(days=DUE_DAYS)
        query = query.where(Ticket.status.in_(UNFINISHED), Ticket.created_at < deadline)
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

    # One page at a time, plus how many match altogether (for "1–50 of 9,812").
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    page_query = query.limit(per_page).offset((page - 1) * per_page).options(*ROW_OPTIONS)
    return TicketPage(tickets=[ticket_out(t) for t in db.scalars(page_query)], total=total)


@router.post("/", response_model=TicketOut, status_code=201)
def create_ticket(body: TicketIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    asking = user.role == "employee" and body.requested_priority is not None
    if user.role == "employee" and body.priority not in ("low", "medium"):
        raise AppError(400, "validation_error", "Employees can submit at Low or Medium",
                       {"priority": "Pick Low or Medium, or request High or Critical."})
    if asking and not (body.escalation_reason or "").strip():
        raise AppError(400, "validation_error", "Please check the highlighted fields",
                       {"escalation_reason": "Please say why it needs a higher priority"})
    seat_id = check_location(db, body)
    fields = body.model_dump(exclude={"seat_code", "requested_priority", "escalation_reason"})
    ticket = Ticket(**fields, seat_id=seat_id, reporter_id=user.id, status="open")
    if asking:  # starts at Medium, with the request waiting for an admin
        ticket.priority = "medium"
        start_escalation(ticket, body.requested_priority, body.escalation_reason.strip())
    db.add(ticket)
    db.flush()
    # Hand it (and anything else waiting) to an engineer straight away, if one can take it.
    assign_waiting_tickets(db)
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ticket_out(get_visible_ticket(db, user, ticket_id))


@router.put("/{ticket_id}", response_model=TicketOut)
def edit_ticket(ticket_id: int, body: TicketAdminEdit, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Only admins edit a ticket after it's submitted. Reporters can add notes or request a higher priority."""
    ticket = get_visible_ticket(db, admin, ticket_id)
    ticket.seat_id = check_location(db, body)
    # Leaving priority out (None) keeps the ticket's current priority.
    for field, value in body.model_dump(exclude={"seat_code"}, exclude_none=True).items():
        setattr(ticket, field, value)
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


@router.delete("/{ticket_id}", status_code=204)
def delete_ticket(ticket_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ticket = get_visible_ticket(db, admin, ticket_id)
    db.delete(ticket)  # its notes go too
    db.commit()


@router.put("/{ticket_id}/assignee", response_model=TicketOut)
def assign_ticket(ticket_id: int, body: AssignIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """
    An admin assigns an engineer by hand (they may go over the automatic cap), or unassigns
    with null. Assigning moves an Open ticket to Assigned; unassigning an unfinished one moves
    it back to Open, where it waits for the admin (it isn't handed out again automatically).
    """
    ticket = get_visible_ticket(db, admin, ticket_id)
    if body.assignee_id is None:
        ticket.assignee_id = None
        ticket.assigned_at = None
        if ticket.status in ("assigned", "in_progress", "blocked"):
            ticket.status = "open"
        db.flush()
        assign_waiting_tickets(db, skip_ticket_id=ticket.id)  # the engineer now has room for another
    elif body.assignee_id != ticket.assignee_id:
        engineer = db.get(User, body.assignee_id)
        if engineer is None or engineer.role != "engineer" or not engineer.is_active:
            raise AppError(400, "validation_error", "Please check the highlighted fields",
                           {"assignee_id": "Pick an active engineer"})
        assign(ticket, engineer)
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


# ---------- Status workflow ----------

@router.post("/{ticket_id}/auto-assign", response_model=TicketOut)
def auto_assign_ticket(ticket_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """
    The admin's Auto-assign button: gives the ticket to whoever auto-assign would pick (same
    sub-specialty, Available before Busy, never Off duty, under the cap, least busy first).
    """
    ticket = get_visible_ticket(db, admin, ticket_id)
    if ticket.status not in UNFINISHED:
        raise AppError(409, "finished", "This ticket is already resolved or closed")
    engineer = pick_engineer(db, ticket)
    if engineer is None:
        raise AppError(409, "nobody_free", f"Every {ticket.category.name} engineer is full or Off duty. "
                       "Pick someone from the list to go over the cap.")
    if engineer.id != ticket.assignee_id:
        assign(ticket, engineer)
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


def is_assigned_engineer(user, ticket):
    return user.role == "engineer" and ticket.assignee_id == user.id


@router.put("/{ticket_id}/status", response_model=TicketOut)
def change_status(ticket_id: int, body: StatusIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = get_visible_ticket(db, user, ticket_id)
    new = body.status
    if user.role != "admin":
        if not is_assigned_engineer(user, ticket):
            raise AppError(403, "forbidden", "Only the assigned engineer or a Facility Admin can change the status")
        if new not in ENGINEER_MOVES[ticket.status]:
            raise AppError(400, "not_allowed", "That isn't the next step in the workflow")
    if new == ticket.status:
        raise AppError(400, "not_allowed", "The ticket already has that status")
    if new in ("open", "assigned"):
        raise AppError(400, "not_allowed", "Assign or unassign an engineer to change that")

    # What each status needs before a ticket can move to it.
    if new in ("in_progress", "blocked") and ticket.assignee_id is None:
        raise AppError(400, "not_allowed", "Assign an engineer first")
    if new == "blocked":
        if not (body.blocked_reason or "").strip():
            raise AppError(400, "validation_error", "Please check the highlighted fields",
                           {"blocked_reason": "Please say what is blocking it"})
        ticket.blocked_reason = body.blocked_reason.strip()
    if new == "resolved":
        if not (body.resolution_summary or "").strip():
            raise AppError(400, "validation_error", "Please check the highlighted fields",
                           {"resolution_summary": "Please say what was done"})
        ticket.resolution_summary = body.resolution_summary.strip()
        ticket.resolved_at = datetime.now(timezone.utc)
    if new in ("in_progress", "blocked"):
        ticket.resolved_at = None  # reopened, so it isn't resolved any more

    ticket.status = new
    db.flush()
    if new in ("resolved", "closed"):
        assign_waiting_tickets(db)  # the engineer has room for another ticket
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


# ---------- Priority and escalation ----------

def start_escalation(ticket, requested_priority, reason):
    """Puts a request for a higher priority on the ticket, waiting for an admin to review it."""
    ticket.escalation_status = "pending"
    ticket.requested_priority = requested_priority
    ticket.escalation_reason = reason


def allowed_priorities(user, ticket):
    """
    The levels this user may set on this ticket. The reporter picks Low or Medium when
    submitting; after that they can only request a higher priority (an escalation).
    """
    if user.role == "admin" or is_assigned_engineer(user, ticket):
        return ["low", "medium", "high", "critical"]
    return []


@router.put("/{ticket_id}/priority", response_model=TicketOut)
def change_priority(ticket_id: int, body: PriorityIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = get_visible_ticket(db, user, ticket_id)
    allowed = allowed_priorities(user, ticket)
    if body.priority not in allowed:
        raise AppError(403, "forbidden", "You can't change this ticket's priority. Request a higher priority instead.")
    ticket.priority = body.priority
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


@router.post("/{ticket_id}/escalation", response_model=TicketOut)
def request_escalation(ticket_id: int, body: EscalationRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = get_visible_ticket(db, user, ticket_id)
    if ticket.reporter_id != user.id:
        raise AppError(403, "forbidden", "Only the person who reported the ticket can request an escalation")
    if ticket.escalation_status == "pending":
        raise AppError(409, "already_pending", "There is already a request waiting for an admin")
    if PRIORITY_RANK[body.requested_priority] <= PRIORITY_RANK[ticket.priority]:
        raise AppError(400, "validation_error", "Please check the highlighted fields",
                       {"requested_priority": "Pick a higher priority than the current one"})
    start_escalation(ticket, body.requested_priority, body.reason)
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


@router.put("/{ticket_id}/escalation", response_model=TicketOut)
def review_escalation(ticket_id: int, body: EscalationDecision, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    ticket = get_visible_ticket(db, admin, ticket_id)
    if ticket.escalation_status != "pending":
        raise AppError(409, "not_pending", "There is no request waiting on this ticket")
    if body.decision == "approve":
        ticket.escalation_status = "approved"
        ticket.priority = ticket.requested_priority
    else:
        ticket.escalation_status = "rejected"
    db.commit()
    db.refresh(ticket)
    return ticket_out(ticket)


# ---------- Seen (for the "new" markers on the employee dashboard) ----------

@router.post("/{ticket_id}/seen")
def mark_seen(ticket_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Remember that this user has just looked at the ticket."""
    ticket = get_visible_ticket(db, user, ticket_id)
    view = db.get(TicketView, (user.id, ticket.id)) or TicketView(user_id=user.id, ticket_id=ticket.id)
    view.seen_at = datetime.now(timezone.utc)
    db.add(view)
    db.commit()


# ---------- Notes ----------

def note_out(note):
    return NoteOut(id=note.id, ticket_id=note.ticket_id, author_id=note.author_id,
                   author_name=note.author.full_name, author_role=note.author.role,
                   body=note.body, created_at=note.created_at, updated_at=note.updated_at)


@router.get("/{ticket_id}/notes", response_model=list[NoteOut])
def list_notes(ticket_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = get_visible_ticket(db, user, ticket_id)
    return [note_out(n) for n in ticket.notes]  # oldest first (see Ticket.notes)


@router.post("/{ticket_id}/notes", response_model=NoteOut, status_code=201)
def add_note(ticket_id: int, body: NoteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = get_visible_ticket(db, user, ticket_id)
    # Anyone who can see it may add notes (reporter, assigned engineer, admin);
    # once Closed, only admins can.
    if ticket.status == "closed" and user.role != "admin":
        raise AppError(400, "not_allowed", "This ticket is closed, so notes can't be added")
    note = TicketNote(ticket_id=ticket.id, author_id=user.id, body=body.body)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note_out(note)


def get_own_note(db, user, note_id, admin_allowed):
    note = db.get(TicketNote, note_id)
    if note is None:
        raise AppError(400, "not_found", "Note not found")
    if note.author_id != user.id and not (admin_allowed and user.role == "admin"):
        raise AppError(403, "forbidden", "You can only change your own notes")
    return note


@router.put("/notes/{note_id}", response_model=NoteOut)
def edit_note(note_id: int, body: NoteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = get_own_note(db, user, note_id, admin_allowed=False)
    note.body = body.body
    db.commit()
    db.refresh(note)
    return note_out(note)


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    note = get_own_note(db, user, note_id, admin_allowed=True)
    db.delete(note)
    db.commit()
