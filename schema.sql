-- ============================================================
-- Mini Mulligans — D1 Database Schema
-- Paste this entire file into: Cloudflare Dashboard → D1 → mm-db → Query tab → Execute
-- ============================================================

-- Members: parent account + child info
CREATE TABLE IF NOT EXISTS members (
  id           TEXT PRIMARY KEY,
  parent_name  TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  phone        TEXT,
  kid_name     TEXT NOT NULL,
  kid_age      INTEGER,
  clerk_id     TEXT UNIQUE,
  status       TEXT DEFAULT 'active',
  created_at   TEXT DEFAULT (datetime('now'))
);

-- Sessions: one row per bookable session date
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,
  day_of_week   TEXT NOT NULL,
  start_time    TEXT DEFAULT '16:00',
  end_time      TEXT DEFAULT '17:00',
  capacity      INTEGER DEFAULT 10,
  is_cancelled  INTEGER DEFAULT 0,
  cancel_reason TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- Bookings: links a member to a session
CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  member_id     TEXT NOT NULL REFERENCES members(id),
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  status        TEXT DEFAULT 'confirmed',
  booked_at     TEXT DEFAULT (datetime('now')),
  cancelled_at  TEXT,
  checked_in    INTEGER DEFAULT 0,
  checked_in_at TEXT,
  UNIQUE(member_id, session_id)
);

-- Config: single-row global settings table
CREATE TABLE IF NOT EXISTS config (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  session_days          TEXT    DEFAULT 'tuesday,thursday',
  forward_view_weeks    INTEGER DEFAULT 2,
  forward_view_enabled  INTEGER DEFAULT 1,
  cancellation_hours    INTEGER DEFAULT 24,
  max_bookings_per_week INTEGER DEFAULT 1,
  default_capacity      INTEGER DEFAULT 10,
  admin_email           TEXT    DEFAULT 'info@swingtheory.golf',
  updated_at            TEXT    DEFAULT (datetime('now'))
);

-- Seed the config row (only inserts if it doesn't already exist)
INSERT OR IGNORE INTO config (id) VALUES (1);

-- ============================================================
-- Test sessions — seed a few upcoming Tuesdays and Thursdays
-- for frontend development. Delete these before go-live or leave
-- them — the cron will not duplicate dates that already exist.
-- Adjust dates to be in your current forward window.
-- ============================================================
INSERT OR IGNORE INTO sessions (id, date, day_of_week) VALUES
  ('sess_test_001', '2026-04-29', 'tuesday'),
  ('sess_test_002', '2026-05-01', 'thursday'),
  ('sess_test_003', '2026-05-06', 'tuesday'),
  ('sess_test_004', '2026-05-08', 'thursday'),
  ('sess_test_005', '2026-05-13', 'tuesday'),
  ('sess_test_006', '2026-05-15', 'thursday');
