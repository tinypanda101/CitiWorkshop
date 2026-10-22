"""
The dashboards: with a handful of known tickets, every number the admin sees is exactly right,
and employees and engineers only see their own tickets.
"""

from datetime import datetime, timedelta, timezone

import pytest

from conftest import api, auth, category, db_date, make_building, make_user
from _shared.models import Ticket

NOW = datetime.now(timezone.utc)


def add_ticket(db, reporter, building, status, assignee=None, category_name="Plumbing", priority="medium",
               created_days_ago=0.0, resolved_after_hours=None, floor=0, seat=None, **extra):
    created = NOW - timedelta(days=created_days_ago)
    floor_row = building.floors[floor]
    ticket = Ticket(title=f"{status} ticket", description="A known ticket", category_id=category(db, category_name).id,
                    building_id=building.id, floor_id=floor_row.id, seat_id=floor_row.seats[seat].id if seat is not None else None,
                    reporter_id=reporter.id, status=status, priority=priority, created_at=created,
                    assignee_id=assignee.id if assignee else None,
                    assigned_at=created + timedelta(hours=1) if assignee else None,
                    resolved_at=created + timedelta(hours=resolved_after_hours) if resolved_after_hours else None, **extra)
    db.add(ticket)
    db.commit()
    return ticket


@pytest.fixture
def known(db):
    """
    Eight tickets in Head Office (and one in Riverside Tower):
    open x2 (one 5 days old, so overdue), assigned, in_progress (4 days old: overdue), blocked,
    resolved (on time, after 10 hours), closed x2 (one on time after 20 hours, one late after 100 hours).
    """
    reporter = make_user(db, "employee", name="Mary Smith")
    plumber = make_user(db, "engineer", name="Pat Plumb")
    cleaner = make_user(db, "engineer", name="Cleo Clean", category_name="Cleaning", availability="off_duty")
    hq = make_building(db, code="HQ", name="Head Office", floors=2, seats=2)
    rt = make_building(db, code="RT", name="Riverside Tower", floors=1, seats=1)
    add_ticket(db, reporter, hq, "open", priority="high", created_days_ago=5)
    add_ticket(db, reporter, hq, "open", category_name="Cleaning", priority="low")
    add_ticket(db, reporter, hq, "assigned", plumber, priority="critical", seat=0)
    add_ticket(db, reporter, hq, "in_progress", plumber, created_days_ago=4, seat=0)
    add_ticket(db, reporter, hq, "blocked", plumber, floor=1, blocked_reason="Waiting for a part")
    add_ticket(db, reporter, hq, "resolved", plumber, resolved_after_hours=10, created_days_ago=1)
    add_ticket(db, reporter, hq, "closed", plumber, resolved_after_hours=20, created_days_ago=2, floor=1)
    add_ticket(db, reporter, rt, "closed", plumber, category_name="Cleaning", resolved_after_hours=100, created_days_ago=6)
    return {"reporter": reporter, "plumber": plumber, "cleaner": cleaner, "hq": hq, "rt": rt,
            "admin": make_user(db, "admin", name="Ada Admin")}


def admin_view(known, query=""):
    response = api("dashboard").get(f"/{query}", headers=auth(known["admin"]))
    assert response.status_code == 200, response.text
    return response.json()


def test_counts_by_status(known):
    data = admin_view(known)
    assert data["total"] == 8
    assert data["by_status"] == {"open": 2, "assigned": 1, "in_progress": 1, "blocked": 1, "resolved": 1, "closed": 2}


def test_the_date_range_only_counts_tickets_reported_in_it(known, db):
    # Up to 3 days ago: only the tickets made 4, 5 and 6 days ago.
    data = admin_view(known, f"?to={db_date(db, 3)}")
    assert data["total"] == 3
    assert data["by_status"] == {"open": 1, "assigned": 0, "in_progress": 1, "blocked": 0, "resolved": 0, "closed": 1}
    # From today: only the ones made today (open, assigned, blocked).
    assert admin_view(known, f"?from={db_date(db, 0)}")["total"] == 3


def test_needs_attention_lists(known):
    data = admin_view(known)
    assert data["overdue"]["total"] == 2  # the 5-day-old open one and the 4-day-old in-progress one
    assert [t["status"] for t in data["overdue"]["tickets"]] == ["open", "in_progress"]  # most late first
    assert data["waiting"]["total"] == 2
    assert [t["priority"] for t in data["waiting"]["tickets"]] == ["high", "low"]  # the order auto-assign uses
    assert data["blocked"]["total"] == 1
    assert data["blocked"]["tickets"][0]["blocked_reason"] == "Waiting for a part"
    assert data["waiting_to_close"] == 1


def test_unfinished_by_priority(known):
    bars = {bar["label"]: bar["value"] for bar in admin_view(known)["by_priority"]}
    assert bars == {"Critical": 1, "High": 1, "Medium": 2, "Low": 1}


def test_response_times(known):
    averages = admin_view(known)["averages"]
    assert averages["hours_to_assign"] == 1.0  # every assigned ticket was assigned after 1 hour
    assert averages["hours_to_resolve"] == pytest.approx((10 + 20 + 100) / 3, abs=0.01)
    assert averages["percent_on_time"] == 67  # 2 of the 3 resolved within 3 days


