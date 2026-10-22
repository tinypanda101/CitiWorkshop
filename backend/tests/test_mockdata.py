"""
The mockdata Lambda (backend/mockdata): it refuses web requests, and run directly it fills the
database following the app's rules.
"""

import importlib.util
import sys

from sqlalchemy import func, select

from conftest import BACKEND, make_building
from _shared.models import UNFINISHED, Building, Ticket, TicketNote, User

sys.path.append(str(BACKEND / "mockdata"))  # for its `import mock_data`
spec = importlib.util.spec_from_file_location("mockdata_function", BACKEND / "mockdata" / "function.py")
mockdata = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mockdata)


def test_a_web_request_is_refused_and_changes_nothing(db):
    make_building(db)
    # What a request through CloudFront or the function URL looks like: it has requestContext.
    reply = mockdata.handler({"requestContext": {"http": {"method": "GET"}}, "rawPath": "/api/mockdata"}, None)
    assert reply["statusCode"] == 403
    db.expire_all()
    assert db.query(Building).count() == 1  # nothing was deleted


def test_run_directly_it_loads_data_that_follows_the_rules(db):
    loaded = mockdata.handler({}, None)["loaded"]
    assert loaded["tickets"] == 10_000 and loaded["buildings"] == 10
    db.expire_all()
    # Nobody holds more than 5 unfinished tickets.
    most = db.scalar(select(func.count()).where(Ticket.status.in_(UNFINISHED), Ticket.assignee_id.is_not(None))
                     .group_by(Ticket.assignee_id).order_by(func.count().desc()).limit(1))
    assert most <= 5
    # Times are in order, and no note comes before its ticket was assigned.
    assert db.scalar(select(func.count()).where(Ticket.assigned_at < Ticket.created_at)) == 0
    assert db.scalar(select(func.count()).where(Ticket.resolved_at < Ticket.assigned_at)) == 0
    assert db.scalar(select(func.count()).select_from(TicketNote).join(Ticket)
                     .where(TicketNote.created_at < Ticket.assigned_at)) == 0
    # The first admin is kept.
    assert db.scalar(select(User).where(User.email == "admin@acme.inc")) is not None
