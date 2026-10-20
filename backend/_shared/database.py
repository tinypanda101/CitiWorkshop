"""
The database connection every service uses.

Settings come from the environment variables every Lambda gets (infra/locals.tf).
The defaults are the local PostgreSQL used during development.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker

DATABASE_URL = URL.create(
    "postgresql+psycopg",
    username=os.getenv("POSTGRES_USER", "postgres"),
    password=os.getenv("POSTGRES_PASS", "postgres123"),
    host=os.getenv("POSTGRES_HOST", "localhost"),
    port=int(os.getenv("POSTGRES_PORT", "5432")),
    database=os.getenv("POSTGRES_NAME", "postgres"),
)

# The engine keeps connections open and reuses them between Lambda calls.
# pool_pre_ping checks a connection still works before using it.
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine)


def get_db():
    """FastAPI dependency: gives each request its own session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
