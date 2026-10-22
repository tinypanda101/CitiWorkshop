"""
Who may do what: signing in (401) and role checks (403). Each test tries something the user
isn't allowed to do and checks it's refused and nothing changed.
"""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from conftest import api, auth, error, make_building, make_user, submit
from _shared.models import Building, Ticket
from _shared.security import SECRET_KEY

# (service, method, path, body): admin-only actions. {building}, {floor} and {ticket} are
# filled in with real ids by the test.
ADMIN_ONLY = [
    ("facilities", "post", "/buildings", {"code": "NB", "name": "New Building", "address": "2 Main St",
                                          "floors": [{"name": "Floor 1", "seats": 1}]}),
    ("facilities", "put", "/buildings/{building}", {"code": "HQ", "name": "Renamed", "address": "1 Main St"}),
    ("facilities", "delete", "/buildings/{building}", None),
    ("facilities", "post", "/buildings/{building}/floors", {"level": 9, "name": "Floor 9"}),
    ("facilities", "delete", "/floors/{floor}", None),
    ("facilities", "post", "/floors/{floor}/seats/bulk", {"count": 2}),
    ("users", "get", "/", None),
    ("users", "post", "/", {"email": "new@acme.inc", "full_name": "New Person", "password": "password1", "role": "admin"}),
    ("users", "get", "/engineers", None),
    ("users", "put", "/password-reset", {"email": "mary.smith.employee@acme.inc", "new_password": "hijacked1"}),
    ("tickets", "put", "/{ticket}", {"title": "Changed", "description": "Changed", "category_id": 1,
                                     "building_id": 1, "floor_id": 1}),
    ("tickets", "delete", "/{ticket}", None),
    ("tickets", "put", "/{ticket}/assignee", {"assignee_id": None}),
    ("tickets", "post", "/{ticket}/auto-assign", None),
    ("tickets", "put", "/{ticket}/escalation", {"decision": "approve"}),
    ("dashboard", "get", "/locations", None),
]


@pytest.fixture
def world(db):
    """An employee with a ticket, an engineer it was given to, and a building."""
    employee = make_user(db, "employee", name="Mary Smith")
    engineer = make_user(db, "engineer", name="Pat Jones")
    building = make_building(db)
    ticket = submit(db, employee, building)
    return {"employee": employee, "engineer": engineer, "building": building, "ticket": ticket}


def call(service, method, path, body, user, world):
    path = path.format(building=world["building"].id, floor=world["building"].floors[0].id, ticket=world["ticket"]["id"])
    kwargs = {"headers": auth(user)} if user else {}
    if body is not None:
        kwargs["json"] = body
    return getattr(api(service), method)(path, **kwargs)


@pytest.mark.parametrize("role", ["employee", "engineer"])
@pytest.mark.parametrize("service, method, path, body", ADMIN_ONLY)
def test_admin_only_actions_are_refused_for_other_roles(db, world, role, service, method, path, body):
    user = world[role]
    response = call(service, method, path, body, user, world)
    assert response.status_code == 403, response.text
    assert error(response)["code"] == "forbidden"


def test_refused_actions_change_nothing(db, world):
    call("facilities", "delete", "/buildings/{building}", None, world["employee"], world)
    call("tickets", "delete", "/{ticket}", None, world["engineer"], world)
    db.expire_all()
    assert db.query(Building).count() == 1
    assert db.query(Ticket).count() == 1


@pytest.mark.parametrize("service, method, path, body", ADMIN_ONLY + [
    ("tickets", "get", "/", None), ("dashboard", "get", "/", None), ("auth", "get", "/me", None)])
def test_every_protected_route_needs_a_login(db, world, service, method, path, body):
    response = call(service, method, path, body, None, world)
    assert response.status_code == 401
    assert error(response)["code"] == "not_signed_in"


