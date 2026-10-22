"""
The facilities endpoints: buildings, floors, seats and the ticket categories.
Everyone signed in can read them; only admins can add, edit or delete.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from _shared.database import get_db
from _shared.errors import AppError
from _shared.models import Building, Floor, Seat, Ticket, TicketCategory, User
from _shared.security import get_current_user, require_admin
from schemas import (
    MAX_SEATS, BuildingIn, BuildingOut, CategoryOut, FloorIn, FloorOut, NewBuildingIn, NewFloorIn, SeatCount, SeatIn,
    SeatOut,
)

router = APIRouter()


@router.get("/ping")
def ping():
    """Answers straight away (no login, no database). The app calls it on opening to start this service up."""
    return {"ok": True}


def get_or_404(db, model, item_id, label):
    item = db.get(model, item_id)
    if item is None:
        raise AppError(400, "not_found", f"{label} not found")
    return item


def refuse_if_used(db, column, item_id, label):
    """Deleting something a ticket still uses is refused, with the number of tickets."""
    count = db.scalar(select(func.count()).select_from(Ticket).where(column == item_id))
    if count:
        noun = "ticket is" if count == 1 else "tickets are"
        raise AppError(409, "in_use", f"Can't delete {label}. {count} {noun} linked to it.")


def building_out(building):
    return BuildingOut(id=building.id, code=building.code, name=building.name, address=building.address,
                       manager_name=building.manager_name, manager_email=building.manager_email,
                       manager_phone=building.manager_phone, floor_count=len(building.floors))


def floor_out(floor):
    return FloorOut(id=floor.id, building_id=floor.building_id, level=floor.level,
                    name=floor.name, seat_count=len(floor.seats))


def level_tag(level):
    """How a level appears in seat codes: 2 -> "2", 0 (ground) -> "G", -1 (basement) -> "B1"."""
    if level > 0:
        return str(level)
    return "G" if level == 0 else f"B{-level}"


def add_seats(db, floor, building_code, count):
    """
    Adds `count` seats to the floor, numbered after the ones it has: HQ-201, HQ-202...
    Floors with more than 99 seats use three digits (HQ-2101). Codes already used are skipped.
    """
    taken = set(db.scalars(select(Seat.code).where(Seat.floor_id == floor.id))) if floor.id else set()
    digits = 3 if len(taken) + count > 99 else 2
    number = len(taken)
    for _ in range(count):
        number += 1
        code = f"{building_code}-{level_tag(floor.level)}{number:0{digits}d}"
        while code in taken:
            number += 1
            code = f"{building_code}-{level_tag(floor.level)}{number:0{digits}d}"
        taken.add(code)
        floor.seats.append(Seat(code=code))


def check_building_unique(db, body, building_id=None):
    """Refuses a name or code another building already has."""
    for column, field, label in [(Building.name, "name", "name"), (Building.code, "code", "code")]:
        query = select(Building).where(column == getattr(body, field))
        if building_id:
            query = query.where(Building.id != building_id)
        if db.scalar(query):
            raise AppError(409, f"{field}_taken", f"There is already a building with that {label}", {field: "Already used"})


BUILDING_FIELDS = ["code", "name", "address", "manager_name", "manager_email", "manager_phone"]


# ---------- Buildings ----------

@router.get("/buildings", response_model=list[BuildingOut])
def list_buildings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    buildings = db.scalars(select(Building).order_by(Building.name))
    return [building_out(b) for b in buildings]


@router.post("/buildings", response_model=BuildingOut, status_code=201)
def create_building(body: NewBuildingIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    check_building_unique(db, body)
    building = Building(**body.model_dump(include=set(BUILDING_FIELDS)))
    # Its floors are levels 1, 2, 3... in the order given, each with its own number of seats.
    for level, plan in enumerate(body.floors, start=1):
        floor = Floor(level=level, name=plan.name)
        building.floors.append(floor)
        add_seats(db, floor, building.code, plan.seats)
    db.add(building)
    db.commit()
    return building_out(building)


@router.put("/buildings/{building_id}", response_model=BuildingOut)
def update_building(building_id: int, body: BuildingIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    building = get_or_404(db, Building, building_id, "Building")
    check_building_unique(db, body, building_id)
    for field in BUILDING_FIELDS:  # changing the code doesn't rename existing seats
        setattr(building, field, getattr(body, field))
    db.commit()
    return building_out(building)


@router.delete("/buildings/{building_id}", status_code=204)
def delete_building(building_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    building = get_or_404(db, Building, building_id, "Building")
    refuse_if_used(db, Ticket.building_id, building_id, building.name)
    db.delete(building)  # its floors and seats go too
    db.commit()


# ---------- Floors ----------

@router.get("/buildings/{building_id}/floors", response_model=list[FloorOut])
def list_floors(building_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_or_404(db, Building, building_id, "Building")
    floors = db.scalars(select(Floor).where(Floor.building_id == building_id).order_by(Floor.level))
    return [floor_out(f) for f in floors]


@router.post("/buildings/{building_id}/floors", response_model=FloorOut, status_code=201)
def create_floor(building_id: int, body: NewFloorIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    building = get_or_404(db, Building, building_id, "Building")
    if db.scalar(select(Floor).where(Floor.building_id == building_id, Floor.level == body.level)):
        raise AppError(409, "level_taken", "This building already has that level", {"level": "Already used in this building"})
    floor = Floor(building_id=building_id, level=body.level, name=body.name)
    add_seats(db, floor, building.code, body.seats)
    db.add(floor)
    db.commit()
    return floor_out(floor)


@router.put("/floors/{floor_id}", response_model=FloorOut)
def update_floor(floor_id: int, body: FloorIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    floor = get_or_404(db, Floor, floor_id, "Floor")
    taken = db.scalar(select(Floor).where(Floor.building_id == floor.building_id, Floor.level == body.level, Floor.id != floor_id))
    if taken:
        raise AppError(409, "level_taken", "This building already has that level", {"level": "Already used in this building"})
    floor.level, floor.name = body.level, body.name
    db.commit()
    return floor_out(floor)


@router.delete("/floors/{floor_id}", status_code=204)
def delete_floor(floor_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    floor = get_or_404(db, Floor, floor_id, "Floor")
    refuse_if_used(db, Ticket.floor_id, floor_id, floor.name)
    db.delete(floor)  # its seats go too
    db.commit()


# ---------- Seats ----------

@router.get("/floors/{floor_id}/seats", response_model=list[SeatOut])
def list_seats(floor_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_or_404(db, Floor, floor_id, "Floor")
    return db.scalars(select(Seat).where(Seat.floor_id == floor_id).order_by(Seat.code)).all()


@router.post("/floors/{floor_id}/seats", response_model=SeatOut, status_code=201)
def create_seat(floor_id: int, body: SeatIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    get_or_404(db, Floor, floor_id, "Floor")
    if db.scalar(select(Seat).where(Seat.floor_id == floor_id, Seat.code == body.code)):
        raise AppError(409, "code_taken", "This floor already has that seat", {"code": "Already used on this floor"})
    seat = Seat(floor_id=floor_id, code=body.code)
    db.add(seat)
    db.commit()
    return seat


@router.post("/floors/{floor_id}/seats/bulk", response_model=FloorOut, status_code=201)
def create_seats(floor_id: int, body: SeatCount, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    floor = get_or_404(db, Floor, floor_id, "Floor")
    if len(floor.seats) + body.count > MAX_SEATS:
        raise AppError(400, "too_many", f"A floor can have at most {MAX_SEATS} seats", {"count": f"This floor has {len(floor.seats)} already"})
    add_seats(db, floor, floor.building.code, body.count)
    db.commit()
    return floor_out(floor)


@router.put("/seats/{seat_id}", response_model=SeatOut)
def update_seat(seat_id: int, body: SeatIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    seat = get_or_404(db, Seat, seat_id, "Seat")
    taken = db.scalar(select(Seat).where(Seat.floor_id == seat.floor_id, Seat.code == body.code, Seat.id != seat_id))
    if taken:
        raise AppError(409, "code_taken", "This floor already has that seat", {"code": "Already used on this floor"})
    seat.code = body.code
    db.commit()
    return seat


@router.delete("/seats/{seat_id}", status_code=204)
def delete_seat(seat_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    seat = get_or_404(db, Seat, seat_id, "Seat")
    refuse_if_used(db, Ticket.seat_id, seat_id, seat.code)
    db.delete(seat)
    db.commit()


# ---------- Categories (read-only) ----------

@router.get("/categories", response_model=list[CategoryOut])
def list_categories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(TicketCategory).order_by(TicketCategory.type, TicketCategory.id)).all()
