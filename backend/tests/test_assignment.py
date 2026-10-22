"""
Auto-assign: a ticket goes to an engineer whose sub-specialty is the ticket's category,
Available before Busy, never Off duty or deactivated, under the 5-ticket cap, fewest
unfinished tickets first. If nobody fits it waits in Open, and waiting tickets are handed
out highest priority first as soon as someone has room.
"""

from datetime import datetime, timedelta, timezone

import pytest

from conftest import api, auth, category, error, make_building, make_user, submit
from _shared.assignment import MAX_OPEN_TICKETS
from _shared.models import Ticket


@pytest.fixture
def place(db):
    """A reporter and a building to submit tickets from."""
    return make_user(db, "employee", name="Mary Smith"), make_building(db)


def give(db, engineer, count, building, reporter, status="in_progress", assigned_at=None):
    """Gives the engineer `count` unfinished Plumbing tickets directly (no auto-assign)."""
    for _ in range(count):
        db.add(Ticket(title="Old job", description="Already being worked on", category_id=category(db, "Plumbing").id,
                      building_id=building.id, floor_id=building.floors[0].id, reporter_id=reporter.id,
                      status=status, priority="medium", assignee_id=engineer.id,
                      assigned_at=assigned_at or datetime.now(timezone.utc)))
    db.commit()


def test_goes_to_an_engineer_with_the_matching_sub_specialty(db, place):
    reporter, building = place
    make_user(db, "engineer", name="Cleo Clean", category_name="Cleaning")
    plumber = make_user(db, "engineer", name="Pat Plumb", category_name="Plumbing")
    assert submit(db, reporter, building, category_name="Plumbing")["assignee_id"] == plumber.id


def test_no_one_with_the_sub_specialty_means_it_waits_in_open(db, place):
    reporter, building = place
    make_user(db, "engineer", name="Cleo Clean", category_name="Cleaning")
    t = submit(db, reporter, building, category_name="Plumbing")
    assert (t["status"], t["assignee_id"]) == ("open", None)


def test_least_busy_engineer_gets_it(db, place):
    reporter, building = place
    busy = make_user(db, "engineer", name="Bo Busy")
    free = make_user(db, "engineer", name="Fay Free")
    give(db, busy, 3, building, reporter)
    give(db, free, 1, building, reporter)
    assert submit(db, reporter, building)["assignee_id"] == free.id


def test_a_tie_goes_to_whoever_waited_longest_for_a_ticket(db, place):
    reporter, building = place
    recent = make_user(db, "engineer", name="Rae Recent")
    waited = make_user(db, "engineer", name="Wes Waited")
    now = datetime.now(timezone.utc)
    give(db, recent, 1, building, reporter, assigned_at=now - timedelta(minutes=5))
    give(db, waited, 1, building, reporter, assigned_at=now - timedelta(days=2))
    assert submit(db, reporter, building)["assignee_id"] == waited.id


def test_available_comes_before_busy_even_with_more_tickets(db, place):
    reporter, building = place
    busy_status = make_user(db, "engineer", name="Bo Busy", availability="busy")
    available = make_user(db, "engineer", name="Ava Able")
    give(db, available, 3, building, reporter)  # busy_status has none, but is Busy
    assert submit(db, reporter, building)["assignee_id"] == available.id


def test_busy_is_used_when_no_one_is_available(db, place):
    reporter, building = place
    busy_status = make_user(db, "engineer", name="Bo Busy", availability="busy")
    full = make_user(db, "engineer", name="Fu Full")
    give(db, full, MAX_OPEN_TICKETS, building, reporter)
    assert submit(db, reporter, building)["assignee_id"] == busy_status.id


@pytest.mark.parametrize("who", ["off_duty", "deactivated"])
def test_off_duty_and_deactivated_engineers_are_never_picked(db, place, who):
    reporter, building = place
    if who == "off_duty":
        make_user(db, "engineer", name="Otto Off", availability="off_duty")
    else:
        make_user(db, "engineer", name="Dee Gone", active=False)
    assert submit(db, reporter, building)["status"] == "open"


