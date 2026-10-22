"""
Editing and deleting floors and seats one at a time.
"""

from conftest import api, auth, error, make_building, make_user


def test_renaming_a_floor_and_moving_it_to_a_free_level(db):
    admin = make_user(db, "admin", name="Ada Admin")
    floor = make_building(db, floors=2).floors[0]
    response = api("facilities").put(f"/floors/{floor.id}", json={"level": 5, "name": "Roof Garden"}, headers=auth(admin))
    assert (response.json()["level"], response.json()["name"]) == (5, "Roof Garden")


def test_moving_a_floor_onto_a_level_already_used_is_refused(db):
    admin = make_user(db, "admin", name="Ada Admin")
    floor = make_building(db, floors=2).floors[0]
    response = api("facilities").put(f"/floors/{floor.id}", json={"level": 2, "name": "Floor 1"}, headers=auth(admin))
    assert response.status_code == 409
    assert "level" in error(response)["details"]


def test_renaming_a_seat_to_one_already_on_the_floor_is_refused(db):
    admin = make_user(db, "admin", name="Ada Admin")
    seat = make_building(db, seats=2).floors[0].seats[0]
    response = api("facilities").put(f"/seats/{seat.id}", json={"code": "HQ-1-02"}, headers=auth(admin))
    assert response.status_code == 409
    renamed = api("facilities").put(f"/seats/{seat.id}", json={"code": "hq-1-50"}, headers=auth(admin))
    assert renamed.json()["code"] == "HQ-1-50"


def test_deleting_an_unused_floor_and_seat(db):
    admin = make_user(db, "admin", name="Ada Admin")
    building = make_building(db, floors=2, seats=2)
    seat = building.floors[0].seats[0]
    assert api("facilities").delete(f"/seats/{seat.id}", headers=auth(admin)).status_code == 204
    assert api("facilities").delete(f"/floors/{building.floors[1].id}", headers=auth(admin)).status_code == 204
    floors = api("facilities").get(f"/buildings/{building.id}/floors", headers=auth(admin)).json()
    assert [(f["name"], f["seat_count"]) for f in floors] == [("Floor 1", 1)]


def test_seat_list_for_a_floor(db):
    employee = make_user(db)
    floor = make_building(db, seats=3).floors[0]
    seats = api("facilities").get(f"/floors/{floor.id}/seats", headers=auth(employee)).json()
    assert [s["code"] for s in seats] == ["HQ-1-01", "HQ-1-02", "HQ-1-03"]