def test_a_forged_token_is_refused(db, world):
    # Same contents, but signed with a different key: claims to be an admin.
    fake = jwt.encode({"sub": str(world["employee"].id), "role": "admin",
                       "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, "a-different-key-that-is-long-enough-1234", algorithm="HS256")
    response = api("users").get("/", headers={"Authorization": f"Bearer {fake}"})
    assert response.status_code == 401


def test_the_role_comes_from_the_database_not_the_token(db, world):
    # A real token whose "role" says admin, for an employee: the employee's real role wins.
    token = jwt.encode({"sub": str(world["employee"].id), "role": "admin",
                        "exp": datetime.now(timezone.utc) + timedelta(hours=1)}, SECRET_KEY, algorithm="HS256")
    response = api("users").get("/", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_an_expired_token_says_so(db, world):
    token = jwt.encode({"sub": str(world["employee"].id), "role": "employee",
                        "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}, SECRET_KEY, algorithm="HS256")
    response = api("auth").get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert error(response)["code"] == "token_expired"


def test_the_token_is_not_accepted_in_the_url_outside_localstack(db, world):
    token = auth(world["employee"])["Authorization"].removeprefix("Bearer ")
    assert api("auth").get(f"/me?token={token}").status_code == 401


def test_a_deactivated_account_cant_log_in_or_use_an_old_token(db):
    user = make_user(db, active=False)
    login = api("auth").post("/login", json={"email": user.email, "password": "password1"})
    assert login.status_code == 401
    assert api("auth").get("/me", headers=auth(user)).status_code == 401


def test_an_employee_cant_see_someone_elses_ticket(db, world):
    other = make_user(db, "employee", name="Sam Lee")
    ticket_id = world["ticket"]["id"]
    assert api("tickets").get(f"/{ticket_id}", headers=auth(other)).status_code == 400  # looks the same as not found
    assert api("tickets").get(f"/{ticket_id}/notes", headers=auth(other)).status_code == 400
    assert api("tickets").get("/", headers=auth(other)).json()["total"] == 0


def test_an_engineer_only_sees_their_own_tickets(db, world):
    other = make_user(db, "engineer", name="Lee Chan", category_name="Cleaning")
    assert api("tickets").get(f"/{world['ticket']['id']}", headers=auth(other)).status_code == 400
    assert api("tickets").get("/", headers=auth(world["engineer"])).json()["total"] == 1


def test_an_engineer_cant_change_the_status_of_a_ticket_that_isnt_theirs(db, world):
    other = make_user(db, "engineer", name="Lee Chan")  # also Plumbing, but not assigned
    # The ticket isn't visible to them, so it's refused before the workflow is even checked.
    response = api("tickets").put(f"/{world['ticket']['id']}/status", json={"status": "in_progress"}, headers=auth(other))
    assert response.status_code == 400


def test_the_reporter_cant_change_the_status(db, world):
    response = api("tickets").put(f"/{world['ticket']['id']}/status", json={"status": "closed"},
                                  headers=auth(world["employee"]))
    assert response.status_code == 403


def test_the_reporter_cant_change_the_priority_directly(db, world):
    response = api("tickets").put(f"/{world['ticket']['id']}/priority", json={"priority": "critical"},
                                  headers=auth(world["employee"]))
    assert response.status_code == 403


def test_the_assigned_engineer_can_change_the_priority(db, world):
    response = api("tickets").put(f"/{world['ticket']['id']}/priority", json={"priority": "high"},
                                  headers=auth(world["engineer"]))
    assert response.status_code == 200
    assert response.json()["priority"] == "high"


@pytest.mark.parametrize("priority", ["high", "critical"])
def test_an_employee_cant_submit_at_high_or_critical(db, world, priority):
    response = api("tickets").post("/", json={"title": "Urgent", "description": "Please", "category_id": 1,
                                              "building_id": world["building"].id,
                                              "floor_id": world["building"].floors[0].id, "priority": priority},
                                   headers=auth(world["employee"]))
    assert response.status_code == 400
    assert "priority" in error(response)["details"]


@pytest.mark.parametrize("role", ["engineer", "admin"])
def test_engineers_and_admins_can_submit_at_critical(db, world, role):
    user = world["engineer"] if role == "engineer" else make_user(db, "admin", name="Ada Admin")
    ticket = submit(db, user, world["building"], priority="critical")
    assert ticket["priority"] == "critical"


def test_an_admin_cant_demote_or_deactivate_themselves(db):
    admin = make_user(db, "admin", name="Ada Admin")
    for change in [{"role": "employee", "is_active": True}, {"role": "admin", "is_active": False}]:
        response = api("users").put(f"/{admin.id}", json={"full_name": "Ada Admin", **change}, headers=auth(admin))
        assert response.status_code == 400
        assert error(response)["code"] == "own_account"


def test_registering_always_makes_an_employee(db):
    # Even if someone adds "role": "admin" to the sign-up request.
    response = api("auth").post("/register", json={"full_name": "Eve Smith", "email": "eve@acme.inc",
                                                   "password": "password1", "role": "admin"})
    assert response.status_code == 201
    assert response.json()["user"]["role"] == "employee"


def test_only_the_author_can_edit_a_note_and_admins_can_delete_any(db, world):
    ticket_id = world["ticket"]["id"]
    note = api("tickets").post(f"/{ticket_id}/notes", json={"body": "It drips more at night"},
                               headers=auth(world["employee"])).json()
    edit = api("tickets").put(f"/notes/{note['id']}", json={"body": "Hijacked"}, headers=auth(world["engineer"]))
    assert edit.status_code == 403
    admin = make_user(db, "admin", name="Ada Admin")
    assert api("tickets").put(f"/notes/{note['id']}", json={"body": "Hijacked"}, headers=auth(admin)).status_code == 403
    assert api("tickets").delete(f"/notes/{note['id']}", headers=auth(admin)).status_code == 204
