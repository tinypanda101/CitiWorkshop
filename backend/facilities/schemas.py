"""What each facilities request must contain and what each reply returns."""

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from _shared.validation import check, check_email, check_person, check_phone

# The characters each kind of text may use. Anything else (e.g. ! @ $) is refused.
# (People's names, emails and phones use the shared rules in _shared/validation.py.)
NAME = re.compile(r"[A-Za-z0-9 -]+")  # building and floor names: "North Tower - East Wing"
CODE = re.compile(r"[A-Z0-9]{2,6}")  # building codes: "HQ", "RT2"
SEAT = re.compile(r"[A-Z0-9-]+")  # seat codes: "HQ-2-01"
ADDRESS = re.compile(r"[A-Za-z0-9 ,.\-#/']+")  # "1200 Main St, Suite #4"

MAX_FLOORS = 100
MAX_SEATS = 500  # per floor


def check_name(value):
    value = check(value, NAME, "Only letters, numbers, spaces and hyphens (-)")
    if not 2 <= len(value) <= 80:
        raise ValueError("Between 2 and 80 characters")
    return value


class BuildingIn(BaseModel):
    code: str
    name: str
    address: str
    manager_name: str | None = None
    manager_email: str | None = None
    manager_phone: str | None = None

    @field_validator("code")
    @classmethod
    def clean_code(cls, value):
        return check(value.upper(), CODE, "2 to 6 letters or numbers, e.g. HQ")

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return check_name(value)

    @field_validator("address")
    @classmethod
    def clean_address(cls, value):
        return check(value, ADDRESS, "Only letters, numbers, spaces and , . - # / '")

    @field_validator("manager_name")
    @classmethod
    def clean_manager_name(cls, value):
        return check_person(value, required=False)

    @field_validator("manager_email")
    @classmethod
    def clean_manager_email(cls, value):
        return check_email(value, required=False)

    @field_validator("manager_phone")
    @classmethod
    def clean_manager_phone(cls, value):
        return check_phone(value)


class FloorPlan(BaseModel):
    """One floor made together with a new building: its name and how many seats."""

    name: str
    seats: int = Field(0, ge=0, le=MAX_SEATS)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return check_name(value)


class NewBuildingIn(BuildingIn):
    """Creating a building also creates its floors (levels 1, 2, 3...) and their seats."""

    floors: list[FloorPlan] = Field(min_length=1, max_length=MAX_FLOORS)


class BuildingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    address: str
    manager_name: str | None
    manager_email: str | None
    manager_phone: str | None
    floor_count: int


class FloorIn(BaseModel):
    level: int
    name: str

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return check_name(value)


class NewFloorIn(FloorIn):
    seats: int = Field(0, ge=0, le=MAX_SEATS)


class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    building_id: int
    level: int
    name: str
    seat_count: int


class SeatIn(BaseModel):
    code: str

    @field_validator("code")
    @classmethod
    def clean_code(cls, value):
        return check(value.upper(), SEAT, "Only letters, numbers and hyphens, e.g. HQ-2-01")


class SeatCount(BaseModel):
    """Add this many seats to a floor, numbered after the ones it already has."""

    count: int = Field(ge=1, le=MAX_SEATS)


class SeatOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    floor_id: int
    code: str


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