def test_the_cap_is_never_passed(db, place):
    reporter, building = place
    plumber = make_user(db, "engineer", name="Pat Plumb")
    tickets = [submit(db, reporter, building) for _ in range(MAX_OPEN_TICKETS + 2)]
    assert [t["assignee_id"] for t in tickets].count(plumber.id) == MAX_OPEN_TICKETS
    assert [t["status"] for t in tickets[MAX_OPEN_TICKETS:]] == ["open", "open"]


def test_resolved_and_closed_tickets_dont_count_towards_the_cap(db, place):
    reporter, building = place
    plumber = make_user(db, "engineer", name="Pat Plumb")
    give(db, plumber, MAX_OPEN_TICKETS, building, reporter, status="resolved")
    assert submit(db, reporter, building)["assignee_id"] == plumber.id


def test_when_a_slot_opens_the_highest_priority_waiting_ticket_goes_first(db, place):
    reporter, building = place
    admin = make_user(db, "admin", name="Ada Admin")
    plumber = make_user(db, "engineer", name="Pat Plumb")
    give(db, plumber, MAX_OPEN_TICKETS, building, reporter)
    low = submit(db, reporter, building, title="Low one", priority="low")
    medium = submit(db, reporter, building, title="Medium one", priority="medium")
    critical = submit(db, admin, building, title="Critical one", priority="critical")
    assert {low["status"], medium["status"], critical["status"]} == {"open"}

    # The plumber resolves one of their old tickets: a slot opens.
    old = db.query(Ticket).filter_by(assignee_id=plumber.id, title="Old job").first()
    response = api("tickets").put(f"/{old.id}/status", json={"status": "resolved", "resolution_summary": "Done"},
                                  headers=auth(plumber))
    assert response.status_code == 200
    db.expire_all()
    statuses = {t.title: (t.status, t.assignee_id) for t in db.query(Ticket).filter(Ticket.title.like("% one"))}
    assert statuses["Critical one"] == ("assigned", plumber.id)
    assert statuses["Medium one"][0] == statuses["Low one"][0] == "open"


def test_an_engineer_coming_on_duty_picks_up_waiting_tickets(db, place):
    reporter, building = place
    plumber = make_user(db, "engineer", name="Pat Plumb", availability="off_duty")
    t = submit(db, reporter, building)
    assert t["status"] == "open"
    response = api("users").put("/engineers/me/availability", json={"availability": "available"}, headers=auth(plumber))
    assert response.status_code == 200
    db.expire_all()
    assert db.get(Ticket, t["id"]).assignee_id == plumber.id


def test_an_admin_can_assign_by_hand_past_the_cap(db, place):
    reporter, building = place
    admin = make_user(db, "admin", name="Ada Admin")
    plumber = make_user(db, "engineer", name="Pat Plumb")
    give(db, plumber, MAX_OPEN_TICKETS, building, reporter)
    t = submit(db, reporter, building)
    response = api("tickets").put(f"/{t['id']}/assignee", json={"assignee_id": plumber.id}, headers=auth(admin))
    assert (response.json()["status"], response.json()["assignee_id"]) == ("assigned", plumber.id)


def test_a_ticket_an_admin_unassigned_isnt_handed_straight_back(db, place):
    reporter, building = place
    admin = make_user(db, "admin", name="Ada Admin")
    make_user(db, "engineer", name="Pat Plumb")
    t = submit(db, reporter, building)
    response = api("tickets").put(f"/{t['id']}/assignee", json={"assignee_id": None}, headers=auth(admin))
    assert (response.json()["status"], response.json()["assignee_id"]) == ("open", None)


# ---------- The Auto-assign button ----------

