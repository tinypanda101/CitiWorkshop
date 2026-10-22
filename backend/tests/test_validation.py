"""
Bad input is refused with a 400 and a message under the right field, and nothing is saved.
Covers buildings, floors, seats, accounts and tickets.
"""

import pytest

from conftest import api, auth, category, error, make_building, make_user, ticket_body
from _shared.models import Building


def new_building(**changes):
    body = {"code": "HQ", "name": "Head Office", "address": "1 Main Street", "floors": [{"name": "Floor 1", "seats": 2}]}
    body.update(changes)
    return body


def post_building(admin, body):
    return api("facilities").post("/buildings", json=body, headers=auth(admin))


# ---------- Buildings ----------

@pytest.mark.parametrize("name", ["!Hospital", "Bad!@#$$", "North_Tower", "Café <script>", "A"])
def test_building_name_with_symbols_or_too_short_is_refused(db, name):
    admin = make_user(db, "admin")
    response = post_building(admin, new_building(name=name))
    assert response.status_code == 400
    assert "name" in error(response)["details"]
    assert db.query(Building).count() == 0  # nothing saved


def test_building_name_allows_letters_numbers_spaces_and_hyphens(db):
    admin = make_user(db, "admin")
    response = post_building(admin, new_building(name="North Tower - East Wing 2"))
    assert response.status_code == 201


@pytest.mark.parametrize("code", ["H", "TOOLONG1", "H-Q", "H Q"])
def test_building_code_must_be_2_to_6_letters_or_numbers(db, code):
    admin = make_user(db, "admin")
    response = post_building(admin, new_building(code=code))
    assert response.status_code == 400
    assert "code" in error(response)["details"]


def test_building_code_is_saved_in_capitals(db):
    admin = make_user(db, "admin")
    assert post_building(admin, new_building(code="rt2")).json()["code"] == "RT2"


@pytest.mark.parametrize("address", ["", "   ", "1 Main St; DROP TABLE"])
def test_building_address_is_required_and_checked(db, address):
    admin = make_user(db, "admin")
    response = post_building(admin, new_building(address=address))
    assert response.status_code == 400
    assert "address" in error(response)["details"]


def test_building_without_an_address_field_is_refused(db):
    admin = make_user(db, "admin")
    body = new_building()
    del body["address"]
    assert post_building(admin, body).status_code == 400


@pytest.mark.parametrize("floor_count", [0, 101])
def test_building_needs_1_to_100_floors(db, floor_count):
    admin = make_user(db, "admin")
    floors = [{"name": f"Floor {i}", "seats": 1} for i in range(floor_count)]
    response = post_building(admin, new_building(floors=floors))
    assert response.status_code == 400
    assert "floors" in error(response)["details"]


def test_floor_with_more_than_500_seats_is_refused(db):
    admin = make_user(db, "admin")
    response = post_building(admin, new_building(floors=[{"name": "Floor 1", "seats": 501}]))
    assert response.status_code == 400
    assert "floors.0.seats" in error(response)["details"]


def test_bad_floor_name_points_at_that_row(db):
    admin = make_user(db, "admin")
    floors = [{"name": "Floor 1", "seats": 1}, {"name": "Floor #2!", "seats": 1}]
    response = post_building(admin, new_building(floors=floors))
    assert response.status_code == 400
    assert list(error(response)["details"]) == ["floors.1.name"]


@pytest.mark.parametrize("field, value", [
    ("manager_name", "J0hn"), ("manager_name", "!!!"), ("manager_name", "---"),
    ("manager_email", "x@gmail.com"), ("manager_email", "!!@acme.inc"), ("manager_email", ".mary@acme.inc"),
    ("manager_phone", "+1 12"), ("manager_phone", "555-201-1234"), ("manager_phone", "+1 (555) 201-1234"),
])
def test_bad_manager_details_are_refused(db, field, value):
    admin = make_user(db, "admin")
    response = post_building(admin, new_building(**{field: value}))
    assert response.status_code == 400
    assert field in error(response)["details"]


def test_good_manager_details_are_saved_cleaned_up(db):
    admin = make_user(db, "admin")
    response = post_building(admin, new_building(manager_name="Mary O'Brien-Smith",
                                                 manager_email="Mary.O-Brien@ACME.inc", manager_phone="+15552011234"))
    assert response.status_code == 201
    saved = response.json()
    assert (saved["manager_name"], saved["manager_email"], saved["manager_phone"]) == \
        ("Mary O'Brien-Smith", "mary.o-brien@acme.inc", "+15552011234")


@pytest.mark.parametrize("field", ["name", "code"])
def test_building_name_and_code_must_be_unique(db, field):
    admin = make_user(db, "admin")
    make_building(db, code="HQ", name="Head Office")
    other = {"name": "Other Place", "code": "OP"}
    other[field] = {"name": "Head Office", "code": "HQ"}[field]
    response = post_building(admin, new_building(**other))
    assert response.status_code == 409
    assert field in error(response)["details"]


# ---------- Floors and seats ----------

def test_two_floors_cant_share_a_level(db):
    admin = make_user(db, "admin")
    building = make_building(db, floors=1)
    response = api("facilities").post(f"/buildings/{building.id}/floors", json={"level": 1, "name": "Mezzanine"},
                                      headers=auth(admin))
    assert response.status_code == 409
    assert "level" in error(response)["details"]


