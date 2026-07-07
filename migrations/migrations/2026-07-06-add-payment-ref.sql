-- ──────────────────────────────────────────────────────────────────────────────
-- Add payment_ref to enrollments for idempotency on the /internal/enrollments
-- endpoint (Phase 3). Callers (e.g. swingtheoryv2 checkout) pass the upstream
-- payment id (Square payment id, Stripe intent id, etc). The partial unique
-- index enforces "one enrollment per payment" so retries and refresh-during-
-- checkout can't double-provision — while still allowing all existing rows
-- (payment_ref IS NULL) to coexist with no changes.
--
-- Where: Cloudflare Dashboard → D1 → mm-db-prod → Console
--
-- No backfill needed. Existing enrollments (paid via admin action or Registry
-- webhook, or unpaid) leave payment_ref NULL, which is what /internal/
-- enrollments treats as "not from a website checkout, ignore for idempotency."
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE enrollments ADD COLUMN payment_ref TEXT;

CREATE UNIQUE INDEX idx_enrollments_payment_ref
  ON enrollments(payment_ref)
  WHERE payment_ref IS NOT NULL;
