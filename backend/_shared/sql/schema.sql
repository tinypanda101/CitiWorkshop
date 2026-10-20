-- Creates the 8 tables for the ACME ticket app.
-- Safe to run more than once: IF NOT EXISTS skips tables that are already there.
-- Tables are created in order, so every table a row links to already exists.

-- Everyone who can log in. The role decides what they can see and do.
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'engineer', 'admin')),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extra details for users whose role is engineer.
CREATE TABLE IF NOT EXISTS engineer_profiles (
    user_id      BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    specialty    TEXT NOT NULL CHECK (specialty IN ('facility', 'technology')),
    availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'off_duty')),
    phone        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS buildings (
    id         BIGSERIAL PRIMARY KEY,
    code       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    address    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deleting a building deletes its floors (unless a ticket uses one).
CREATE TABLE IF NOT EXISTS floors (
    id          BIGSERIAL PRIMARY KEY,
    building_id BIGINT NOT NULL REFERENCES buildings (id) ON DELETE CASCADE,
    level       INTEGER NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (building_id, level)
);

-- Deleting a floor deletes its seats (unless a ticket uses one).
CREATE TABLE IF NOT EXISTS seats (
    id         BIGSERIAL PRIMARY KEY,
    floor_id   BIGINT NOT NULL REFERENCES floors (id) ON DELETE CASCADE,
    code       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (floor_id, code)
);

-- The kinds of problem people can report. Filled by seed.sql.
CREATE TABLE IF NOT EXISTS ticket_categories (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    type       TEXT NOT NULL CHECK (type IN ('facility', 'technology')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The tickets. Shown to people as TKT- + (1000 + id), e.g. id 1 is TKT-1001.
-- Links to buildings, floors and seats have no ON DELETE rule, so the database
-- refuses to delete any building, floor or seat that a ticket still uses.
CREATE TABLE IF NOT EXISTS tickets (
    id                 BIGSERIAL PRIMARY KEY,
    title              TEXT NOT NULL,
    description        TEXT NOT NULL,
    category_id        BIGINT NOT NULL REFERENCES ticket_categories (id),
    building_id        BIGINT NOT NULL REFERENCES buildings (id),
    floor_id           BIGINT REFERENCES floors (id),
    seat_id            BIGINT REFERENCES seats (id),
    status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'resolved', 'closed')),
    priority           TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    reporter_id        BIGINT NOT NULL REFERENCES users (id),
    assignee_id        BIGINT REFERENCES users (id),
    blocked_reason     TEXT,
    resolution_summary TEXT,
    escalation_status  TEXT NOT NULL DEFAULT 'none' CHECK (escalation_status IN ('none', 'pending', 'approved', 'rejected')),
    requested_priority TEXT CHECK (requested_priority IN ('high', 'critical')),
    escalation_reason  TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_at        TIMESTAMPTZ,
    resolved_at        TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The conversation on a ticket. Deleting a ticket deletes its notes.
CREATE TABLE IF NOT EXISTS ticket_notes (
    id         BIGSERIAL PRIMARY KEY,
    ticket_id  BIGINT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    author_id  BIGINT NOT NULL REFERENCES users (id),
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
