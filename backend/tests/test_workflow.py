"""
The status workflow: Open -> Assigned -> In Progress <-> Blocked -> Resolved -> Closed.
Engineers must follow it one step at a time; admins can move a ticket to any status.
"""

import pytest

from conftest import api, auth, error, make_building, make_user, submit


@pytest.fixture
def ticket(db):
    """A ticket auto-assigned to an engineer: (ticket, reporter, engineer)."""
    reporter = make_user(db, "employee", name="Mary Smith")
    engineer = make_user(db, "engineer", name="Pat Jones")
    return submit(db, reporter, make_building(db)), reporter, engineer


def move(ticket, user, status, **extra):
    return api("tickets").put(f"/{ticket['id']}/status", json={"status": status, **extra}, headers=auth(user))


def test_a_new_ticket_is_assigned_straight_away(ticket):
    t, _, engineer = ticket
    assert (t["status"], t["assignee_id"]) == ("assigned", engineer.id)


def test_engineer_follows_every_step_to_closed(ticket):
    t, _, engineer = ticket
    assert move(t, engineer, "in_progress").status_code == 200
    assert move(t, engineer, "blocked", blocked_reason="Waiting for a part").status_code == 200
    assert move(t, engineer, "in_progress").status_code == 200
    resolved = move(t, engineer, "resolved", resolution_summary="Replaced the washer")
    assert resolved.status_code == 200
    assert resolved.json()["resolved_at"] is not None
    closed = move(t, engineer, "closed")
    assert closed.json()["status"] == "closed"


@pytest.mark.parametrize("steps_first, skip_to", [
    ([], "resolved"),  # Assigned straight to Resolved
    ([], "blocked"),  # Assigned straight to Blocked
    ([], "closed"),  # Assigned straight to Closed
    (["in_progress"], "closed"),  # In Progress straight to Closed
])
def test_engineer_cant_skip_steps(ticket, steps_first, skip_to):
    t, _, engineer = ticket
    for step in steps_first:
        move(t, engineer, step)
    response = move(t, engineer, skip_to, blocked_reason="x", resolution_summary="x")
    assert response.status_code == 400
    assert error(response)["code"] == "not_allowed"


def test_engineer_cant_reopen_a_closed_ticket(ticket):
    t, _, engineer = ticket
    move(t, engineer, "in_progress")
    move(t, engineer, "resolved", resolution_summary="Fixed")
    move(t, engineer, "closed")
    assert move(t, engineer, "in_progress").status_code == 400


def test_engineer_can_reopen_a_resolved_ticket_and_it_stops_being_resolved(ticket):
    t, _, engineer = ticket
    move(t, engineer, "in_progress")
    move(t, engineer, "resolved", resolution_summary="Fixed")
    reopened = move(t, engineer, "in_progress")
    assert reopened.status_code == 200
    assert reopened.json()["resolved_at"] is None


@pytest.mark.parametrize("reason", [None, "", "   "])
def test_blocked_needs_a_reason(ticket, reason):
    t, _, engineer = ticket
    move(t, engineer, "in_progress")
    response = move(t, engineer, "blocked", blocked_reason=reason)
    assert response.status_code == 400
    assert "blocked_reason" in error(response)["details"]


@pytest.mark.parametrize("summary", [None, "", "   "])
def test_resolved_needs_a_summary(ticket, summary):
    t, _, engineer = ticket
    move(t, engineer, "in_progress")
    response = move(t, engineer, "resolved", resolution_summary=summary)
    assert response.status_code == 400
    assert "resolution_summary" in error(response)["details"]


def test_moving_to_the_same_status_is_refused(ticket, db):
    t, _, engineer = ticket
    admin = make_user(db, "admin", name="Ada Admin")
    move(t, engineer, "in_progress")
    assert move(t, admin, "in_progress").status_code == 400


def test_admin_can_skip_steps(ticket, db):
    t, _, _ = ticket
    admin = make_user(db, "admin", name="Ada Admin")
    response = move(t, admin, "closed")
    assert response.status_code == 200
    assert response.json()["status"] == "closed"


@pytest.mark.parametrize("status", ["open", "assigned"])
def test_open_and_assigned_come_from_assigning_not_from_a_status_change(ticket, db, status):
    t, _, _ = ticket
    admin = make_user(db, "admin", name="Ada Admin")
    response = move(t, admin, status)
    assert response.status_code == 400


def test_an_unassigned_ticket_cant_be_started(db):
    reporter = make_user(db)
    admin = make_user(db, "admin", name="Ada Admin")
    t = submit(db, reporter, make_building(db))  # no engineers, so it waits in Open
    assert t["status"] == "open"
    response = move(t, admin, "in_progress")
    assert response.status_code == 400
    assert error(response)["message"] == "Assign an engineer first"


def test_unassigning_sends_an_unfinished_ticket_back_to_open(ticket, db):
    t, _, engineer = ticket
    admin = make_user(db, "admin", name="Ada Admin")
    move(t, engineer, "in_progress")
    response = api("tickets").put(f"/{t['id']}/assignee", json={"assignee_id": None}, headers=auth(admin))
    assert (response.json()["status"], response.json()["assignee_id"]) == ("open", None)


def test_only_an_active_engineer_can_be_assigned(ticket, db):
    t, reporter, _ = ticket
    admin = make_user(db, "admin", name="Ada Admin")
    gone = make_user(db, "engineer", name="Old Hand", active=False)
    for person in (reporter, admin, gone):
        response = api("tickets").put(f"/{t['id']}/assignee", json={"assignee_id": person.id}, headers=auth(admin))
        assert response.status_code == 400
        assert "assignee_id" in error(response)["details"]


# ---------- Notes ----------

def test_reporter_engineer_and_admin_can_all_add_notes(ticket, db):
    t, reporter, engineer = ticket
    admin = make_user(db, "admin", name="Ada Admin")
    for user in (reporter, engineer, admin):
        response = api("tickets").post(f"/{t['id']}/notes", json={"body": f"From {user.full_name}"}, headers=auth(user))
        assert response.status_code == 201
    notes = api("tickets").get(f"/{t['id']}/notes", headers=auth(reporter)).json()
    assert [n["author_role"] for n in notes] == ["employee", "engineer", "admin"]  # oldest first


def test_a_blank_note_is_refused(ticket):
    t, reporter, _ = ticket
    response = api("tickets").post(f"/{t['id']}/notes", json={"body": "   "}, headers=auth(reporter))
    assert response.status_code == 400


def test_notes_cant_be_added_to_a_closed_ticket_except_by_admins(ticket, db):
    t, reporter, engineer = ticket
    admin = make_user(db, "admin", name="Ada Admin")
    move(t, admin, "closed")
    for user in (reporter, engineer):
        response = api("tickets").post(f"/{t['id']}/notes", json={"body": "Still broken"}, headers=auth(user))
        assert response.status_code == 400
    assert api("tickets").post(f"/{t['id']}/notes", json={"body": "Closing note"}, headers=auth(admin)).status_code == 201


def test_the_author_can_edit_and_delete_their_note(ticket):
    t, reporter, _ = ticket
    note = api("tickets").post(f"/{t['id']}/notes", json={"body": "First"}, headers=auth(reporter)).json()
    edited = api("tickets").put(f"/notes/{note['id']}", json={"body": "Second"}, headers=auth(reporter))
    assert edited.json()["body"] == "Second"
    assert api("tickets").delete(f"/notes/{note['id']}", headers=auth(reporter)).status_code == 204
    assert api("tickets").get(f"/{t['id']}/notes", headers=auth(reporter)).json() == []
