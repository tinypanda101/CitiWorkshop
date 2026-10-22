"""
Facilities: floors and seats made with a building, seat numbering, deleting things tickets
still use, and the status codes (201 created, 204 deleted, 400 not_found).
"""

import pytest

from conftest import api, auth, error, make_building, make_user, submit
from _shared.models import Building, Floor, Seat


@pytest.fixture
def admin(db):
    return make_user(db, "admin", name="Ada Admin")


def create_building(admin, floors, code="TB"):
    response = api("facilities").post("/buildings", json={"code": code, "name": "Test Building", "address": "1 Main St",
                                                          "floors": floors}, headers=auth(admin))
    assert response.status_code == 201, response.text
    return response.json()


def seat_codes(db, floor_id):
    return sorted(s.code for s in db.query(Seat).filter_by(floor_id=floor_id))


def floors_of(db, building_id):
    return db.query(Floor).filter_by(building_id=building_id).order_by(Floor.level).all()


def test_a_new_building_gets_its_floors_and_each_floors_own_seats(db, admin):
    b = create_building(admin, [{"name": "Ground", "seats": 2}, {"name": "Empty", "seats": 0}, {"name": "Top", "seats": 3}])
    floors = floors_of(db, b["id"])
    assert [(f.level, f.name) for f in floors] == [(1, "Ground"), (2, "Empty"), (3, "Top")]
    assert seat_codes(db, floors[0].id) == ["TB-101", "TB-102"]
    assert seat_codes(db, floors[1].id) == []
    assert seat_codes(db, floors[2].id) == ["TB-301", "TB-302", "TB-303"]
    assert b["floor_count"] == 3


def test_floors_with_more_than_99_seats_use_three_digits(db, admin):
    b = create_building(admin, [{"name": "Big Floor", "seats": 120}])
    codes = seat_codes(db, floors_of(db, b["id"])[0].id)
    assert (codes[0], codes[-1], len(codes)) == ("TB-1001", "TB-1120", 120)


@pytest.mark.parametrize("level, first_seat", [(0, "TB-G01"), (-1, "TB-B101"), (12, "TB-1201")])
def test_ground_and_basement_floors_have_their_own_seat_codes(db, admin, level, first_seat):
    b = create_building(admin, [{"name": "Floor 1", "seats": 1}])
    response = api("facilities").post(f"/buildings/{b['id']}/floors", json={"level": level, "name": "Extra", "seats": 2},
                                      headers=auth(admin))
    assert response.status_code == 201
    assert seat_codes(db, response.json()["id"])[0] == first_seat


def test_add_several_continues_the_numbering(db, admin):
    b = create_building(admin, [{"name": "Floor 1", "seats": 2}])
    floor_id = floors_of(db, b["id"])[0].id
    response = api("facilities").post(f"/floors/{floor_id}/seats/bulk", json={"count": 3}, headers=auth(admin))
    assert response.status_code == 201
    assert response.json()["seat_count"] == 5
    assert seat_codes(db, floor_id) == ["TB-101", "TB-102", "TB-103", "TB-104", "TB-105"]


def test_add_several_skips_codes_already_taken(db, admin):
    b = create_building(admin, [{"name": "Floor 1", "seats": 1}])
    floor_id = floors_of(db, b["id"])[0].id
    api("facilities").post(f"/floors/{floor_id}/seats", json={"code": "TB-103"}, headers=auth(admin))  # typed by hand
    api("facilities").post(f"/floors/{floor_id}/seats/bulk", json={"count": 2}, headers=auth(admin))
    assert seat_codes(db, floor_id) == ["TB-101", "TB-103", "TB-104", "TB-105"]


def test_changing_the_code_doesnt_rename_existing_seats(db, admin):
    building = make_building(db, code="HQ")
    response = api("facilities").put(f"/buildings/{building.id}",
                                     json={"code": "HX", "name": "Head Office", "address": "1 Main St"}, headers=auth(admin))
    assert response.json()["code"] == "HX"
    assert seat_codes(db, building.floors[0].id)[0] == "HQ-101"


def test_everyone_signed_in_can_read_facilities(db):
    employee = make_user(db)
    building = make_building(db)
    assert len(api("facilities").get("/buildings", headers=auth(employee)).json()) == 1
    assert len(api("facilities").get(f"/buildings/{building.id}/floors", headers=auth(employee)).json()) == 2
    assert len(api("facilities").get("/categories", headers=auth(employee)).json()) == 8


# ---------- Deleting ----------

@pytest.mark.parametrize("kind", ["building", "floor", "seat"])
def test_deleting_something_a_ticket_uses_is_refused(db, admin, kind):
    reporter = make_user(db)
    building = make_building(db)
    submit(db, reporter, building, seat_code="HQ-101")
    path = {"building": f"/buildings/{building.id}", "floor": f"/floors/{building.floors[0].id}",
            "seat": f"/seats/{building.floors[0].seats[0].id}"}[kind]
    response = api("facilities").delete(path, headers=auth(admin))
    assert response.status_code == 409
    assert error(response)["code"] == "in_use"
    assert "1 ticket is linked" in error(response)["message"]


def test_deleting_a_building_removes_its_floors_and_seats(db, admin):
    building = make_building(db, floors=2, seats=3)
    response = api("facilities").delete(f"/buildings/{building.id}", headers=auth(admin))
    assert (response.status_code, response.content) == (204, b"")
    db.expire_all()
    assert (db.query(Building).count(), db.query(Floor).count(), db.query(Seat).count()) == (0, 0, 0)


@pytest.mark.parametrize("path", ["/buildings/999", "/floors/999", "/seats/999"])
def test_deleting_something_missing_says_not_found(admin, path):
    response = api("facilities").delete(path, headers=auth(admin))
    # 400, not 404: CloudFront turns every 404 into the React page (see _shared/errors.py).
    assert response.status_code == 400
    assert error(response)["code"] == "not_found"


def test_an_unknown_route_also_says_not_found(admin):
    response = api("facilities").get("/no-such-thing", headers=auth(admin))
    assert response.status_code == 400
    assert error(response)["code"] == "not_found"
