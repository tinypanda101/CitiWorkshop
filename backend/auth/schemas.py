"""What each auth request must contain and what each reply returns."""

from pydantic import BaseModel, ConfigDict, Field, field_validator

from _shared.validation import check_email, check_person


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str = Field(min_length=8)

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value):
        return check_person(value)

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return check_email(value)


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def clean_email(cls, value):
        return value.strip().lower()


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserOut(BaseModel):
    # from_attributes lets Pydantic read the fields straight from a User model.
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: str


class TokenOut(BaseModel):
    token: str
    user: UserOut