def test_auto_assign_button_picks_the_least_busy_match(db, place):
    reporter, building = place
    admin = make_user(db, "admin", name="Ada Admin")
    t = submit(db, reporter, building)  # nobody yet, so it waits
    # Engineers added straight to the database (not through the API) don't trigger auto-assign,
    # so the ticket is still waiting for the button.
    busy = make_user(db, "engineer", name="Bo Busy")
    free = make_user(db, "engineer", name="Fay Free")
    give(db, busy, 2, building, reporter)
    response = api("tickets").post(f"/{t['id']}/auto-assign", headers=auth(admin))
    assert response.status_code == 200
    assert response.json()["assignee_id"] == free.id


def test_auto_assign_button_says_when_nobody_is_free(db, place):
    reporter, building = place
    admin = make_user(db, "admin", name="Ada Admin")
    full = make_user(db, "engineer", name="Fu Full")
    give(db, full, MAX_OPEN_TICKETS, building, reporter)
    t = submit(db, reporter, building)
    response = api("tickets").post(f"/{t['id']}/auto-assign", headers=auth(admin))
    assert response.status_code == 409
    assert error(response)["code"] == "nobody_free"
    assert "Plumbing" in error(response)["message"]


def test_auto_assign_button_refuses_a_finished_ticket(db, place):
    reporter, building = place
    admin = make_user(db, "admin", name="Ada Admin")
    t = submit(db, reporter, building)
    api("tickets").put(f"/{t['id']}/status", json={"status": "closed"}, headers=auth(admin))
    assert api("tickets").post(f"/{t['id']}/auto-assign", headers=auth(admin)).status_code == 409


# ---------- Changing an engineer's account ----------

def engineer_edit(engineer, **changes):
    body = {"full_name": engineer.full_name, "role": "engineer", "is_active": True,
            "category_id": engineer.engineer_profile.category_id, "phone": engineer.engineer_profile.phone}
    body.update(changes)
    return body


def test_deactivating_an_engineer_keeps_their_sub_specialty_and_frees_their_tickets(db, place):
    reporter, building = place
    admin = make_user(db, "admin", name="Ada Admin")
    plumber = make_user(db, "engineer", name="Pat Plumb", phone="+15552011234")
    t = submit(db, reporter, building)
    body = engineer_edit(plumber, is_active=False)

    off = api("users").put(f"/{plumber.id}", json=body, headers=auth(admin)).json()
    assert (off["category_name"], off["phone"], off["availability"]) == ("Plumbing", "+15552011234", "off_duty")
    assert api("tickets").get(f"/{t['id']}", headers=auth(admin)).json()["status"] == "open"

    back = api("users").put(f"/{plumber.id}", json={**body, "is_active": True}, headers=auth(admin)).json()
    assert (back["is_active"], back["category_name"], back["phone"]) == (True, "Plumbing", "+15552011234")


def test_changing_an_engineers_role_removes_the_profile_and_frees_their_tickets(db, place):
    reporter, building = place
    admin = make_user(db, "admin", name="Ada Admin")
    plumber = make_user(db, "engineer", name="Pat Plumb")
    t = submit(db, reporter, building)
    response = api("users").put(f"/{plumber.id}", json=engineer_edit(plumber, role="employee", category_id=None),
                                headers=auth(admin))
    assert response.json()["category_name"] is None
    assert api("tickets").get(f"/{t['id']}", headers=auth(admin)).json()["status"] == "open"


def test_a_new_engineer_picks_up_waiting_tickets_in_their_sub_specialty(db, place):
    reporter, building = place
    admin = make_user(db, "admin", name="Ada Admin")
    t = submit(db, reporter, building)
    response = api("users").post("/", json={"email": "pat@acme.inc", "full_name": "Pat Plumb", "password": "password1",
                                            "role": "engineer", "category_id": category(db, "Plumbing").id},
                                 headers=auth(admin))
    assert response.status_code == 201
    assert api("tickets").get(f"/{t['id']}", headers=auth(admin)).json()["assignee_id"] == response.json()["id"]
