"""
Escalations: an employee asks for High or Critical with a reason (when submitting, or later
on the ticket), and an admin approves or rejects it.
"""

import pytest

from conftest import api, auth, error, make_building, make_user, submit, ticket_body


@pytest.fixture
def people(db):
    return make_user(db, "employee", name="Mary Smith"), make_user(db, "admin", name="Ada Admin"), make_building(db)


def ask(ticket, user, priority="critical", reason="People are slipping"):
    return api("tickets").post(f"/{ticket['id']}/escalation", json={"requested_priority": priority, "reason": reason},
                               headers=auth(user))


def review(ticket, admin, decision):
    return api("tickets").put(f"/{ticket['id']}/escalation", json={"decision": decision}, headers=auth(admin))


# ---------- Asking while submitting ----------

def test_asking_on_submit_starts_at_medium_with_the_request_pending(db, people):
    employee, _, building = people
    t = submit(db, employee, building, priority="low", requested_priority="critical", escalation_reason=" Flooding ")
    assert (t["priority"], t["requested_priority"], t["escalation_status"], t["escalation_reason"]) == \
        ("medium", "critical", "pending", "Flooding")


@pytest.mark.parametrize("reason", [None, "", "   "])
def test_asking_on_submit_needs_a_reason(db, people, reason):
    employee, _, building = people
    body = ticket_body(db, building, requested_priority="high", escalation_reason=reason)
    response = api("tickets").post("/", json=body, headers=auth(employee))
    assert response.status_code == 400
    assert "escalation_reason" in error(response)["details"]


def test_admins_dont_need_to_ask_they_just_pick_the_level(db, people):
    _, admin, building = people
    t = submit(db, admin, building, priority="high", requested_priority="critical", escalation_reason="ignored")
    assert (t["priority"], t["escalation_status"]) == ("high", "none")


# ---------- Asking on the ticket later ----------

def test_asking_later_needs_a_reason(db, people):
    employee, _, building = people
    t = submit(db, employee, building)
    response = ask(t, employee, reason="  ")
    assert response.status_code == 400
    assert "reason" in error(response)["details"]


@pytest.mark.parametrize("asked", ["low", "medium", "urgent"])
def test_only_high_or_critical_can_be_asked_for(db, people, asked):
    employee, _, building = people
    t = submit(db, employee, building)
    response = ask(t, employee, priority=asked)
    assert response.status_code == 400
    assert "requested_priority" in error(response)["details"]


def test_asking_for_high_when_it_is_already_high_is_refused(db, people):
    employee, admin, building = people
    t = submit(db, employee, building)
    api("tickets").put(f"/{t['id']}/priority", json={"priority": "high"}, headers=auth(admin))
    response = ask(t, employee, priority="high")
    assert response.status_code == 400
    assert "requested_priority" in error(response)["details"]


def test_a_second_request_while_one_is_waiting_is_refused(db, people):
    employee, _, building = people
    t = submit(db, employee, building)
    assert ask(t, employee).status_code == 200
    response = ask(t, employee, priority="high")
    assert response.status_code == 409
    assert error(response)["code"] == "already_pending"


def test_only_the_reporter_can_ask(db, people):
    employee, admin, building = people
    t = submit(db, employee, building)
    assert ask(t, admin).status_code == 403


# ---------- Reviewing ----------

def test_approving_sets_the_priority_asked_for(db, people):
    employee, admin, building = people
    t = submit(db, employee, building)
    ask(t, employee, priority="critical")
    approved = review(t, admin, "approve").json()
    assert (approved["priority"], approved["escalation_status"]) == ("critical", "approved")


def test_rejecting_keeps_the_priority(db, people):
    employee, admin, building = people
    t = submit(db, employee, building, priority="medium")
    ask(t, employee)
    rejected = review(t, admin, "reject").json()
    assert (rejected["priority"], rejected["escalation_status"]) == ("medium", "rejected")


def test_there_must_be_a_request_to_review(db, people):
    employee, admin, building = people
    t = submit(db, employee, building)
    response = review(t, admin, "approve")
    assert response.status_code == 409
    assert error(response)["code"] == "not_pending"


def test_after_a_decision_the_reporter_can_ask_again(db, people):
    employee, admin, building = people
    t = submit(db, employee, building)
    ask(t, employee, priority="high")
    review(t, admin, "reject")
    assert ask(t, employee, priority="high").status_code == 200


def test_pending_requests_can_be_filtered_on_the_tickets_list(db, people):
    employee, admin, building = people
    asked = submit(db, employee, building)
    submit(db, employee, building)
    ask(asked, employee)
    found = api("tickets").get("/?escalation=pending", headers=auth(admin)).json()
    assert [t["id"] for t in found["tickets"]] == [asked["id"]]
