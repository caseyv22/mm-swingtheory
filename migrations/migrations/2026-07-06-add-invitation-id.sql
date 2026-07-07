-- ──────────────────────────────────────────────────────────────────────────────
-- Add invitation_id to users so admin-invited members can be tracked between
-- "invitation created" and "user accepted." Populated by POST /admin/members
-- when it creates a Clerk Invitation instead of a Clerk User, cleared by
-- POST /users/complete-invitation when the invitee sets their password.
--
-- Also consumed by POST /admin/members/:id/resend-invite (revokes old +
-- issues new) and DELETE /admin/members/:id (revokes if still pending, so a
-- deleted row can't leave a live invite link lying around).
--
-- Where: Cloudflare Dashboard → D1 → mm-db-prod → Console
--
-- No backfill needed. Existing rows leave invitation_id NULL, which is what
-- the code expects for "member is already a real Clerk user, no pending
-- invite to worry about."
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN invitation_id TEXT;
