"""
The Tickets list: search, every filter, sorting and paging (25 a page by default).
"""

from datetime import datetime, timedelta, timezone

import pytest

from conftest import api, auth, category, db_date, make_building, make_user
from _shared.models import Ticket

NOW = datetime.now(timezone.utc)


@pytest.fixture
def tickets(db):
    """Five known tickets across two buildings, and an admin to list them."""
    reporter = make_user(db, name="Mary Smith")
    plumber = make_user(db, "engineer", name="Pat Plumb")
    hq = make_building(db, code="HQ", name="Head Office", floors=2)
    rt = make_building(db, code="RT", name="Riverside Tower", floors=1)
    rows = [
        # title, building, floor index, category, priority, status, assigned, days old, escalation
        ("Leaking tap in kitchen", hq, 0, "Plumbing", "low", "assigned", True, 0, "none"),
        ("Wi-Fi keeps dropping", hq, 1, "Network / Wi-Fi", "critical", "open", False, 1, "pending"),
        ("Printer jammed", rt, 0, "Printers / Scanners", "medium", "open", False, 5, "none"),
        ("Toilet will not flush", hq, 0, "Plumbing", "high", "in_progress", True, 6, "approved"),
        ("Old leak, fixed", rt, 0, "Plumbing", "medium", "closed", True, 30, "none"),
    ]
    made = {}
    for title, building, floor, cat, priority, status, assigned, days, escalation in rows:
        ticket = Ticket(title=title, description=f"Details about: {title.lower()}", category_id=category(db, cat).id,
                        building_id=building.id, floor_id=building.floors[floor].id, reporter_id=reporter.id,
                        priority=priority, status=status, created_at=NOW - timedelta(days=days, hours=1),
                        assignee_id=plumber.id if assigned else None, escalation_status=escalation)
        db.add(ticket)
        db.commit()
        made[title] = ticket.id
    return {"ids": made, "admin": make_user(db, "admin", name="Ada Admin"), "plumber": plumber, "hq": hq, "rt": rt}


def titles(tickets, query=""):
    reply = api("tickets").get(f"/?{query}", headers=auth(tickets["admin"])).json()
    return [t["title"] for t in reply["tickets"]]


def test_newest_first_by_default(tickets):
    assert titles(tickets) == ["Leaking tap in kitchen", "Wi-Fi keeps dropping", "Printer jammed",
                               "Toilet will not flush", "Old leak, fixed"]


def test_oldest_first(tickets):
    assert titles(tickets, "sort=oldest")[0] == "Old leak, fixed"


def test_highest_priority_first(tickets):
    assert titles(tickets, "sort=priority")[:2] == ["Wi-Fi keeps dropping", "Toilet will not flush"]


@pytest.mark.parametrize("q, expected", [
    ("leak", ["Leaking tap in kitchen", "Old leak, fixed"]),  # title, any case
    ("will not flush", ["Toilet will not flush"]),
    ("details about: printer", ["Printer jammed"]),  # description
    ("nothing like this", []),
])
def test_search_looks_in_title_and_description(tickets, q, expected):
    assert titles(tickets, f"q={q}") == expected


def test_search_by_ticket_number(tickets):
    ticket_id = tickets["ids"]["Printer jammed"]
    assert titles(tickets, f"q=TKT-{1000 + ticket_id}") == ["Printer jammed"]
    assert titles(tickets, f"q={1000 + ticket_id}") == ["Printer jammed"]


@pytest.mark.parametrize("query, expected", [
    ("status=open", ["Wi-Fi keeps dropping", "Printer jammed"]),
    ("priority=medium", ["Printer jammed", "Old leak, fixed"]),
    ("escalation=approved", ["Toilet will not flush"]),
    ("assigned_to=none", ["Wi-Fi keeps dropping", "Printer jammed"]),
    ("overdue=true", ["Printer jammed", "Toilet will not flush"]),  # unfinished and over 3 days old
    ("status=open&priority=critical", ["Wi-Fi keeps dropping"]),  # filters combine
])
def test_filters(tickets, query, expected):
    assert titles(tickets, query) == expected


def test_filter_by_category_building_floor_and_engineer(db, tickets):
    hq, plumber = tickets["hq"], tickets["plumber"]
    assert titles(tickets, f"category_id={category(db, 'Plumbing').id}&building_id={hq.id}") == \
        ["Leaking tap in kitchen", "Toilet will not flush"]
    assert titles(tickets, f"floor_id={hq.floors[1].id}") == ["Wi-Fi keeps dropping"]
    assert len(titles(tickets, f"assigned_to={plumber.id}")) == 3


def test_reported_date_range(db, tickets):
    assert titles(tickets, f"to={db_date(db, 10)}") == ["Old leak, fixed"]
    assert len(titles(tickets, f"from={db_date(db, 2)}")) == 2


def test_paging(db, tickets):
    reporter = make_user(db, name="Sam Lee")
    for n in range(30):
        db.add(Ticket(title=f"Extra {n}", description="More", category_id=category(db, "Cleaning").id,
                      building_id=tickets["hq"].id, floor_id=tickets["hq"].floors[0].id, reporter_id=reporter.id,
                      priority="low", status="open"))
    db.commit()
    first = api("tickets").get("/", headers=auth(tickets["admin"])).json()
    assert (len(first["tickets"]), first["total"]) == (25, 35)
    third = api("tickets").get("/?page=3&per_page=15", headers=auth(tickets["admin"])).json()
    assert (len(third["tickets"]), third["total"]) == (5, 35)


@pytest.mark.parametrize("query", ["per_page=101", "page=0", "status=finished", "sort=random"])
def test_bad_list_options_are_refused(tickets, query):
    assert api("tickets").get(f"/?{query}", headers=auth(tickets["admin"])).status_code == 400