@pytest.mark.parametrize("code", ["HQ 101", "HQ_101", "HQ#1"])
def test_seat_code_only_allows_letters_numbers_and_hyphens(db, code):
    admin = make_user(db, "admin")
    floor = make_building(db).floors[0]
    response = api("facilities").post(f"/floors/{floor.id}/seats", json={"code": code}, headers=auth(admin))
    assert response.status_code == 400


def test_a_seat_code_cant_be_used_twice_on_a_floor(db):
    admin = make_user(db, "admin")
    floor = make_building(db).floors[0]
    response = api("facilities").post(f"/floors/{floor.id}/seats", json={"code": "hq-101"}, headers=auth(admin))
    assert response.status_code == 409  # HQ-101 already exists (codes are saved in capitals)


def test_adding_seats_past_500_on_a_floor_is_refused(db):
    admin = make_user(db, "admin")
    floor = make_building(db, seats=3).floors[0]
    response = api("facilities").post(f"/floors/{floor.id}/seats/bulk", json={"count": 498}, headers=auth(admin))
    assert response.status_code == 400
    assert "count" in error(response)["details"]


# ---------- Accounts ----------

@pytest.mark.parametrize("email", [".mary@acme.inc", "mary.@acme.inc", "a b@acme.inc", "!!@acme.inc",
                                   "mary@gmail.com", "mary@acme.inc.evil.com", "@acme.inc"])
def test_register_needs_a_proper_acme_email(email):
    response = api("auth").post("/register", json={"full_name": "Mary Smith", "email": email, "password": "password1"})
    assert response.status_code == 400
    assert "email" in error(response)["details"]


def test_register_needs_8_character_password():
    response = api("auth").post("/register", json={"full_name": "Mary Smith", "email": "mary@acme.inc", "password": "short12"})
    assert response.status_code == 400
    assert "password" in error(response)["details"]


@pytest.mark.parametrize("name", ["", "J0hn", "---", "Mary!"])
def test_register_needs_a_real_name(name):
    response = api("auth").post("/register", json={"full_name": name, "email": "mary@acme.inc", "password": "password1"})
    assert response.status_code == 400
    assert "full_name" in error(response)["details"]


def test_register_twice_with_one_email_is_refused():
    body = {"full_name": "Mary Smith", "email": "mary@acme.inc", "password": "password1"}
    assert api("auth").post("/register", json=body).status_code == 201
    again = api("auth").post("/register", json={**body, "email": "MARY@acme.inc"})
    assert again.status_code == 409


def test_engineer_account_needs_a_sub_specialty(db):
    admin = make_user(db, "admin")
    response = api("users").post("/", json={"email": "eng@acme.inc", "full_name": "Eng One", "password": "password1",
                                            "role": "engineer"}, headers=auth(admin))
    assert response.status_code == 400
    assert "category_id" in error(response)["details"]


def test_engineer_phone_must_be_in_international_form(db):
    admin = make_user(db, "admin")
    response = api("users").post("/", json={"email": "eng@acme.inc", "full_name": "Eng One", "password": "password1",
                                            "role": "engineer", "category_id": category(db, "Plumbing").id,
                                            "phone": "555 1234"},
                                 headers=auth(admin))
    assert response.status_code == 400
    assert "phone" in error(response)["details"]


# ---------- Tickets ----------

@pytest.mark.parametrize("field", ["title", "description"])
def test_ticket_needs_a_title_and_description(db, field):
    reporter = make_user(db)
    building = make_building(db)
    response = api("tickets").post("/", json=ticket_body(db, building, **{field: "   "}), headers=auth(reporter))
    assert response.status_code == 400
    assert field in error(response)["details"]


def test_ticket_floor_must_be_in_the_chosen_building(db):
    reporter = make_user(db)
    building = make_building(db, code="HQ", name="Head Office")
    other = make_building(db, code="RT", name="Riverside Tower")
    body = ticket_body(db, building, floor_id=other.floors[0].id)
    response = api("tickets").post("/", json=body, headers=auth(reporter))
    assert response.status_code == 400
    assert "floor_id" in error(response)["details"]


def test_ticket_seat_must_be_a_real_seat_on_that_floor(db):
    reporter = make_user(db)
    building = make_building(db, floors=2)
    # HQ-201 is a real seat, but on Floor 2, not Floor 1.
    response = api("tickets").post("/", json=ticket_body(db, building, seat_code="HQ-201"), headers=auth(reporter))
    assert response.status_code == 400
    assert "seat_code" in error(response)["details"]


def test_ticket_seat_code_is_matched_in_any_case(db):
    reporter = make_user(db)
    building = make_building(db)
    response = api("tickets").post("/", json=ticket_body(db, building, seat_code="hq-102"), headers=auth(reporter))
    assert response.status_code == 201
    assert response.json()["seat_code"] == "HQ-102"


def test_ticket_with_an_unknown_category_is_refused(db):
    reporter = make_user(db)
    building = make_building(db)
    body = ticket_body(db, building, category_id=999)
    response = api("tickets").post("/", json=body, headers=auth(reporter))
    assert response.status_code == 400
    assert "category_id" in error(response)["details"]


def test_malformed_json_gets_a_400_not_a_crash(db):
    reporter = make_user(db)
    response = api("tickets").post("/", content="{not json", headers={**auth(reporter), "Content-Type": "application/json"})
    assert response.status_code == 400
    assert error(response)["code"] == "validation_error"
