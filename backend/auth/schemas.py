"""What each auth request must contain and what each reply returns."""

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1)
    email: str
    password: str = Field(min_length=8)

    @field_validator("full_name")
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("Please enter your name")
        return value.strip()

    @field_validator("email")
    @classmethod
    def acme_email(cls, value):
        value = value.strip().lower()
        if not value.endswith("@acme.inc") or value == "@acme.inc":
            raise ValueError("Must be an @acme.inc email address")
        return value


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
