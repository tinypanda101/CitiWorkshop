"""
Shared setup for the backend tests.

- The tests use their own database, acme_test, in the local PostgreSQL (created here if it's
  missing), so the app's real data in the "postgres" database is never touched.
- Before each test every table is emptied and the starting data (categories) is put back,
  so each test begins clean and adds only the rows it needs.
- Each service's FastAPI app is called in-process with FastAPI's TestClient: real HTTP requests
  and replies, our error handlers and status codes, just without Lambda in front.

Run from the backend folder:  ../.venv/bin/pytest   (add --cov for the coverage report)
"""

import importlib
import os
import sys
from pathlib import Path

import psycopg
import pytest

# This has to happen before any app code is imported: _shared/database.py reads it once.
TEST_DATABASE = "acme_test"
os.environ["POSTGRES_NAME"] = TEST_DATABASE
os.environ["IS_LOCAL"] = "false"  # the tests send tokens in the header, like the real site

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))  # so "_shared" is backend/_shared


def create_test_database():
    settings = dict(host=os.getenv("POSTGRES_HOST", "localhost"), port=int(os.getenv("POSTGRES_PORT", "5432")),
                    user=os.getenv("POSTGRES_USER", "postgres"), password=os.getenv("POSTGRES_PASS", "postgres123"))
    with psycopg.connect(dbname="postgres", autocommit=True, **settings) as conn:
        if conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DATABASE,)).fetchone() is None:
            conn.execute(f'CREATE DATABASE "{TEST_DATABASE}"')  # nosec B608


create_test_database()

from fastapi.testclient import TestClient  # noqa: E402  (after the database settings above)
from sqlalchemy import text  # noqa: E402

from _shared.database import SessionLocal, engine  # noqa: E402
from _shared.models import Base, Building, EngineerProfile, Floor, Seat, TicketCategory, User  # noqa: E402
from _shared.security import hash_password, make_token  # noqa: E402
from _shared.seed import create_tables, seed  # noqa: E402

SERVICES = ["auth", "users", "tickets", "facilities", "dashboard"]
PASSWORD = "password1"  # every test account's password


def load_app(service):
    """
    Imports backend/<service>/function.py and returns its FastAPI app. Every service has its own
    router.py and schemas.py, so the previous service's copies are forgotten first. The service
    folder goes at the end of the path, so its installed libraries don't replace the venv's.
    """
    for name in ("function", "router", "schemas"):
        sys.modules.pop(name, None)
    folder = str(BACKEND / service)
    sys.path.append(folder)
    try:
        return importlib.import_module("function").app
    finally:
        sys.path.remove(folder)


create_tables()
CLIENTS = {service: TestClient(load_app(service)) for service in SERVICES}
PASSWORD_HASH = hash_password(PASSWORD)  # made once: bcrypt is slow on purpose


@pytest.fixture(autouse=True)
def clean_database():
    """Empties every table, then puts the categories (and the first admin) back."""
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))  # nosec B608 - our own table names
    seed()


@pytest.fixture
def db():
    """A database session for setting up rows and checking results."""
    with SessionLocal() as session:
        yield session


def api(service):
    """The test client for one service, e.g. api("tickets").post("/", json=..., headers=...)."""
    return CLIENTS[service]


def auth(user):
    """The Authorization header for this user."""
    return {"Authorization": f"Bearer {make_token(user)}"}


def db_date(db, days_ago):
    """
    The calendar date `days_ago` days back, as the database sees it. The server compares the
    from/to dates in the database's own time zone, so the tests work out dates the same way.
    """
    return db.scalar(text(f"SELECT (now() - interval '{int(days_ago)} days')::date")).isoformat()  # nosec B608


def error(response):
    """The {"code", "message", "details"} part of an error reply."""
    return response.json()["error"]


# ---------- Making rows ----------

def category(db, name):
    return db.query(TicketCategory).filter_by(name=name).one()


def make_user(db, role="employee", name="Mary Smith", email=None, category_name=None,
              availability="available", phone=None, active=True):
    """An account with password "password1". Engineers also get a sub-specialty (Plumbing by default)."""
    email = email or f"{name.lower().replace(' ', '.')}.{role}@acme.inc"
    user = User(email=email, full_name=name, password_hash=PASSWORD_HASH, role=role, is_active=active)
    if role == "engineer":
        user.engineer_profile = EngineerProfile(category_id=category(db, category_name or "Plumbing").id,
                                                availability=availability, phone=phone)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def make_building(db, code="HQ", name="Head Office", floors=2, seats=3):
    """A building with floors "Floor 1", "Floor 2"... (levels 1, 2...) and seats HQ-1-01, HQ-1-02..."""
    building = Building(code=code, name=name, address="1 Main Street")
    for level in range(1, floors + 1):
        floor = Floor(level=level, name=f"Floor {level}")
        floor.seats = [Seat(code=f"{code}-{level}-{n:02d}") for n in range(1, seats + 1)]
        building.floors.append(floor)
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


def ticket_body(db, building, category_name="Plumbing", **changes):
    """What a reporter sends to submit a ticket, on the building's first floor."""
    body = {"title": "Leaking tap", "description": "The kitchen tap drips all day",
            "category_id": category(db, category_name).id, "building_id": building.id,
            "floor_id": building.floors[0].id}
    body.update(changes)
    return body


def submit(db, reporter, building, **changes):
    """Submits a ticket through the API (so auto-assign runs) and returns the reply."""
    response = api("tickets").post("/", json=ticket_body(db, building, **changes), headers=auth(reporter))
    assert response.status_code == 201, response.text
    return response.json()
