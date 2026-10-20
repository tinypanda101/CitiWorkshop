"""
Talks to PostgreSQL for every service.

One connection is kept in PG_CONN and reused between Lambda calls (the same idea as
backend/_examples/python-service/postgres_service.py), so each request doesn't have to
connect again. Each statement is saved straight away (autocommit).
"""

import os

from psycopg import connect
from psycopg.rows import dict_row

# Settings come from the environment variables every Lambda gets (infra/locals.tf).
# The defaults are the local PostgreSQL used during development.
PG_CONFIG = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"user={os.getenv('POSTGRES_USER', 'postgres')} "
    f"password={os.getenv('POSTGRES_PASS', 'postgres123')} "
    f"dbname={os.getenv('POSTGRES_NAME', 'postgres')} "
    f"connect_timeout=15"
)

PG_CONN = None


def _connection():
    """Returns the shared connection, opening a new one if there isn't one or it was lost."""
    global PG_CONN
    if PG_CONN is None or PG_CONN.closed:
        PG_CONN = connect(PG_CONFIG, autocommit=True, row_factory=dict_row)
    return PG_CONN


def query(sql, params=()):
    """Runs a SELECT and returns every row as a dict, e.g. [{"id": 1, "name": "HVAC"}]."""
    with _connection().cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def execute(sql, params=()):
    """Runs an INSERT, UPDATE or DELETE. Returns the RETURNING row as a dict, or None."""
    with _connection().cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone() if cur.description else None
