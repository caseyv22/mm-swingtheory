-- ============================================================
-- Swing Theory Unified Platform — D1 Schema v2.0
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  clerk_id      TEXT UNIQUE NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'student',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS children (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT NOT NULL REFERENCES users(id),
  first_name    TEXT NOT NULL,
  age           INTEGER,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS instructors (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE REFERENCES users(id),
  bio           TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS programs (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  description           TEXT,
  booking_type          TEXT NOT NULL DEFAULT 'group',
  booker_type           TEXT NOT NULL DEFAULT 'student',
  session_days          TEXT,
  start_time            TEXT,
  end_time              TEXT,
  default_capacity      INTEGER DEFAULT 10,
  price_display         TEXT,
  show_instructor       INTEGER DEFAULT 0,
  forward_view_weeks    INTEGER DEFAULT 2,
  forward_view_enabled  INTEGER DEFAULT 1,
  cancellation_hours    INTEGER DEFAULT 24,
  max_bookings_per_week INTEGER DEFAULT 1,
  is_active             INTEGER DEFAULT 1,
  created_at            TEXT DEFAULT (datetime('now')),
  updated_at            TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  program_id    TEXT NOT NULL REFERENCES programs(id),
  instructor_id TEXT REFERENCES instructors(id),
  bay           TEXT,
  date          TEXT NOT NULL,
  day_of_week   TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  capacity      INTEGER NOT NULL DEFAULT 10,
  is_cancelled  INTEGER DEFAULT 0,
  cancel_reason TEXT,
  notes         TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  child_id      TEXT REFERENCES children(id),
  status        TEXT NOT NULL DEFAULT 'confirmed',
  booked_at     TEXT DEFAULT (datetime('now')),
  cancelled_at  TEXT,
  checked_in    INTEGER DEFAULT 0,
  checked_in_at TEXT,
  UNIQUE(session_id, user_id)
);

CREATE TABLE IF NOT EXISTS availability (
  id            TEXT PRIMARY KEY,
  instructor_id TEXT NOT NULL REFERENCES instructors(id),
  program_id    TEXT NOT NULL REFERENCES programs(id),
  bay           TEXT NOT NULL,
  date          TEXT NOT NULL,
  start_time    TEXT NOT NULL,
  end_time      TEXT NOT NULL,
  is_booked     INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  admin_email   TEXT DEFAULT 'info@swingtheory.golf',
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- Seed
INSERT OR IGNORE INTO config (id) VALUES (1);

INSERT OR IGNORE INTO programs (id, name, slug, booking_type, booker_type, session_days, start_time, end_time, default_capacity, price_display, show_instructor, forward_view_weeks, cancellation_hours, max_bookings_per_week)
VALUES ('prog_mm', 'Mini Mulligans', 'mini-mulligans', 'group', 'parent', 'tuesday,thursday', '16:00', '17:00', 10, '$169/month', 0, 2, 24, 1);

INSERT OR IGNORE INTO programs (id, name, slug, booking_type, booker_type, session_days, start_time, end_time, default_capacity, price_display, show_instructor, forward_view_weeks, cancellation_hours, max_bookings_per_week)
VALUES ('prog_sp', 'Summer Program', 'summer-program', 'group', 'student', 'tuesday,wednesday,friday', '10:00', '12:00', 10, null, 0, 2, 24, 3);

INSERT OR IGNORE INTO programs (id, name, slug, booking_type, booker_type, session_days, start_time, end_time, default_capacity, price_display, show_instructor, forward_view_weeks, cancellation_hours, max_bookings_per_week)
VALUES ('prog_tai', 'Theory AI Coaching', 'theory-ai', 'one-on-one', 'student', null, null, null, 1, null, 1, 2, 24, 1);
