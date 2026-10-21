"""
Automatic assignment: every ticket goes to an engineer as soon as one can take it.

Who gets a ticket: an active engineer whose specialty matches the ticket's category type
(facility or technology), who is Available (or else Busy, never Off duty) and has fewer than
MAX_OPEN_TICKETS unfinished tickets. Among those, the one with the fewest; on a tie, the one
who was given a ticket longest ago.

If nobody fits, the ticket stays Open (waiting). assign_waiting_tickets() hands waiting
tickets out, highest priority first, then oldest, whenever a slot might have opened up.
The callers commit.
"""

from datetime import datetime, timezone

from sqlalchemy import case, func, select

from _shared.models import UNFINISHED, EngineerProfile, Ticket, User

MAX_OPEN_TICKETS = 5  # the most unfinished tickets an engineer is given automatically

AVAILABILITY_ORDER = {"available": 0, "busy": 1}  # off_duty engineers get nothing
PRIORITY_ORDER = case({"critical": 1, "high": 2, "medium": 3, "low": 4}, value=Ticket.priority)
LONG_AGO = datetime(2000, 1, 1, tzinfo=timezone.utc)


def assign(ticket, engineer):
    """Give the ticket to this engineer. An Open ticket becomes Assigned."""
    ticket.assignee_id = engineer.id
    ticket.assigned_at = datetime.now(timezone.utc)
    if ticket.status == "open":
        ticket.status = "assigned"


def pick_engineer(db, ticket):
    """The engineer who should get this ticket now, or None if nobody can take it."""
    engineers = db.scalars(
        select(User).join(User.engineer_profile).where(
            User.is_active,
            EngineerProfile.specialty == ticket.category.type,
            EngineerProfile.availability.in_(list(AVAILABILITY_ORDER)),
        )
    ).all()

    best, best_key = None, None
    for engineer in engineers:
        unfinished = db.scalar(select(func.count()).select_from(Ticket).where(
            Ticket.assignee_id == engineer.id, Ticket.status.in_(UNFINISHED)))
        if unfinished >= MAX_OPEN_TICKETS:
            continue
        last_given = db.scalar(select(func.max(Ticket.assigned_at)).where(Ticket.assignee_id == engineer.id)) or LONG_AGO
        key = (AVAILABILITY_ORDER[engineer.engineer_profile.availability], unfinished, last_given)
        if best_key is None or key < best_key:
            best, best_key = engineer, key
    return best


def assign_waiting_tickets(db, skip_ticket_id=None):
    """
    Hand out waiting (Open, unassigned) tickets to whoever can take them.
    `skip_ticket_id`: a ticket an admin just unassigned on purpose, which waits for them.
    """
    waiting = db.scalars(
        select(Ticket).where(Ticket.status == "open", Ticket.assignee_id.is_(None))
        .order_by(PRIORITY_ORDER, Ticket.created_at)
    ).all()
    for ticket in waiting:
        if ticket.id == skip_ticket_id:
            continue
        engineer = pick_engineer(db, ticket)
        if engineer:
            assign(ticket, engineer)
            db.flush()  # so the next pick counts this ticket
