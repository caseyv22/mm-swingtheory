-- ──────────────────────────────────────────────────────────────────────────────
-- BACKUP — Run this BEFORE running 2026-05-03-add-webhook-fields.sql
-- Where: Cloudflare Dashboard → D1 → mm-db-prod → Console
--
-- What this does:
--   Creates a sister table `_backup_private_lessons_2026_05_03` containing a
--   complete copy of every row in private_lessons, with the exact same schema
--   as the live table. It's stored in the same database, so it survives even
--   if the live table is dropped.
--
-- Why a sister table instead of a CSV download:
--   - Stays inside D1 (no copy-paste boundary that can lose data)
--   - Preserves exact column types
--   - Restorable with a single INSERT statement
--   - Survives browser tab closes, page reloads, etc.
--
-- After successful migration AND verification (see DROP_BACKUP.sql), you can
-- delete this backup. Until then, leave it alone.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE _backup_private_lessons_2026_05_03 AS
SELECT * FROM private_lessons;

-- Verify the row count matches
SELECT
  (SELECT COUNT(*) FROM private_lessons)              AS live_count,
  (SELECT COUNT(*) FROM _backup_private_lessons_2026_05_03) AS backup_count;

-- These two numbers MUST be equal. If they differ, STOP and figure out why
-- before running the migration. Likely there's a permission issue or a
-- concurrent write happened mid-copy.
