-- Starting data the app needs on day one.
-- Safe to run more than once: ON CONFLICT DO NOTHING skips rows that are already there.

-- Ticket categories (read-only in the app).
INSERT INTO ticket_categories (name, type) VALUES
    ('HVAC / Temperature', 'facility'),
    ('Electrical / Lighting', 'facility'),
    ('Plumbing', 'facility'),
    ('Cleaning', 'facility'),
    ('Access / Security', 'facility'),
    ('Network / Wi-Fi', 'technology'),
    ('Printers / Scanners', 'technology'),
    ('Desk Equipment / Monitors', 'technology')
ON CONFLICT (name) DO NOTHING;

-- The first Facility Admin. Only the bcrypt hash of the starting password is stored here;
-- log in with the starting password once and change it straight away.
INSERT INTO users (email, full_name, password_hash, role) VALUES
    ('admin@acme.inc', 'Facility Admin', '$2b$12$6ONYelqjnZmIxUUUsHpr5uOZWeh8UWIRVkS8JdN/shl3FCGv6WACa', 'admin')
ON CONFLICT (email) DO NOTHING;
