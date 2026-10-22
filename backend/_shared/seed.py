"""
Creates the tables and the starting data. The auth service runs both when it starts.
Safe to run more than once: only missing tables and rows are added.
"""

from sqlalchemy import select

from _shared.database import SessionLocal, engine
from _shared.models import Base, TicketCategory, User

CATEGORIES = [
    ("HVAC / Temperature", "facility"),
    ("Electrical / Lighting", "facility"),
    ("Plumbing", "facility"),
    ("Cleaning", "facility"),
    ("Access / Security", "facility"),
    ("Network / Wi-Fi", "technology"),
    ("Printers / Scanners", "technology"),
    ("Desk Equipment / Monitors", "technology"),
]

# The first Facility Admin. Only the bcrypt hash of the starting password is stored here;
# log in with the starting password once and change it straight away.
FIRST_ADMIN_EMAIL = "admin@acme.inc"
# A bcrypt hash, not the password itself (Bandit would otherwise flag it as one).
FIRST_ADMIN_PASSWORD_HASH = "$2b$12$6ONYelqjnZmIxUUUsHpr5uOZWeh8UWIRVkS8JdN/shl3FCGv6WACa"  # nosec B105


def create_tables():
    """Creates any of the tables that don't exist yet. Existing tables are left alone."""
    Base.metadata.create_all(engine)


def seed():
    """Adds the ticket categories and the first admin if they aren't there yet."""
    with SessionLocal() as db:
        existing = set(db.scalars(select(TicketCategory.name)))
        for name, category_type in CATEGORIES:
            if name not in existing:
                db.add(TicketCategory(name=name, type=category_type))

        if db.scalar(select(User).where(User.email == FIRST_ADMIN_EMAIL)) is None:
            db.add(User(email=FIRST_ADMIN_EMAIL, full_name="Facility Admin",
                        password_hash=FIRST_ADMIN_PASSWORD_HASH, role="admin"))

        db.commit()