def test_workload_per_sub_specialty(known):
    workload = {w["category_name"]: w for w in admin_view(known)["workload"]}
    assert len(workload) == 8  # every sub-specialty, even with no engineers
    plumbing, cleaning = workload["Plumbing"], workload["Cleaning"]
    # Pat holds assigned + in_progress + blocked = 3, out of 1 on-duty engineer x 5.
    assert (plumbing["used"], plumbing["capacity"], plumbing["on_duty"], plumbing["waiting"]) == (3, 5, 1, 1)
    # Cleo is Off duty: no capacity, and the Cleaning ticket waits.
    assert (cleaning["used"], cleaning["capacity"], cleaning["on_duty"], cleaning["waiting"]) == (0, 0, 0, 1)


def test_engineer_rows(known):
    rows = {e["full_name"]: e for e in admin_view(known)["engineers"]}
    assert rows["Pat Plumb"]["open_tickets"] == 3
    assert rows["Pat Plumb"]["on_time_percent"] == 67
    assert rows["Cleo Clean"]["on_time_percent"] is None  # nothing resolved yet


def test_categories(known):
    bars = {bar["label"]: (bar["value"], bar["type"]) for bar in admin_view(known)["categories"]}
    assert bars == {"Plumbing": (6, "facility"), "Cleaning": (2, "facility")}


def test_locations_drill_down_adds_up(known):
    headers = auth(known["admin"])
    buildings = api("dashboard").get("/locations", headers=headers).json()
    assert buildings["level"] == "buildings"
    assert [(r["label"], r["value"]) for r in buildings["rows"]] == [("Head Office", 7), ("Riverside Tower", 1)]

    hq = known["hq"]
    floors = api("dashboard").get(f"/locations?building_id={hq.id}", headers=headers).json()
    assert (floors["level"], floors["building_name"]) == ("floors", "Head Office")
    assert sum(r["value"] for r in floors["rows"]) == 7
    assert {r["label"]: r["value"] for r in floors["rows"]} == {"Floor 1": 5, "Floor 2": 2}

    seats = api("dashboard").get(f"/locations?building_id={hq.id}&floor_id={hq.floors[0].id}", headers=headers).json()
    assert {r["label"]: r["value"] for r in seats["rows"]} == {"No seat given": 3, "HQ-1-01": 2}


def test_locations_refuses_a_floor_from_another_building(known):
    response = api("dashboard").get(f"/locations?building_id={known['hq'].id}&floor_id={known['rt'].floors[0].id}",
                                    headers=auth(known["admin"]))
    assert response.status_code == 400


def test_the_admins_own_submitted_tickets(known, db):
    admin = known["admin"]
    add_ticket(db, admin, known["hq"], "open", category_name="Cleaning")
    submitted = admin_view(known)["submitted"]
    assert len(submitted["tickets"]) == 1
    assert submitted["tickets"][0]["status"] == "open"


# ---------- Engineer and employee ----------

def test_the_engineer_sees_only_their_unclosed_tickets_in_working_order(known):
    data = api("dashboard").get("/", headers=auth(known["plumber"])).json()
    assert data["role"] == "engineer"
    # Overdue first, then highest priority; Resolved last; Closed not shown.
    assert [t["status"] for t in data["assigned"]] == ["in_progress", "assigned", "blocked", "resolved"]
    assert data["by_status"] == {"open": 0, "assigned": 1, "in_progress": 1, "blocked": 1, "resolved": 1}


def test_an_employee_sees_only_their_own_tickets(known, db):
    other = make_user(db, name="Sam Lee")
    add_ticket(db, other, known["hq"], "open")
    mine = api("dashboard").get("/", headers=auth(other)).json()
    assert mine["role"] == "employee"
    assert [t["title"] for t in mine["tickets"]] == ["open ticket"]
    assert sum(mine["by_status"].values()) == 1


def test_a_note_from_the_engineer_shows_as_news_until_the_reporter_looks(known):
    reporter, plumber = known["reporter"], known["plumber"]
    tickets = api("dashboard").get("/", headers=auth(reporter)).json()["tickets"]
    assigned = next(t for t in tickets if t["status"] == "assigned")
    api("tickets").post(f"/{assigned['id']}/seen", headers=auth(reporter))
    before = next(t for t in api("dashboard").get("/", headers=auth(reporter)).json()["tickets"] if t["id"] == assigned["id"])
    assert before["news"] is None

    api("tickets").post(f"/{assigned['id']}/notes", json={"body": "On my way"}, headers=auth(plumber))
    after = next(t for t in api("dashboard").get("/", headers=auth(reporter)).json()["tickets"] if t["id"] == assigned["id"])
    assert after["news"] == "note"

    api("tickets").post(f"/{assigned['id']}/seen", headers=auth(reporter))
    seen = next(t for t in api("dashboard").get("/", headers=auth(reporter)).json()["tickets"] if t["id"] == assigned["id"])
    assert seen["news"] is None
