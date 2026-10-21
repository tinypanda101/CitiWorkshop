"""What each facilities request must contain and what each reply returns."""

from pydantic import BaseModel, ConfigDict, field_validator


def not_blank(value, message):
    value = value.strip()
    if not value:
        raise ValueError(message)
    return value


class BuildingIn(BaseModel):
    name: str
    address: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return not_blank(value, "Please enter a name")

    @field_validator("address")
    @classmethod
    def clean_address(cls, value):
        # An empty address is saved as "no address".
        if value is None or not value.strip():
            return None
        return value.strip()


class BuildingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str | None
    floor_count: int


class FloorIn(BaseModel):
    level: int
    name: str

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return not_blank(value, "Please enter a name, e.g. Floor 2")


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
        return not_blank(value, "Please enter a seat code, e.g. HQ-201").upper()


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
