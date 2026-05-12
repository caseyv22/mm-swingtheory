import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClerkClient } from '@clerk/backend'
import { verifyAuth } from './lib/auth.js'
import {
  sendEmail,
  bookingConfirmedEmail,
  bookingConfirmedAdminEmail,
  bookingCancelledEmail,
  bookingCancelledAdminEmail,
  sessionCancelledEmail,
  reminderEmail,
  welcomeEmail,
  passwordResetEmail,
} from './lib/email.js'
import {
  leaguePointsForPlacement,
  fedexPointsForPlacement,
  normalizePlacement,
  normalizeHole,
  normalizeNine,
  normalizeSlot,
  composeTeamName,
  MAX_TEAMS_PER_LEAGUE,
  DEFAULT_SEASON_WEEKS,
} from './lib/tournamentPoints.js'

const app = new Hono()

// Global error handler — always return JSON, never HTML
app.onError((err, c) => {
  console.error('Worker error:', err.message)
  return c.json({ error: err.message || 'Internal server error' }, 500)
})

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use('*', cors({
  origin: ['https://mm-1a4.pages.dev', 'https://mm.swingtheory.golf', 'https://sync-swingtheory-prod.pages.dev', 'https://sync.swingtheory.golf'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-subdomain'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────────────────────
// Wraps your existing auth.js verifyAuth into Hono middleware.
// Role is checked against D1 users table (source of truth for the app).

async function requireAuth(c, next) {
  const payload = await verifyAuth(c.req.raw, c.env)
  if (!payload) return c.json({ error: 'Unauthorized' }, 401)
  c.set('clerkId', payload.sub)
  await next()
}

async function requireAdmin(c, next) {
  const payload = await verifyAuth(c.req.raw, c.env)
  if (!payload) return c.json({ error: 'Unauthorized' }, 401)
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(payload.sub).first()
  if (!user || user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
  c.set('clerkId', payload.sub)
  c.set('user', user)
  await next()
}

async function requireInstructor(c, next) {
  const payload = await verifyAuth(c.req.raw, c.env)
  if (!payload) return c.json({ error: 'Unauthorized' }, 401)
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(payload.sub).first()
  if (!user || (user.role !== 'instructor' && user.role !== 'admin')) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  c.set('clerkId', payload.sub)
  c.set('user', user)
  await next()
}

// Allow admins AND swingers — used on session-management endpoints
async function requireAdminOrSwinger(c, next) {
  const payload = await verifyAuth(c.req.raw, c.env)
  if (!payload) return c.json({ error: 'Unauthorized' }, 401)
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(payload.sub).first()
  if (!user || (user.role !== 'admin' && user.role !== 'swinger')) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  c.set('clerkId', payload.sub)
  c.set('user', user)
  await next()
}

// Allow only swingers — for personal practice log endpoints
async function requireSwinger(c, next) {
  const payload = await verifyAuth(c.req.raw, c.env)
  if (!payload) return c.json({ error: 'Unauthorized' }, 401)
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(payload.sub).first()
  if (!user || user.role !== 'swinger') {
    return c.json({ error: 'Forbidden' }, 403)
  }
  c.set('clerkId', payload.sub)
  c.set('user', user)
  await next()
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function uid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20)
}

// ─── PUBLIC WEBHOOKS ─────────────────────────────────────────────────────────
// These endpoints are intentionally NOT behind Clerk auth — they are called by
// external services (booking platforms etc). Each one is gated by a shared
// secret in the URL (?key=…) verified against an env var. Rotate the secret
// by updating the env var in the Cloudflare dashboard.

// POST /webhooks/registry — Registry Golf tee-time booking webhook
//
// Auth:
//   ?key=<REGISTRY_WEBHOOK_SECRET env var> (required, exact match)
//
// Expected payload (Booking.Created):
//   {
//     "event": "Booking.Created",
//     "id":    "<booking uuid>",        — used as our external_ref (idempotency)
//     "date":  "YYYY-MM-DDTHH:MM:SS",   — wall-clock, no timezone (Pacific local)
//     "startTime": "HH:MM:SS",
//     "endTime":   "HH:MM:SS",
//     "bay":   "Private - Kapalua Bay",
//     "customer": {
//       "name":  "First Last",
//       "email": "lower-or-mixed-case@host.com"
//     }
//   }
//
// Behavior:
//   - Verifies key. 401 if missing/wrong.
//   - Validates body shape. 400 if malformed.
//   - For events other than Booking.Created: logs and 200s with action 'ignored'
//     so Registry Golf doesn't keep retrying unsupported events.
//   - For Booking.Created: looks up the instructor by lowercased email. If the
//     email doesn't match an instructor user in our DB, silently drops with
//     action 'no_match' (per business rule).
//   - Idempotent: if a private_lessons row already exists with the same
//     external_ref, returns action 'duplicate' without creating anything. The
//     UNIQUE INDEX on (external_ref) is the backstop if a race somehow slips
//     past the pre-check.
//   - On success, inserts a private_lessons row with student_id = NULL,
//     source = 'webhook', external_ref = <booking id>. Admin assigns a student
//     later in the Sync UI.
//   - Always returns HTTP 200 within ~1s for happy paths so Registry Golf
//     considers the delivery successful and doesn't queue retries.
app.post('/webhooks/registry', async (c) => {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const expected = c.env.REGISTRY_WEBHOOK_SECRET
  if (!expected) {
    // Misconfigured server — fail closed.
    console.error('[webhook/registry] REGISTRY_WEBHOOK_SECRET not set')
    return c.json({ error: 'Webhook not configured' }, 500)
  }
  const provided = c.req.query('key') || ''
  if (provided !== expected) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // ── 2. Parse + shape-validate payload ───────────────────────────────────
  let payload
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const event = payload?.event
  const bookingId = payload?.id
  if (!event || typeof event !== 'string') {
    return c.json({ error: 'Missing event' }, 400)
  }

  // ── 3. Branch on event type ──────────────────────────────────────────────
  // We currently only auto-create lessons on Booking.Created. Cancelled /
  // Updated etc. are accepted but no-ops, so Registry Golf doesn't retry them.
  if (event !== 'Booking.Created') {
    console.log(`[webhook/registry] ignored event=${event} id=${bookingId || ''}`)
    return c.json({ ok: true, action: 'ignored', reason: `Unsupported event: ${event}` })
  }

  if (!bookingId || typeof bookingId !== 'string') {
    return c.json({ error: 'Missing booking id' }, 400)
  }

  const dateRaw = payload?.date
  const startTime = payload?.startTime
  const endTime = payload?.endTime
  const customerEmail = payload?.customer?.email
  const bay = payload?.bay || null

  if (!dateRaw || typeof dateRaw !== 'string') {
    return c.json({ error: 'Missing date' }, 400)
  }
  if (!startTime || typeof startTime !== 'string') {
    return c.json({ error: 'Missing startTime' }, 400)
  }
  if (!endTime || typeof endTime !== 'string') {
    return c.json({ error: 'Missing endTime' }, 400)
  }
  if (!customerEmail || typeof customerEmail !== 'string') {
    return c.json({ error: 'Missing customer.email' }, 400)
  }

  // Registry Golf sends date as `YYYY-MM-DDTHH:MM:SS` (wall-clock, no tz).
  // Take only the date portion — start_time/end_time are separate fields.
  const date = String(dateRaw).split('T')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Invalid date format' }, 400)
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTime) || !/^\d{2}:\d{2}(:\d{2})?$/.test(endTime)) {
    return c.json({ error: 'Invalid time format' }, 400)
  }

  // ── 4. Idempotency: existing row with this booking id? ──────────────────
  const existing = await c.env.DB.prepare(
    'SELECT id FROM private_lessons WHERE external_ref = ?'
  ).bind(bookingId).first()
  if (existing) {
    console.log(`[webhook/registry] duplicate id=${bookingId} email=${customerEmail}`)
    return c.json({ ok: true, action: 'duplicate', lesson_id: existing.id })
  }

  // ── 5. Match instructor by email (lowercase compare) ────────────────────
  const emailNorm = String(customerEmail).trim().toLowerCase()
  const matchedUser = await c.env.DB.prepare(
    "SELECT id, full_name FROM users WHERE lower(email) = ? AND role = 'instructor'"
  ).bind(emailNorm).first()
  if (!matchedUser) {
    console.log(`[webhook/registry] no_match email=${customerEmail} id=${bookingId}`)
    return c.json({ ok: true, action: 'no_match' })
  }

  const instructorRow = await c.env.DB.prepare(
    'SELECT id FROM instructors WHERE user_id = ?'
  ).bind(matchedUser.id).first()
  if (!instructorRow) {
    // User has role=instructor but no instructors row — treat as no_match,
    // surface in logs so admin can fix the record.
    console.warn(`[webhook/registry] no instructors row for user ${matchedUser.id} (${emailNorm})`)
    return c.json({ ok: true, action: 'no_match' })
  }

  // ── 6. Build lesson + insert ─────────────────────────────────────────────
  // notes is intentionally NULL on webhook-created rows: the `source='webhook'`
  // column is the source-of-truth for "this came from Registry", and the
  // instructor-only "Registry" pill on the lesson detail surfaces it in the UI.
  // Students see the same lesson, so we don't leak customer name/email or
  // upstream-system identifiers into a field they can read.
  const lessonId = 'lesson_' + uid()

  try {
    await c.env.DB.prepare(`
      INSERT INTO private_lessons
        (id, instructor_id, student_id, date, start_time, end_time, bay, notes, source, external_ref)
      VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, 'webhook', ?)
    `).bind(lessonId, instructorRow.id, date, startTime, endTime, bay, bookingId).run()
  } catch (err) {
    // Race condition: another concurrent webhook invocation slipped past the
    // pre-check and got here first. The unique index will reject. Treat as
    // duplicate so Registry Golf doesn't retry.
    const msg = String(err?.message || err)
    if (msg.toLowerCase().includes('unique')) {
      console.log(`[webhook/registry] duplicate_race id=${bookingId}`)
      return c.json({ ok: true, action: 'duplicate' })
    }
    console.error(`[webhook/registry] insert_failed id=${bookingId}: ${msg}`)
    return c.json({ error: 'Insert failed' }, 500)
  }

  console.log(`[webhook/registry] created lesson=${lessonId} email=${emailNorm} id=${bookingId}`)
  return c.json({ ok: true, action: 'created', lesson_id: lessonId })
})

// ─── AUTH ROUTES ─────────────────────────────────────────────────────────────

// GET /users/me
app.get('/users/me', requireAuth, async (c) => {
  const clerkId = c.get('clerkId')
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(clerkId).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  let child = null
  if (user.role === 'parent') {
    child = await c.env.DB.prepare(
      'SELECT * FROM children WHERE parent_id = ?'
    ).bind(user.id).first()
  }

  let instructor = null
  if (user.role === 'instructor') {
    instructor = await c.env.DB.prepare(
      'SELECT * FROM instructors WHERE user_id = ?'
    ).bind(user.id).first()
  }

  return c.json({ user, child, instructor })
})

// PUT /users/me
app.put('/users/me', requireAuth, async (c) => {
  const clerkId = c.get('clerkId')
  const { phone } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE users SET phone = ? WHERE clerk_id = ?'
  ).bind(phone, clerkId).run()
  return c.json({ ok: true })
})

// POST /users/child
app.post('/users/child', requireAuth, async (c) => {
  const clerkId = c.get('clerkId')
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(clerkId).first()
  if (!user || user.role !== 'parent') return c.json({ error: 'Forbidden' }, 403)

  const { first_name, age } = await c.req.json()
  const existing = await c.env.DB.prepare(
    'SELECT id FROM children WHERE parent_id = ?'
  ).bind(user.id).first()

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE children SET first_name = ?, age = ? WHERE parent_id = ?'
    ).bind(first_name, age, user.id).run()
    return c.json({ ok: true, updated: true })
  } else {
    const id = 'child_' + uid()
    await c.env.DB.prepare(
      'INSERT INTO children (id, parent_id, first_name, age) VALUES (?, ?, ?, ?)'
    ).bind(id, user.id, first_name, age).run()
    return c.json({ ok: true, created: true })
  }
})

// PUT /users/me/password — user changes their own password (clears must_change_password flag)
app.put('/users/me/password', requireAuth, async (c) => {
  const clerkId = c.get('clerkId')
  const { new_password } = await c.req.json()

  if (!new_password || new_password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  // Update password in Clerk
  const clerkRes = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: new_password, skip_password_checks: false }),
  })

  if (!clerkRes.ok) {
    const err = await clerkRes.json()
    const msg = err?.errors?.[0]?.long_message || err?.errors?.[0]?.message || 'Failed to update password'
    return c.json({ error: msg }, 400)
  }

  // Clear the must_change_password flag in D1
  await c.env.DB.prepare(
    'UPDATE users SET must_change_password = 0 WHERE clerk_id = ?'
  ).bind(clerkId).run()

  return c.json({ ok: true })
})

// NOTE: POST /auth/forgot-password was removed in v3.4. The frontend now uses
// Clerk's reset_password_email_code strategy directly via the SDK — Clerk
// emails the OTP code itself, no backend involvement needed. The previous
// implementation called Clerk's /password_reset_links endpoint which doesn't
// exist (returns 404).

// POST /admin/members/:id/resend-temp-password — admin regenerates temp password and resends welcome email
app.post('/admin/members/:id/resend-temp-password', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  if (!user) return c.json({ error: 'User not found' }, 404)
  if (!user.clerk_id) return c.json({ error: 'No Clerk account linked' }, 400)

  const tempPassword = 'swing-' + Math.floor(1000 + Math.random() * 9000)

  // Update password in Clerk
  const updateRes = await fetch(`https://api.clerk.com/v1/users/${user.clerk_id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: tempPassword, skip_password_checks: true }),
  })

  if (!updateRes.ok) {
    const err = await updateRes.json()
    const msg = err?.errors?.[0]?.long_message || err?.errors?.[0]?.message || 'Failed to update password'
    return c.json({ error: msg }, 500)
  }

  // Set must_change_password = 1 again
  await c.env.DB.prepare(
    'UPDATE users SET must_change_password = 1 WHERE id = ?'
  ).bind(id).run()

  // Send the welcome email with new temp password
  try {
    const { subject, html } = welcomeEmail({
      recipientName: user.full_name,
      role: user.role,
      email: user.email,
      tempPassword,
    })
    await sendEmail(c.env, { to: user.email, subject, html })
  } catch (e) {
    console.error('Resend welcome email failed:', e.message)
  }

  return c.json({ ok: true, temp_password: tempPassword })
})

// ─── SESSION ROUTES (public / parent / student) ───────────────────────────────

// GET /programs — list active programs (used by parent/student program selector)
app.get('/programs', requireAuth, async (c) => {
  const clerkId = c.get('clerkId')

  // Default: list all active programs (existing behavior).
  // When ENROLLMENT_ENFORCEMENT=on, parents/students only see programs they're
  // enrolled in. Admin/instructor/swinger always see everything.
  if (c.env.ENROLLMENT_ENFORCEMENT === 'on') {
    const user = await c.env.DB.prepare(
      'SELECT id, role FROM users WHERE clerk_id = ?'
    ).bind(clerkId).first()

    if (user && (user.role === 'parent' || user.role === 'student')) {
      const programs = await c.env.DB.prepare(`
        SELECT p.* FROM programs p
        JOIN enrollments e ON e.program_id = p.id
        WHERE p.is_active = 1
          AND e.user_id = ?
          AND e.is_active = 1
        ORDER BY p.created_at ASC
      `).bind(user.id).all()
      return c.json({ programs: programs.results })
    }
  }

  const programs = await c.env.DB.prepare(
    'SELECT * FROM programs WHERE is_active = 1 ORDER BY created_at ASC'
  ).all()
  return c.json({ programs: programs.results })
})

// GET /programs/:slug/sessions
app.get('/programs/:slug/sessions', requireAuth, async (c) => {
  const { slug } = c.req.param()
  const clerkId = c.get('clerkId')

  const program = await c.env.DB.prepare(
    'SELECT * FROM programs WHERE slug = ? AND is_active = 1'
  ).bind(slug).first()
  if (!program) return c.json({ error: 'Program not found' }, 404)

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(clerkId).first()

  // ─── Enrollment gate (v3.3) ─────────────────────────────────────────────────
  // When flag is on, parent/student users must be enrolled to view the calendar.
  // Other roles (admin, instructor, swinger) bypass this.
  if (c.env.ENROLLMENT_ENFORCEMENT === 'on' && user && (user.role === 'parent' || user.role === 'student')) {
    const enrollment = await c.env.DB.prepare(`
      SELECT id FROM enrollments
      WHERE user_id = ? AND program_id = ? AND is_active = 1
    `).bind(user.id, program.id).first()
    if (!enrollment) {
      return c.json({
        error: 'You are not enrolled in this program. Please contact your admin to be added.',
      }, 403)
    }
  }

  const weeks = program.forward_view_enabled ? (program.forward_view_weeks || 2) : 0
  const today = new Date().toISOString().split('T')[0]
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + weeks * 7)
  const endDate = futureDate.toISOString().split('T')[0]

  const sessions = await c.env.DB.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') as booked_count,
      i.id as instr_id, u2.full_name as instructor_name,
      CASE WHEN EXISTS (
        SELECT 1 FROM bookings b2 WHERE b2.session_id = s.id AND b2.user_id = ? AND b2.status = 'confirmed'
      ) THEN 1 ELSE 0 END as is_booked_by_me
    FROM sessions s
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u2 ON i.user_id = u2.id
    WHERE s.program_id = ? AND s.date >= ? AND s.date <= ?
    ORDER BY s.date ASC, s.start_time ASC
  `).bind(user?.id || '', program.id, today, endDate).all()

  // Add spots_remaining to each session
  const sessionsWithSpots = sessions.results.map(s => ({
    ...s,
    spots_remaining: s.capacity - (s.booked_count || 0),
  }))

  return c.json({ program, sessions: sessionsWithSpots })
})

// POST /bookings
app.post('/bookings', requireAuth, async (c) => {
  const clerkId = c.get('clerkId')
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(clerkId).first()
  if (!user || user.status !== 'active') return c.json({ error: 'Account inactive' }, 403)

  const { session_id } = await c.req.json()
  const session = await c.env.DB.prepare(
    'SELECT s.*, p.max_bookings_per_week, p.cancellation_hours, p.booker_type FROM sessions s JOIN programs p ON s.program_id = p.id WHERE s.id = ?'
  ).bind(session_id).first()
  if (!session) return c.json({ error: 'Session not found' }, 404)
  if (session.is_cancelled) return c.json({ error: 'Session is cancelled' }, 400)

  // Enforce booker_type — only the correct role can book this program
  if (session.booker_type === 'parent' && user.role !== 'parent') {
    return c.json({ error: 'This program can only be booked by a parent' }, 403)
  }
  if (session.booker_type === 'student' && user.role !== 'student') {
    return c.json({ error: 'This program can only be booked by a student' }, 403)
  }

  // ─── Enrollment gate (v3.3) ─────────────────────────────────────────────────
  // Gated behind ENROLLMENT_ENFORCEMENT env var so we can deploy the code dark
  // and flip on after backfill is verified. Set to 'on' in Cloudflare → Workers
  // → mm-api-prod → Settings → Variables and Secrets to enable.
  // Admin/Swinger/Instructor manual booking endpoints bypass this entirely.
  if (c.env.ENROLLMENT_ENFORCEMENT === 'on') {
    const enrollment = await c.env.DB.prepare(`
      SELECT e.id FROM enrollments e
      JOIN programs p ON e.program_id = p.id
      WHERE e.user_id = ?
        AND e.program_id = ?
        AND e.is_active = 1
        AND p.is_active = 1
        AND (e.start_date IS NULL OR e.start_date <= ?)
        AND (e.end_date IS NULL OR e.end_date >= ?)
    `).bind(user.id, session.program_id, session.date, session.date).first()
    if (!enrollment) {
      return c.json({
        error: 'You are not enrolled in this program. Please contact your admin to be added.',
      }, 403)
    }
  }

  const now = new Date()
  const sessionDate = new Date(session.date + 'T' + session.start_time)
  if (sessionDate < now) return c.json({ error: 'Cannot book past sessions' }, 400)

  // Capacity check
  const bookedCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM bookings WHERE session_id = ? AND status = 'confirmed'"
  ).bind(session_id).first()
  if (bookedCount.cnt >= session.capacity) return c.json({ error: 'Session is full' }, 400)

  // Weekly limit check
  const weekStart = new Date(session.date)
  const day = weekStart.getDay()
  weekStart.setDate(weekStart.getDate() - day)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const weeklyCount = await c.env.DB.prepare(`
    SELECT COUNT(*) as cnt FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    WHERE b.user_id = ? AND s.program_id = ? AND s.date >= ? AND s.date <= ? AND b.status = 'confirmed'
  `).bind(user.id, session.program_id, weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]).first()

  if (weeklyCount.cnt >= session.max_bookings_per_week) {
    return c.json({ error: 'Weekly booking limit reached' }, 400)
  }

  // Child for parent
  let child_id = null
  if (user.role === 'parent') {
    const child = await c.env.DB.prepare(
      'SELECT id FROM children WHERE parent_id = ?'
    ).bind(user.id).first()
    if (!child) return c.json({ error: 'No child record found. Please complete your account setup.' }, 400)
    child_id = child.id
  }

  // Check for existing confirmed booking
  const existingConfirmed = await c.env.DB.prepare(
    "SELECT id FROM bookings WHERE session_id = ? AND user_id = ? AND status = 'confirmed'"
  ).bind(session_id, user.id).first()
  if (existingConfirmed) return c.json({ error: 'Already booked' }, 400)

  // Check for existing cancelled booking — reactivate it instead of inserting new
  const existingCancelled = await c.env.DB.prepare(
    "SELECT id FROM bookings WHERE session_id = ? AND user_id = ? AND status = 'cancelled'"
  ).bind(session_id, user.id).first()

  let id
  if (existingCancelled) {
    // Reactivate the cancelled booking
    await c.env.DB.prepare(
      "UPDATE bookings SET status = 'confirmed', cancelled_at = NULL, booked_at = datetime('now'), child_id = ? WHERE id = ?"
    ).bind(child_id, existingCancelled.id).run()
    id = existingCancelled.id
  } else {
    id = 'bkg_' + uid()
    try {
      await c.env.DB.prepare(
        'INSERT INTO bookings (id, session_id, user_id, child_id, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, session_id, user.id, child_id, 'confirmed').run()
    } catch (e) {
      if (e.message?.includes('UNIQUE')) return c.json({ error: 'Already booked' }, 400)
      throw e
    }
  }

  // Send confirmation emails (non-blocking)
  try {
    const session2 = await c.env.DB.prepare(`
      SELECT s.*, p.name as program_name, p.booker_type,
        u2.full_name as instructor_name
      FROM sessions s
      JOIN programs p ON s.program_id = p.id
      LEFT JOIN instructors i ON s.instructor_id = i.id
      LEFT JOIN users u2 ON i.user_id = u2.id
      WHERE s.id = ?
    `).bind(session_id).first()

    const child2 = child_id ? await c.env.DB.prepare('SELECT first_name FROM children WHERE id = ?').bind(child_id).first() : null
    const config = await c.env.DB.prepare('SELECT admin_email FROM config WHERE id = 1').first()
    const adminEmail = config?.admin_email || 'info@swingtheory.golf'

    const { subject, html } = bookingConfirmedEmail({
      recipientName: user.full_name,
      programName: session2.program_name,
      date: session2.date,
      startTime: session2.start_time,
      endTime: session2.end_time,
      bay: session2.bay,
      instructorName: session2.instructor_name,
      bookerType: user.role,
      childName: child2?.first_name,
    })
    await sendEmail(c.env, { to: user.email, subject, html })

    const { subject: aSubj, html: aHtml } = bookingConfirmedAdminEmail({
      recipientName: user.full_name,
      recipientEmail: user.email,
      programName: session2.program_name,
      date: session2.date,
      startTime: session2.start_time,
      childName: child2?.first_name,
    })
    await sendEmail(c.env, { to: adminEmail, subject: aSubj, html: aHtml })
  } catch (e) {
    console.error('Email send failed:', e.message)
  }

  return c.json({ ok: true, booking_id: id })
})

// DELETE /bookings/:id
app.delete('/bookings/:id', requireAuth, async (c) => {
  const clerkId = c.get('clerkId')
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(clerkId).first()

  const { id } = c.req.param()
  const booking = await c.env.DB.prepare(
    "SELECT b.*, s.date, s.start_time, p.cancellation_hours FROM bookings b JOIN sessions s ON b.session_id = s.id JOIN programs p ON s.program_id = p.id WHERE b.id = ? AND b.status = 'confirmed'"
  ).bind(id).first()
  if (!booking) return c.json({ error: 'Booking not found' }, 404)
  if (booking.user_id !== user.id) return c.json({ error: 'Forbidden' }, 403)

  const sessionTime = new Date(booking.date + 'T' + booking.start_time)
  const hoursUntil = (sessionTime - new Date()) / (1000 * 60 * 60)
  if (hoursUntil < booking.cancellation_hours) {
    return c.json({ error: `Cannot cancel within ${booking.cancellation_hours} hours of session` }, 400)
  }

  await c.env.DB.prepare(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  // Send cancellation emails
  try {
    const session3 = await c.env.DB.prepare(`
      SELECT s.*, p.name as program_name, p.booker_type
      FROM sessions s JOIN programs p ON s.program_id = p.id
      WHERE s.id = ?
    `).bind(booking.session_id).first()
    const child3 = booking.child_id ? await c.env.DB.prepare('SELECT first_name FROM children WHERE id = ?').bind(booking.child_id).first() : null
    const config2 = await c.env.DB.prepare('SELECT admin_email FROM config WHERE id = 1').first()
    const adminEmail2 = config2?.admin_email || 'info@swingtheory.golf'

    const { subject: cs, html: ch } = bookingCancelledEmail({
      recipientName: user.full_name,
      programName: session3.program_name,
      date: session3.date,
      startTime: session3.start_time,
      bookerType: user.role,
      childName: child3?.first_name,
    })
    await sendEmail(c.env, { to: user.email, subject: cs, html: ch })

    const { subject: cas, html: cah } = bookingCancelledAdminEmail({
      recipientName: user.full_name,
      programName: session3.program_name,
      date: session3.date,
      startTime: session3.start_time,
    })
    await sendEmail(c.env, { to: adminEmail2, subject: cas, html: cah })
  } catch (e) {
    console.error('Cancellation email failed:', e.message)
  }

  return c.json({ ok: true })
})

// GET /bookings/mine
app.get('/bookings/mine', requireAuth, async (c) => {
  const clerkId = c.get('clerkId')
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(clerkId).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  const bookings = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, s.end_time, s.bay, s.is_cancelled,
      p.name as program_name, p.slug as program_slug,
      ch.first_name as child_name,
      u.full_name as instructor_name
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN children ch ON b.child_id = ch.id
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u ON i.user_id = u.id
    WHERE b.user_id = ?
    ORDER BY s.date DESC
  `).bind(user.id).all()

  const today = new Date().toISOString().split('T')[0]
  const upcoming = bookings.results.filter(b => b.date >= today && b.status === 'confirmed')
  const past = bookings.results.filter(b => b.date < today || b.status === 'cancelled')

  return c.json({ bookings: bookings.results, upcoming, past })
})

// GET /student/lessons — private lessons assigned to this student
app.get('/student/lessons', requireAuth, async (c) => {
  const clerkId = c.get('clerkId')
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE clerk_id = ?'
  ).bind(clerkId).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  const lessons = await c.env.DB.prepare(`
    SELECT pl.*,
      u.full_name as instructor_name,
      ln.note as coaching_note,
      ln.updated_at as note_updated_at
    FROM private_lessons pl
    JOIN instructors i ON pl.instructor_id = i.id
    JOIN users u ON i.user_id = u.id
    LEFT JOIN lesson_notes ln ON ln.lesson_id = pl.id
    WHERE pl.student_id = ?
    ORDER BY pl.date DESC
  `).bind(user.id).all()

  return c.json({ lessons: lessons.results })
})


// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────

// GET /admin/sessions?week=YYYY-MM-DD
app.get('/admin/sessions', requireAdminOrSwinger, async (c) => {
  const week = c.req.query('week') || new Date().toISOString().split('T')[0]
  const weekStart = new Date(week)
  const day = weekStart.getDay()
  weekStart.setDate(weekStart.getDate() - day)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const sessions = await c.env.DB.prepare(`
    SELECT s.*,
      p.name as program_name, p.slug as program_slug,
      i.id as instr_id, u.full_name as instructor_name,
      (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') as booked_count
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u ON i.user_id = u.id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date ASC, s.start_time ASC
  `).bind(weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0]).all()

  return c.json({ sessions: sessions.results, weekStart: weekStart.toISOString().split('T')[0] })
})

// GET /admin/sessions/range?start=&end=
app.get('/admin/sessions/range', requireAdminOrSwinger, async (c) => {
  const { start, end } = c.req.query()
  const sessions = await c.env.DB.prepare(`
    SELECT s.*,
      p.name as program_name, p.slug as program_slug,
      (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') as booked_count
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date ASC
  `).bind(start, end).all()
  return c.json({ sessions: sessions.results })
})

// POST /admin/sessions
app.post('/admin/sessions', requireAdminOrSwinger, async (c) => {
  const body = await c.req.json()
  const { program_id, date, start_time, end_time, capacity, bay, instructor_id, notes } = body
  const id = 'sess_' + uid()
  const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()

  await c.env.DB.prepare(`
    INSERT INTO sessions (id, program_id, instructor_id, bay, date, day_of_week, start_time, end_time, capacity, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, program_id, instructor_id || null, bay || null, date, dayOfWeek, start_time, end_time, capacity || 10, notes || null).run()

  return c.json({ ok: true, session_id: id })
})

// PUT /admin/sessions/:id
app.put('/admin/sessions/:id', requireAdminOrSwinger, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()
  const { capacity, is_cancelled, cancel_reason, instructor_id, bay, notes } = body

  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first()
  if (!session) return c.json({ error: 'Session not found' }, 404)

  await c.env.DB.prepare(`
    UPDATE sessions SET
      capacity = ?,
      is_cancelled = ?,
      cancel_reason = ?,
      instructor_id = ?,
      bay = ?,
      notes = ?
    WHERE id = ?
  `).bind(
    capacity ?? session.capacity,
    is_cancelled ?? session.is_cancelled,
    cancel_reason ?? session.cancel_reason,
    instructor_id !== undefined ? instructor_id : session.instructor_id,
    bay ?? session.bay,
    notes ?? session.notes,
    id
  ).run()

  // If session was just cancelled, cancel all confirmed bookings (future only)
  // and email all booked users.
  //
  // Rule (v3.4): Cancelling a future session cascades to bookings (status → 'cancelled')
  // so admin doesn't have to remove people one-by-one and the DB doesn't accumulate stale
  // 'confirmed' rows on cancelled sessions. Past sessions are treated as record-correction
  // only — no booking cascade, no emails — because emailing people about a session that
  // already happened would confuse them.
  //
  // Restoring a session (is_cancelled 1→0) deliberately does NOT restore the bookings.
  // Once admin has emailed users that the session is off, those families have made other
  // plans; admin should manually re-add anyone who confirms they're still coming.
  if (body.is_cancelled === 1 && !session.is_cancelled) {
    const todayStr = new Date().toISOString().split('T')[0]
    const isFutureOrToday = session.date >= todayStr

    if (isFutureOrToday) {
      // 1. Snapshot the affected users BEFORE we update — so the email list is
      //    independent of the UPDATE.
      let bookedUsers = { results: [] }
      let prog = null
      try {
        bookedUsers = await c.env.DB.prepare(`
          SELECT b.id as booking_id, u.email, u.full_name, u.role, ch.first_name as child_name
          FROM bookings b
          JOIN users u ON b.user_id = u.id
          LEFT JOIN children ch ON b.child_id = ch.id
          WHERE b.session_id = ? AND b.status = 'confirmed'
        `).bind(id).all()
        prog = await c.env.DB.prepare('SELECT name FROM programs WHERE id = ?').bind(session.program_id).first()
      } catch (e) {
        console.error('Failed to fetch booked users before cancel cascade:', e.message)
      }

      // 2. Cancel the bookings.
      try {
        await c.env.DB.prepare(`
          UPDATE bookings
          SET status = 'cancelled', cancelled_at = datetime('now')
          WHERE session_id = ? AND status = 'confirmed'
        `).bind(id).run()
      } catch (e) {
        console.error('Booking cascade-cancel failed:', e.message)
      }

      // 3. Send emails (non-blocking).
      try {
        for (const booking of bookedUsers.results) {
          const { subject: ss, html: sh } = sessionCancelledEmail({
            recipientName: booking.full_name,
            programName: prog?.name || 'Session',
            date: session.date,
            startTime: session.start_time,
            cancelReason: body.cancel_reason,
          })
          await sendEmail(c.env, { to: booking.email, subject: ss, html: sh })
        }
      } catch (e) {
        console.error('Session cancel emails failed:', e.message)
      }
    }
    // Past sessions: no booking cascade, no emails. Just the is_cancelled flag flip.
  }

  return c.json({ ok: true })
})

// GET /admin/sessions/:id/roster
app.get('/admin/sessions/:id/roster', requireAdminOrSwinger, async (c) => {
  const { id } = c.req.param()
  const session = await c.env.DB.prepare(`
    SELECT s.*, p.name as program_name, u.full_name as instructor_name
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u ON i.user_id = u.id
    WHERE s.id = ?
  `).bind(id).first()
  if (!session) return c.json({ error: 'Session not found' }, 404)

  const [bookings, allInstructors, assignedInstructors] = await Promise.all([
    c.env.DB.prepare(`
      SELECT b.*, u.full_name, u.email, u.phone, ch.first_name as child_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      LEFT JOIN children ch ON b.child_id = ch.id
      WHERE b.session_id = ? AND b.status = 'confirmed'
      ORDER BY u.full_name ASC
    `).bind(id).all(),
    c.env.DB.prepare(`
      SELECT i.id, u.full_name, u.email
      FROM instructors i JOIN users u ON i.user_id = u.id
      WHERE u.status = 'active' ORDER BY u.full_name ASC
    `).all(),
    c.env.DB.prepare(`
      SELECT si.instructor_id, u.full_name, u.email
      FROM session_instructors si
      JOIN instructors i ON si.instructor_id = i.id
      JOIN users u ON i.user_id = u.id
      WHERE si.session_id = ?
      ORDER BY u.full_name ASC
    `).bind(id).all(),
  ])

  return c.json({
    session,
    bookings: bookings.results,
    instructors: allInstructors.results,
    assigned_instructors: assignedInstructors.results,
  })
})

// POST /admin/sessions/:id/instructors
app.post('/admin/sessions/:id/instructors', requireAdminOrSwinger, async (c) => {
  const { id } = c.req.param()
  const { instructor_id } = await c.req.json()
  if (!instructor_id) return c.json({ error: 'instructor_id required' }, 400)
  const assignId = 'si_' + uid()
  try {
    await c.env.DB.prepare(
      'INSERT INTO session_instructors (id, session_id, instructor_id) VALUES (?, ?, ?)'
    ).bind(assignId, id, instructor_id).run()
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: 'Already assigned' }, 400)
    throw e
  }
  return c.json({ ok: true })
})

// DELETE /admin/sessions/:id/instructors/:instructor_id
app.delete('/admin/sessions/:id/instructors/:instructor_id', requireAdminOrSwinger, async (c) => {
  const { id, instructor_id } = c.req.param()
  await c.env.DB.prepare(
    'DELETE FROM session_instructors WHERE session_id = ? AND instructor_id = ?'
  ).bind(id, instructor_id).run()
  return c.json({ ok: true })
})

// GET /admin/searchable-members — for the admin manual-add modal on AdminSessions
//
// Returns active parent + student users, optionally filtered by `q` (name/email LIKE),
// and optionally annotated with enrollment status for a given `program_id` and an
// `already_booked` flag for a given `session_id`. The frontend uses this to:
//   1. Hide users already on the roster for the selected session
//   2. Show an "Enrollment will be created" warning for unenrolled users (Option A flow)
app.get('/admin/searchable-members', requireAdminOrSwinger, async (c) => {
  const q = c.req.query('q') || ''
  const programId = c.req.query('program_id') || null
  const sessionId = c.req.query('session_id') || null

  const result = await c.env.DB.prepare(`
    SELECT u.id, u.full_name, u.email, u.role, ch.first_name as child_name
    FROM users u
    LEFT JOIN children ch ON ch.parent_id = u.id
    WHERE u.status = 'active'
      AND u.role IN ('parent', 'student')
      AND (u.full_name LIKE ? OR u.email LIKE ?)
    ORDER BY u.full_name ASC
    LIMIT 25
  `).bind(`%${q}%`, `%${q}%`).all()

  const members = result.results || []
  if (members.length === 0) return c.json({ members: [] })

  // Build the enrolled-user-id set for this program (if program_id supplied)
  let enrolledIds = new Set()
  if (programId) {
    const enr = await c.env.DB.prepare(`
      SELECT user_id FROM enrollments
      WHERE program_id = ? AND is_active = 1
    `).bind(programId).all()
    enrolledIds = new Set((enr.results || []).map(r => r.user_id))
  }

  // Build the already-booked-user-id set for this session (if session_id supplied)
  let bookedIds = new Set()
  if (sessionId) {
    const bks = await c.env.DB.prepare(`
      SELECT user_id FROM bookings
      WHERE session_id = ? AND status = 'confirmed'
    `).bind(sessionId).all()
    bookedIds = new Set((bks.results || []).map(r => r.user_id))
  }

  const annotated = members.map(m => ({
    ...m,
    is_enrolled: programId ? enrolledIds.has(m.id) : null,
    already_booked: sessionId ? bookedIds.has(m.id) : false,
  }))

  return c.json({ members: annotated })
})

// POST /admin/bookings — manual booking bypasses all rules
//
// Body: { session_id, user_id, auto_enroll? }
//
// Behavior:
// - Bypasses capacity, cancellation window, weekly booking limits, and enrollment gate.
// - If `auto_enroll` is true (default) AND the user has no active enrollment for the
//   session's program, creates an enrollment row (no start/end dates → ongoing).
//   This is idempotent: reactivates a soft-disabled row if one exists.
// - Sends booking confirmation email to the user (matches the parent self-book flow).
// - Sends admin notification email to config.admin_email.
//
// Returns: { ok, booking_id, enrolled }  where `enrolled` is true if this call
// created or reactivated an enrollment row.
app.post('/admin/bookings', requireAdminOrSwinger, async (c) => {
  const { session_id, user_id, auto_enroll = true } = await c.req.json()

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user_id).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  // Fetch session + program info up-front (needed for enrollment + emails)
  const session = await c.env.DB.prepare(`
    SELECT s.*, p.name as program_name, p.id as program_id,
      u2.full_name as instructor_name
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u2 ON i.user_id = u2.id
    WHERE s.id = ?
  `).bind(session_id).first()
  if (!session) return c.json({ error: 'Session not found' }, 404)

  // Resolve child_id for parent bookers
  let child_id = null
  if (user.role === 'parent') {
    const child = await c.env.DB.prepare('SELECT id FROM children WHERE parent_id = ?').bind(user_id).first()
    if (child) child_id = child.id
  }

  // Create the booking first — primary intent. If this fails, we don't want
  // an orphan enrollment side-effect.
  //
  // Reactivate-or-insert pattern (mirrors POST /bookings parent self-book):
  // The bookings UNIQUE(session_id, user_id) constraint covers ALL rows
  // regardless of status, so we can't blindly INSERT for a user who was
  // previously removed from this session. Check for an existing row first:
  //   - status='confirmed' → return 400 "Already booked" (true duplicate)
  //   - status='cancelled' → UPDATE that row back to confirmed (reactivate)
  //   - no row → INSERT fresh
  let id
  const existingConfirmed = await c.env.DB.prepare(
    "SELECT id FROM bookings WHERE session_id = ? AND user_id = ? AND status = 'confirmed'"
  ).bind(session_id, user_id).first()
  if (existingConfirmed) return c.json({ error: 'Already booked' }, 400)

  const existingCancelled = await c.env.DB.prepare(
    "SELECT id FROM bookings WHERE session_id = ? AND user_id = ? AND status = 'cancelled'"
  ).bind(session_id, user_id).first()

  if (existingCancelled) {
    // Reactivate the cancelled booking
    await c.env.DB.prepare(
      "UPDATE bookings SET status = 'confirmed', cancelled_at = NULL, booked_at = datetime('now'), child_id = ? WHERE id = ?"
    ).bind(child_id, existingCancelled.id).run()
    id = existingCancelled.id
  } else {
    id = 'bkg_' + uid()
    try {
      await c.env.DB.prepare(
        'INSERT INTO bookings (id, session_id, user_id, child_id, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, session_id, user_id, child_id, 'confirmed').run()
    } catch (e) {
      // Defensive: a race could insert between our SELECTs and this INSERT.
      // Surface as "Already booked" so the UI behaves consistently.
      if (e.message?.includes('UNIQUE')) return c.json({ error: 'Already booked' }, 400)
      throw e
    }
  }

  // Auto-enroll AFTER booking succeeds. Best-effort: if this fails, log but
  // still return success — booking is already saved and admin can manually
  // add the enrollment later from the Member profile. (Matches the
  // POST /admin/members enrollment-warning pattern.)
  let enrolled = false
  if (auto_enroll && (user.role === 'parent' || user.role === 'student')) {
    try {
      const existing = await c.env.DB.prepare(
        'SELECT id, is_active FROM enrollments WHERE user_id = ? AND program_id = ?'
      ).bind(user_id, session.program_id).first()

      if (!existing) {
        const enrollmentId = 'enr_' + uid()
        try {
          await c.env.DB.prepare(`
            INSERT INTO enrollments (id, user_id, program_id, start_date, end_date, is_active)
            VALUES (?, ?, ?, NULL, NULL, 1)
          `).bind(enrollmentId, user_id, session.program_id).run()
          enrolled = true
        } catch (e) {
          // Unique-constraint race-condition fallback: treat as already enrolled
          if (!e.message?.includes('UNIQUE')) throw e
        }
      } else if (existing.is_active === 0) {
        await c.env.DB.prepare(`
          UPDATE enrollments
          SET is_active = 1, updated_at = datetime('now')
          WHERE id = ?
        `).bind(existing.id).run()
        enrolled = true
      }
    } catch (e) {
      console.error('Auto-enroll failed after booking insert:', e.message)
    }
  }

  // Send confirmation emails (non-blocking — booking is already saved)
  try {
    const child2 = child_id
      ? await c.env.DB.prepare('SELECT first_name FROM children WHERE id = ?').bind(child_id).first()
      : null
    const config = await c.env.DB.prepare('SELECT admin_email FROM config WHERE id = 1').first()
    const adminEmail = config?.admin_email || 'info@swingtheory.golf'

    const { subject, html } = bookingConfirmedEmail({
      recipientName: user.full_name,
      programName: session.program_name,
      date: session.date,
      startTime: session.start_time,
      endTime: session.end_time,
      bay: session.bay,
      instructorName: session.instructor_name,
      bookerType: user.role,
      childName: child2?.first_name,
    })
    await sendEmail(c.env, { to: user.email, subject, html })

    const { subject: aSubj, html: aHtml } = bookingConfirmedAdminEmail({
      recipientName: user.full_name,
      recipientEmail: user.email,
      programName: session.program_name,
      date: session.date,
      startTime: session.start_time,
      childName: child2?.first_name,
    })
    await sendEmail(c.env, { to: adminEmail, subject: aSubj, html: aHtml })
  } catch (e) {
    console.error('Manual-booking email send failed:', e.message)
  }

  return c.json({ ok: true, booking_id: id, enrolled })
})

// DELETE /admin/bookings/:id — admin/swinger removes a person from a session (bypasses cancellation window)
app.delete('/admin/bookings/:id', requireAdminOrSwinger, async (c) => {
  const { id } = c.req.param()
  const booking = await c.env.DB.prepare(
    "SELECT b.*, s.date, s.start_time, p.name as program_name, u.email, u.full_name, u.role, ch.first_name as child_name FROM bookings b JOIN sessions s ON b.session_id = s.id JOIN programs p ON s.program_id = p.id JOIN users u ON b.user_id = u.id LEFT JOIN children ch ON b.child_id = ch.id WHERE b.id = ?"
  ).bind(id).first()
  if (!booking) return c.json({ error: 'Booking not found' }, 404)
  if (booking.status === 'cancelled') return c.json({ error: 'Booking already cancelled' }, 400)

  await c.env.DB.prepare(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  // Notify the user that admin cancelled their booking
  try {
    const { subject, html } = bookingCancelledEmail({
      recipientName: booking.full_name,
      programName: booking.program_name,
      date: booking.date,
      startTime: booking.start_time,
      bookerType: booking.role,
      childName: booking.child_name,
    })
    await sendEmail(c.env, { to: booking.email, subject, html })
  } catch (e) {
    console.error('Admin cancel email failed:', e.message)
  }

  return c.json({ ok: true })
})

// POST /admin/bookings/:id/checkin
app.post('/admin/bookings/:id/checkin', requireAdminOrSwinger, async (c) => {
  const { id } = c.req.param()
  const booking = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first()
  if (!booking) return c.json({ error: 'Booking not found' }, 404)

  const newCheckedIn = booking.checked_in ? 0 : 1
  await c.env.DB.prepare(
    "UPDATE bookings SET checked_in = ?, checked_in_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?"
  ).bind(newCheckedIn, newCheckedIn, id).run()

  return c.json({ ok: true, checked_in: newCheckedIn })
})

// GET /admin/members
app.get('/admin/members', requireAdminOrSwinger, async (c) => {
  const q = c.req.query('q') || ''
  const status = c.req.query('status') || 'all'

  let query = `
    SELECT u.*, 
      ch.first_name as child_name, ch.age as child_age,
      i.id as instructor_record_id, i.bio as instructor_bio,
      (SELECT COUNT(*) FROM enrollments e WHERE e.user_id = u.id AND e.is_active = 1) AS enrollment_count
    FROM users u
    LEFT JOIN children ch ON ch.parent_id = u.id
    LEFT JOIN instructors i ON i.user_id = u.id
  `
  const params = []
  const conditions = []

  if (q) {
    conditions.push('(u.full_name LIKE ? OR u.email LIKE ?)')
    params.push(`%${q}%`, `%${q}%`)
  }
  if (status !== 'all') {
    conditions.push('u.status = ?')
    params.push(status)
  }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
  query += ' ORDER BY u.created_at DESC'

  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ members: result.results })
})

// POST /admin/members — create Clerk user with temp password + send credentials email
app.post('/admin/members', requireAdmin, async (c) => {
  const body = await c.req.json()
  const {
    full_name, email, role, phone, child_first_name, child_age,
    program_ids,    // optional array of program IDs to enroll user into (parent/student)
    instructor_id,  // optional instructor ID to assign student to (student only)
  } = body

  if (!full_name || !email || !role) {
    return c.json({ error: 'full_name, email, and role are required' }, 400)
  }

  // Generate a memorable temp password: e.g., "swing-7429"
  const tempPassword = 'swing-' + Math.floor(1000 + Math.random() * 9000)

  // Step 1: Create Clerk user with the temp password
  const nameParts = full_name.trim().split(/\s+/)
  const firstName = nameParts[0]
  const lastName = nameParts.slice(1).join(' ') || firstName

  const createRes = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email_address: [email],
      password: tempPassword,
      first_name: firstName,
      last_name: lastName,
      skip_password_checks: true,
    }),
  })

  const createData = await createRes.json()
  console.log('Clerk create user status:', createRes.status)

  if (!createRes.ok) {
    const msg = createData?.errors?.[0]?.long_message || createData?.errors?.[0]?.message || 'Failed to create Clerk user'
    console.error('Clerk create user error:', JSON.stringify(createData))
    return c.json({ error: msg }, 500)
  }

  const finalClerkId = createData.id

  // Step 2: Create user record in D1 with must_change_password = 1
  const userId = 'usr_' + uid()
  try {
    await c.env.DB.prepare(
      'INSERT INTO users (id, clerk_id, email, full_name, phone, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).bind(userId, finalClerkId, email, full_name, phone || null, role).run()
  } catch (e) {
    // Roll back the Clerk user since D1 insert failed
    await fetch(`https://api.clerk.com/v1/users/${finalClerkId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}` },
    }).catch(() => {})
    console.error('D1 insert error:', e.message)
    return c.json({ error: 'Could not create user record: ' + e.message }, 500)
  }

  // Track non-fatal warnings — these surface to admin but don't fail the call.
  const warnings = []

  // Create child record if parent
  if (role === 'parent' && child_first_name) {
    const childId = 'child_' + uid()
    try {
      await c.env.DB.prepare(
        'INSERT INTO children (id, parent_id, first_name, age) VALUES (?, ?, ?, ?)'
      ).bind(childId, userId, child_first_name, child_age || null).run()
    } catch (e) {
      console.error('Child insert failed:', e.message)
      warnings.push({ step: 'children', error: e.message })
    }
  }

  // Create instructors record if instructor
  if (role === 'instructor') {
    const instrId = 'instr_' + uid()
    try {
      await c.env.DB.prepare(
        'INSERT INTO instructors (id, user_id) VALUES (?, ?)'
      ).bind(instrId, userId).run()
    } catch (e) {
      console.error('Instructors insert failed:', e.message)
      warnings.push({ step: 'instructors', error: e.message })
    }
  }

  // ─── Enrollments (v3.3) ─────────────────────────────────────────────────────
  // For parent/student roles, optionally enroll into one or more group programs.
  // Failures are non-fatal — admin can retry from the member profile.
  if ((role === 'parent' || role === 'student') && Array.isArray(program_ids) && program_ids.length > 0) {
    for (const programId of program_ids) {
      if (!programId || typeof programId !== 'string') continue
      try {
        // Verify program exists and is active before enrolling
        const program = await c.env.DB.prepare(
          'SELECT id FROM programs WHERE id = ? AND is_active = 1'
        ).bind(programId).first()
        if (!program) {
          warnings.push({ step: 'enrollments', error: `Program not found or inactive: ${programId}` })
          continue
        }
        const enrollmentId = 'enr_' + uid()
        await c.env.DB.prepare(
          'INSERT INTO enrollments (id, user_id, program_id, is_active) VALUES (?, ?, ?, 1)'
        ).bind(enrollmentId, userId, programId).run()
      } catch (e) {
        console.error('Enrollment insert failed:', programId, e.message)
        warnings.push({ step: 'enrollments', error: `${programId}: ${e.message}` })
      }
    }
  }

  // ─── Instructor assignment (v3.3) ───────────────────────────────────────────
  // Student only. Creates a student_instructors row linking student to instructor.
  if (role === 'student' && instructor_id && typeof instructor_id === 'string') {
    try {
      // Verify instructor exists
      const instr = await c.env.DB.prepare(
        'SELECT id FROM instructors WHERE id = ?'
      ).bind(instructor_id).first()
      if (!instr) {
        warnings.push({ step: 'student_instructors', error: `Instructor not found: ${instructor_id}` })
      } else {
        const linkId = 'si_' + uid()
        await c.env.DB.prepare(
          'INSERT INTO student_instructors (id, student_id, instructor_id) VALUES (?, ?, ?)'
        ).bind(linkId, userId, instructor_id).run()
      }
    } catch (e) {
      console.error('Student-instructor insert failed:', e.message)
      warnings.push({ step: 'student_instructors', error: e.message })
    }
  }

  // Step 3: Send welcome email with email + temp password
  try {
    const { subject: ws, html: wh } = welcomeEmail({
      recipientName: full_name,
      role,
      email,
      tempPassword,
    })
    await sendEmail(c.env, { to: email, subject: ws, html: wh })
  } catch (e) {
    console.error('Welcome email failed:', e.message)
    warnings.push({ step: 'welcome_email', error: e.message })
  }

  const response = { ok: true, user_id: userId, temp_password: tempPassword }
  if (warnings.length > 0) response.warnings = warnings
  return c.json(response)
})

// PUT /admin/members/:id
app.put('/admin/members/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()
  const { status, role, phone, full_name, bio } = body

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  await c.env.DB.prepare(`
    UPDATE users SET
      status = ?,
      role = ?,
      phone = ?,
      full_name = ?
    WHERE id = ?
  `).bind(
    status ?? user.status,
    role ?? user.role,
    phone ?? user.phone,
    full_name ?? user.full_name,
    id
  ).run()

  // Ensure an `instructors` row exists when the user's role is (or just became)
  // instructor. The CREATE flow handles this for new users, but role changes
  // via this endpoint historically did not — leaving such users in a broken
  // state where joins like `users → instructors` would silently fail and
  // private lessons could not be created or fetched for them.
  //
  // We only handle the promote-to-instructor case here. Demotions
  // (instructor → other role) deliberately leave the orphan `instructors` row
  // in place: it may still be referenced by sessions or private_lessons, and a
  // future re-promotion can pick it back up. Use DELETE /admin/members/:id for
  // a true tear-down.
  const finalRole = role ?? user.role
  if (finalRole === 'instructor') {
    const existingInstr = await c.env.DB.prepare(
      'SELECT id FROM instructors WHERE user_id = ?'
    ).bind(id).first()
    if (!existingInstr) {
      const instrId = 'instr_' + uid()
      await c.env.DB.prepare(
        'INSERT INTO instructors (id, user_id) VALUES (?, ?)'
      ).bind(instrId, id).run()
    }
  }

  // If instructor, update bio
  if (bio !== undefined) {
    const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(id).first()
    if (instr) {
      await c.env.DB.prepare('UPDATE instructors SET bio = ? WHERE user_id = ?').bind(bio, id).run()
    }
  }

  return c.json({ ok: true })
})

// ─── DELETE /admin/members/:id ─────────────────────────────────────────────────
// Deletes user from Clerk + cascades through D1.
//
// Cascade order matters: anything that references private_lessons.id must be
// removed BEFORE the private_lessons rows themselves. Same goes for the
// instructors table and other relational dependencies.
//
// Tables and columns currently referencing this user/instructor:
//   bookings.user_id              → user
//   children.parent_id            → user
//   lesson_notes.student_id       → user
//   lesson_notes.instructor_id    → instructors
//   lesson_notes.lesson_id        → private_lessons (THIRD-PARTY notes blocking lesson delete)
//   gspro_uploads.lesson_id       → private_lessons (blocking lesson delete)
//   private_lessons.student_id    → user
//   private_lessons.instructor_id → instructors
//   sessions.instructor_id        → instructors (NULL-able — we null it out, don't delete)
//   session_instructors.instructor_id  → instructors
//   student_instructors.student_id     → user
//   student_instructors.instructor_id  → instructors
//   instructors.user_id           → user
//
// We track failures and verify the user row is actually gone before reporting
// success. If the cascade silently fails, we return 500 with details so the
// frontend doesn't show a phantom "deleted" state while the row is still in DB.
app.delete('/admin/members/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  // Delete from Clerk (only if not a pending placeholder)
  if (user.clerk_id && !user.clerk_id.startsWith('pending_')) {
    const clerkRes = await fetch(`https://api.clerk.com/v1/users/${user.clerk_id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}` },
    })
    // 404 from Clerk is fine — user may already be deleted there
    if (!clerkRes.ok && clerkRes.status !== 404) {
      const err = await clerkRes.json()
      return c.json({ error: 'Clerk deletion failed', detail: err }, 500)
    }
  }

  // Resolve the instructor ID once (if any) so subsequent deletes can use simple
  // WHERE clauses instead of nested SELECTs.
  const instructorRow = await c.env.DB.prepare(
    'SELECT id FROM instructors WHERE user_id = ?'
  ).bind(id).first()
  const instructorId = instructorRow?.id || null

  // Collect all private_lesson IDs this user is tied to (as student or instructor).
  // Anything referencing these IDs (lesson_notes, gspro_uploads, etc.) must be
  // deleted BEFORE the private_lessons rows themselves.
  const lessonRows = await c.env.DB.prepare(`
    SELECT id FROM private_lessons
    WHERE student_id = ?
       OR (? IS NOT NULL AND instructor_id = ?)
  `).bind(id, instructorId, instructorId).all()
  const lessonIds = (lessonRows.results || []).map(r => r.id)

  // Build a parameterised IN-list, e.g. "(?, ?, ?)". When there are no lessons
  // we skip those steps entirely.
  function inClause(values) {
    return '(' + values.map(() => '?').join(',') + ')'
  }

  // Cascade plan. Each entry: [label, sql, params]
  // Steps are executed in order; failures are tracked but don't abort the loop.
  const steps = []

  // 1. Delete dependent rows on private_lessons that this user owns
  if (lessonIds.length > 0) {
    steps.push(['gspro_uploads_by_lesson',
      `DELETE FROM gspro_uploads WHERE lesson_id IN ${inClause(lessonIds)}`,
      lessonIds])
    steps.push(['lesson_notes_by_lesson',
      `DELETE FROM lesson_notes WHERE lesson_id IN ${inClause(lessonIds)}`,
      lessonIds])
  }

  // 2. Delete things tied directly to the user
  steps.push(['bookings_by_user',
    'DELETE FROM bookings WHERE user_id = ?',
    [id]])
  steps.push(['lesson_notes_by_student',
    'DELETE FROM lesson_notes WHERE student_id = ?',
    [id]])
  if (instructorId) {
    steps.push(['lesson_notes_by_instructor',
      'DELETE FROM lesson_notes WHERE instructor_id = ?',
      [instructorId]])
  }

  // 3. Delete the private_lessons rows themselves
  steps.push(['private_lessons_by_student',
    'DELETE FROM private_lessons WHERE student_id = ?',
    [id]])
  if (instructorId) {
    steps.push(['private_lessons_by_instructor',
      'DELETE FROM private_lessons WHERE instructor_id = ?',
      [instructorId]])
  }

  // 4. Detach from sessions (instructor_id is NULL-able per schema, so we
  //    null it out instead of deleting the session — the session may still
  //    have students booked).
  if (instructorId) {
    steps.push(['session_instructors_detach',
      'DELETE FROM session_instructors WHERE instructor_id = ?',
      [instructorId]])
    steps.push(['sessions_clear_instructor',
      'UPDATE sessions SET instructor_id = NULL WHERE instructor_id = ?',
      [instructorId]])
  }

  // 5. Children and student-instructor links
  steps.push(['children_by_parent',
    'DELETE FROM children WHERE parent_id = ?',
    [id]])
  steps.push(['student_instructors_by_student',
    'DELETE FROM student_instructors WHERE student_id = ?',
    [id]])
  if (instructorId) {
    steps.push(['student_instructors_by_instructor',
      'DELETE FROM student_instructors WHERE instructor_id = ?',
      [instructorId]])
  }

  // 5b. Enrollments (added v3.3) — must run before users delete because of FK
  steps.push(['enrollments_by_user',
    'DELETE FROM enrollments WHERE user_id = ?',
    [id]])

  // 6. Finally the instructor row, then the user row
  if (instructorId) {
    steps.push(['instructors_by_user',
      'DELETE FROM instructors WHERE user_id = ?',
      [id]])
  }
  steps.push(['users',
    'DELETE FROM users WHERE id = ?',
    [id]])

  const failures = []
  for (const [label, sql, params] of steps) {
    try {
      await c.env.DB.prepare(sql).bind(...params).run()
    } catch (e) {
      const msg = String(e?.message || e)
      console.error('Delete step failed:', label, sql, msg)
      failures.push({ step: label, error: msg })
    }
  }

  // Verify the user row is actually gone. This is the source of truth — if this
  // check shows the row still exists, we know the cascade didn't fully complete
  // and we must NOT report success to the frontend.
  const stillExists = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ?'
  ).bind(id).first()

  if (stillExists) {
    return c.json({
      error: 'Delete did not complete — user still exists. The Clerk record may have been removed but the database delete failed. Check failed_steps for details.',
      failed_steps: failures,
    }, 500)
  }

  // True success. If there were non-fatal failures earlier (e.g. orphan rows
  // we couldn't clean up but that didn't block the user delete) we surface them
  // as warnings. The admin can ignore them.
  if (failures.length > 0) {
    return c.json({ ok: true, warnings: failures })
  }
  return c.json({ ok: true })
})

// ─── POST /admin/members/:id/reset-password ───────────────────────────────────
// Admin-triggered password reset. Generates a new temp password, updates Clerk,
// emails the user via Resend, and flips must_change_password=1 so they're forced
// to change it on next login.
//
// Note: previously this endpoint called Clerk's non-existent password_reset_links
// API and returned a magic link. Switched in v3.4 to the temp-password approach
// (same as resend-temp-password) since Clerk doesn't actually expose the
// reset-link endpoint we were trying to hit.
app.post('/admin/members/:id/reset-password', requireAdmin, async (c) => {
  const { id } = c.req.param()

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  if (!user.clerk_id || user.clerk_id.startsWith('pending_')) {
    return c.json({ error: 'User has not completed account setup yet — no Clerk account to reset' }, 400)
  }

  const tempPassword = 'swing-' + Math.floor(1000 + Math.random() * 9000)

  // Update password in Clerk
  const updateRes = await fetch(`https://api.clerk.com/v1/users/${user.clerk_id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: tempPassword, skip_password_checks: true }),
  })

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}))
    const msg = err?.errors?.[0]?.long_message || err?.errors?.[0]?.message || 'Failed to update password'
    console.error('[admin reset-password] Clerk update failed:', updateRes.status, msg)
    return c.json({ error: msg }, 500)
  }

  // Force the user to change the password on their next login
  await c.env.DB.prepare(
    'UPDATE users SET must_change_password = 1 WHERE id = ?'
  ).bind(id).run()

  // Send the welcome email with the new temp password (same template as account creation)
  let emailSent = true
  try {
    const { subject, html } = welcomeEmail({
      recipientName: user.full_name,
      role: user.role,
      email: user.email,
      tempPassword,
    })
    await sendEmail(c.env, { to: user.email, subject, html })
  } catch (e) {
    console.error('[admin reset-password] Email send failed:', e.message)
    emailSent = false
  }

  return c.json({ ok: true, temp_password: tempPassword, email_sent: emailSent })
})

// GET /admin/members/:id/bookings
app.get('/admin/members/:id/bookings', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const bookings = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, s.end_time, s.bay,
      p.name as program_name
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN programs p ON s.program_id = p.id
    WHERE b.user_id = ?
    ORDER BY s.date DESC
  `).bind(id).all()
  return c.json({ bookings: bookings.results })
})

// ─── GET /admin/members/:id/last-login ────────────────────────────────────────
// Fetches Clerk's last_sign_in_at for the user. Returns null if the user has
// never signed in or if the Clerk lookup fails (we don't want a Clerk hiccup
// to break the admin panel — the field is informational, not load-bearing).
app.get('/admin/members/:id/last-login', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const user = await c.env.DB.prepare(
    'SELECT clerk_id FROM users WHERE id = ?'
  ).bind(id).first()
  if (!user?.clerk_id) return c.json({ last_sign_in_at: null })

  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${user.clerk_id}`, {
      headers: { 'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}` },
    })
    if (!res.ok) {
      console.warn(`[last-login] clerk fetch failed status=${res.status} user=${id}`)
      return c.json({ last_sign_in_at: null })
    }
    const data = await res.json()
    // Clerk returns last_sign_in_at as ms epoch (or null)
    const ts = data?.last_sign_in_at
    return c.json({ last_sign_in_at: ts ? new Date(ts).toISOString() : null })
  } catch (e) {
    console.warn(`[last-login] error user=${id}: ${e.message || e}`)
    return c.json({ last_sign_in_at: null })
  }
})

// ─── GET /admin/members/:id/instructor-students ───────────────────────────────
// Returns students assigned to an instructor (for member detail panel)
app.get('/admin/members/:id/instructor-students', requireAdmin, async (c) => {
  const { id } = c.req.param()
  // id here is the user_id of the instructor
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(id).first()
  if (!instr) return c.json({ students: [] })

  const students = await c.env.DB.prepare(`
    SELECT u.id, u.full_name, u.email, u.phone, u.status,
      ch.first_name as child_name
    FROM student_instructors si
    JOIN users u ON si.student_id = u.id
    LEFT JOIN children ch ON ch.parent_id = u.id
    WHERE si.instructor_id = ?
    ORDER BY u.full_name ASC
  `).bind(instr.id).all()

  return c.json({ students: students.results })
})

// ─── GET /admin/members/:id/assigned-instructors ─────────────────────────────
// Returns instructors assigned to a student
app.get('/admin/members/:id/assigned-instructors', requireAdmin, async (c) => {
  const { id } = c.req.param() // student user_id
  const instructors = await c.env.DB.prepare(`
    SELECT i.id as instructor_record_id, u.id, u.full_name, u.email
    FROM student_instructors si
    JOIN instructors i ON si.instructor_id = i.id
    JOIN users u ON i.user_id = u.id
    WHERE si.student_id = ?
    ORDER BY u.full_name ASC
  `).bind(id).all()
  return c.json({ instructors: instructors.results })
})

// ─── POST /admin/members/:id/assign-instructor ────────────────────────────────
// Assigns a student to an instructor
app.post('/admin/members/:id/assign-instructor', requireAdmin, async (c) => {
  const { id } = c.req.param() // student user_id
  const { instructor_id } = await c.req.json() // instructors.id (not user_id)

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  const instr = await c.env.DB.prepare('SELECT * FROM instructors WHERE id = ?').bind(instructor_id).first()
  if (!instr) return c.json({ error: 'Instructor not found' }, 404)

  const siId = 'si_' + uid()
  try {
    await c.env.DB.prepare(
      'INSERT INTO student_instructors (id, student_id, instructor_id) VALUES (?, ?, ?)'
    ).bind(siId, id, instructor_id).run()
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: 'Already assigned' }, 400)
    throw e
  }

  return c.json({ ok: true })
})

// ─── DELETE /admin/members/:id/assign-instructor ──────────────────────────────
// Removes a student-instructor assignment
app.delete('/admin/members/:studentId/assign-instructor/:instrId', requireAdmin, async (c) => {
  const { studentId, instrId } = c.req.param()
  await c.env.DB.prepare(
    'DELETE FROM student_instructors WHERE student_id = ? AND instructor_id = ?'
  ).bind(studentId, instrId).run()
  return c.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ENROLLMENTS (v3.3) — admin-only CRUD on the enrollments table.
// Booking-time enforcement of these enrollments is gated by the
// ENROLLMENT_ENFORCEMENT env var. The CRUD itself always works regardless of
// the flag — admins can manage enrollments before, during, or after rollout.
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/members/:id/enrollments — list enrollments for a user
app.get('/admin/members/:id/enrollments', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const enrollments = await c.env.DB.prepare(`
    SELECT e.id, e.program_id, e.start_date, e.end_date, e.is_active,
           e.created_at, e.updated_at,
           p.name AS program_name, p.slug AS program_slug, p.is_active AS program_active
    FROM enrollments e
    JOIN programs p ON e.program_id = p.id
    WHERE e.user_id = ?
    ORDER BY e.created_at DESC
  `).bind(id).all()
  return c.json({ enrollments: enrollments.results })
})

// POST /admin/members/:id/enrollments — create or reactivate an enrollment
//
// Body: { program_id, start_date?, end_date? }
//
// Idempotent: if an enrollment row already exists for (user_id, program_id),
// reactivates it (sets is_active=1, updates dates, updates updated_at) instead
// of failing on the unique constraint.
app.post('/admin/members/:id/enrollments', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const { program_id, start_date, end_date } = await c.req.json()

  if (!program_id) return c.json({ error: 'program_id required' }, 400)

  // Verify user exists
  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  // Verify program exists and is active
  const program = await c.env.DB.prepare(
    'SELECT id, is_active FROM programs WHERE id = ?'
  ).bind(program_id).first()
  if (!program) return c.json({ error: 'Program not found' }, 404)
  if (!program.is_active) return c.json({ error: 'Program is inactive — cannot enroll' }, 400)

  // Check for existing row (active or soft-deleted)
  const existing = await c.env.DB.prepare(
    'SELECT id, is_active FROM enrollments WHERE user_id = ? AND program_id = ?'
  ).bind(id, program_id).first()

  if (existing) {
    // Reactivate / update dates
    await c.env.DB.prepare(`
      UPDATE enrollments
      SET is_active = 1,
          start_date = ?,
          end_date = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(start_date || null, end_date || null, existing.id).run()
    return c.json({ ok: true, enrollment_id: existing.id, reactivated: existing.is_active === 0 })
  }

  // Create new
  const enrollmentId = 'enr_' + uid()
  try {
    await c.env.DB.prepare(`
      INSERT INTO enrollments (id, user_id, program_id, start_date, end_date, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).bind(enrollmentId, id, program_id, start_date || null, end_date || null).run()
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return c.json({ error: 'Already enrolled in this program' }, 400)
    }
    throw e
  }

  return c.json({ ok: true, enrollment_id: enrollmentId })
})

// PUT /admin/enrollments/:enrollmentId — update dates / is_active
//
// Body: { start_date?, end_date?, is_active? }
//
// Any field omitted is left unchanged. Pass `null` (not omitted) to clear a date.
app.put('/admin/enrollments/:enrollmentId', requireAdmin, async (c) => {
  const { enrollmentId } = c.req.param()
  const body = await c.req.json()

  const existing = await c.env.DB.prepare(
    'SELECT * FROM enrollments WHERE id = ?'
  ).bind(enrollmentId).first()
  if (!existing) return c.json({ error: 'Enrollment not found' }, 404)

  // Build SET clause from provided fields only
  const updates = []
  const params = []

  if ('start_date' in body) {
    updates.push('start_date = ?')
    params.push(body.start_date || null)
  }
  if ('end_date' in body) {
    updates.push('end_date = ?')
    params.push(body.end_date || null)
  }
  if ('is_active' in body) {
    updates.push('is_active = ?')
    params.push(body.is_active ? 1 : 0)
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  updates.push("updated_at = datetime('now')")
  params.push(enrollmentId)

  await c.env.DB.prepare(
    `UPDATE enrollments SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run()

  return c.json({ ok: true })
})

// DELETE /admin/enrollments/:enrollmentId — soft-delete by default, hard-delete with ?hard=true
app.delete('/admin/enrollments/:enrollmentId', requireAdmin, async (c) => {
  const { enrollmentId } = c.req.param()
  const hard = c.req.query('hard') === 'true'

  const existing = await c.env.DB.prepare(
    'SELECT id FROM enrollments WHERE id = ?'
  ).bind(enrollmentId).first()
  if (!existing) return c.json({ error: 'Enrollment not found' }, 404)

  if (hard) {
    await c.env.DB.prepare('DELETE FROM enrollments WHERE id = ?').bind(enrollmentId).run()
  } else {
    await c.env.DB.prepare(
      "UPDATE enrollments SET is_active = 0, updated_at = datetime('now') WHERE id = ?"
    ).bind(enrollmentId).run()
  }

  return c.json({ ok: true, hard_deleted: hard })
})

// GET /admin/programs/:id/enrollments — list active enrollments for a program
// Used for the "who's enrolled in this program" view.
app.get('/admin/programs/:id/enrollments', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const enrollments = await c.env.DB.prepare(`
    SELECT e.id, e.user_id, e.start_date, e.end_date, e.is_active,
           e.created_at, e.updated_at,
           u.email, u.full_name, u.role, u.status
    FROM enrollments e
    JOIN users u ON e.user_id = u.id
    WHERE e.program_id = ?
      AND e.is_active = 1
    ORDER BY u.full_name ASC
  `).bind(id).all()
  return c.json({ enrollments: enrollments.results })
})

// GET /admin/programs
app.get('/admin/programs', requireAdmin, async (c) => {
  const programs = await c.env.DB.prepare('SELECT * FROM programs ORDER BY created_at ASC').all()
  return c.json({ programs: programs.results })
})

// POST /admin/programs — create new program
app.post('/admin/programs', requireAdmin, async (c) => {
  const body = await c.req.json()
  const {
    name, description, booking_type, booker_type, session_days,
    start_time, end_time, default_capacity, price_display,
    show_instructor, forward_view_weeks, cancellation_hours, max_bookings_per_week,
    start_date, end_date, default_instructor_id
  } = body

  if (!name) return c.json({ error: 'Name is required' }, 400)

  // Generate slug from name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // Check slug uniqueness
  const existing = await c.env.DB.prepare('SELECT id FROM programs WHERE slug = ?').bind(slug).first()
  if (existing) return c.json({ error: 'A program with this name already exists' }, 400)

  const id = 'prog_' + uid()
  await c.env.DB.prepare(`
    INSERT INTO programs (
      id, name, slug, description, booking_type, booker_type,
      session_days, start_time, end_time, default_capacity, price_display,
      show_instructor, forward_view_weeks, cancellation_hours, max_bookings_per_week,
      start_date, end_date, default_instructor_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    id, name, slug, description || null,
    booking_type || 'group', booker_type || 'student',
    session_days || 'tuesday,thursday',
    start_time || '09:00', end_time || '10:00',
    default_capacity || 10, price_display || null,
    show_instructor ? 1 : 0,
    forward_view_weeks || 2, cancellation_hours || 24, max_bookings_per_week || 1,
    start_date || null, end_date || null, default_instructor_id || null
  ).run()

  // Auto-generate sessions for the new program
  const newProgram = await c.env.DB.prepare('SELECT * FROM programs WHERE id = ?').bind(id).first()
  if (newProgram) await generateSessionsForProgram(newProgram, c.env)

  return c.json({ ok: true, program_id: id, slug })
})

// POST /admin/programs/:id/generate-sessions
app.post('/admin/programs/:id/generate-sessions', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const program = await c.env.DB.prepare('SELECT * FROM programs WHERE id = ?').bind(id).first()
  if (!program) return c.json({ error: 'Program not found' }, 404)
  const count = await generateSessionsForProgram(program, c.env)
  return c.json({ ok: true, sessions_created: count })
})

// GET /admin/programs/:id/session-instructor-stats
// Returns counts of future, non-cancelled sessions for this program, broken
// down by instructor assignment state. Used by the frontend before a Default
// Instructor change so the confirmation dialog can show real numbers.
//
// Response:
//   {
//     empty: <count of sessions with NULL instructor>,
//     by_instructor: [{ instructor_id, full_name, count }, ...]
//   }
app.get('/admin/programs/:id/session-instructor-stats', requireAdmin, async (c) => {
  const { id } = c.req.param()

  const empty = await c.env.DB.prepare(`
    SELECT COUNT(*) AS n FROM sessions
    WHERE program_id = ?
      AND instructor_id IS NULL
      AND date >= date('now')
      AND (is_cancelled IS NULL OR is_cancelled = 0)
  `).bind(id).first()

  const grouped = await c.env.DB.prepare(`
    SELECT s.instructor_id, COUNT(*) AS count, u.full_name
    FROM sessions s
    JOIN instructors i ON i.id = s.instructor_id
    JOIN users u ON u.id = i.user_id
    WHERE s.program_id = ?
      AND s.instructor_id IS NOT NULL
      AND s.date >= date('now')
      AND (s.is_cancelled IS NULL OR s.is_cancelled = 0)
    GROUP BY s.instructor_id
  `).bind(id).all()

  return c.json({
    empty: empty?.n || 0,
    by_instructor: grouped.results || [],
  })
})

// GET /admin/programs/:id/orphan-days-preview?session_days=mon,wed
//
// Given a proposed new session_days for this program, returns a per-day
// breakdown of future, non-cancelled sessions that would become "orphans"
// (i.e. sessions on days that are no longer in session_days).
//
// Used by the frontend before saving a program edit to confirm what cleanup
// will happen. Frontend then passes `session_days_action: 'delete_orphans'`
// in PUT to actually perform the cleanup.
//
// Response:
//   {
//     removed_days: ['friday'],     // days dropped from session_days
//     empty_count: 4,               // total empty future sessions on removed days
//     bookings_count: 2,            // total future sessions with bookings on removed days
//     affected_users: 5,            // total confirmed bookings across those sessions
//     per_day: [
//       { day: 'friday', empty: 4, with_bookings: 2, total_bookings: 5 }
//     ]
//   }
//
// If `session_days` query param is omitted or matches the current value
// exactly, returns zeroed counts.
app.get('/admin/programs/:id/orphan-days-preview', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const proposedRaw = c.req.query('session_days')

  const program = await c.env.DB.prepare(
    'SELECT id, session_days FROM programs WHERE id = ?'
  ).bind(id).first()
  if (!program) return c.json({ error: 'Program not found' }, 404)

  const currentDays = new Set(
    (program.session_days || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
  )
  const proposedDays = new Set(
    (proposedRaw || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
  )

  // If frontend didn't supply a proposal, fall back to current — net result is empty.
  const proposed = proposedRaw === undefined ? currentDays : proposedDays

  const removedDays = [...currentDays].filter(d => !proposed.has(d))

  if (removedDays.length === 0) {
    return c.json({
      removed_days: [],
      empty_count: 0,
      bookings_count: 0,
      affected_users: 0,
      per_day: [],
    })
  }

  // For each removed day, count future non-cancelled sessions and their bookings.
  // We do this in one pass per day to keep the query simple and bound to the
  // number of days (at most 7).
  const perDay = []
  let totalEmpty = 0
  let totalWithBookings = 0
  let totalUsers = 0

  for (const day of removedDays) {
    const result = await c.env.DB.prepare(`
      SELECT
        s.id,
        (SELECT COUNT(*) FROM bookings b
         WHERE b.session_id = s.id AND b.status = 'confirmed') AS confirmed_count
      FROM sessions s
      WHERE s.program_id = ?
        AND s.day_of_week = ?
        AND s.date >= date('now')
        AND (s.is_cancelled IS NULL OR s.is_cancelled = 0)
    `).bind(id, day).all()

    const rows = result.results || []
    let empty = 0
    let withBookings = 0
    let totalBookings = 0
    for (const r of rows) {
      const n = r.confirmed_count || 0
      if (n === 0) empty++
      else { withBookings++; totalBookings += n }
    }
    perDay.push({ day, empty, with_bookings: withBookings, total_bookings: totalBookings })
    totalEmpty += empty
    totalWithBookings += withBookings
    totalUsers += totalBookings
  }

  return c.json({
    removed_days: removedDays,
    empty_count: totalEmpty,
    bookings_count: totalWithBookings,
    affected_users: totalUsers,
    per_day: perDay,
  })
})

// PUT /admin/programs/:id
//
// Updates the program record, then propagates Default Instructor changes to
// future, non-cancelled sessions per the rules below.
//
// Frontend opt-in flag `existing_sessions_action` controls how to handle the
// instructor change when there are sessions already assigned to a DIFFERENT
// instructor:
//   - 'overwrite'        : reassign all future non-cancelled sessions to the
//                          new default, even if they already have a different
//                          instructor
//   - 'fill_empty_only'  : only assign the new default to sessions whose
//                          instructor_id is NULL — leave manually-reassigned
//                          sessions alone (this is also the default behavior
//                          if the frontend omits the flag)
//
// Special cases:
//   - new default = NULL  → ALWAYS clear all future non-cancelled sessions for
//                           this program. Admin explicitly removed the program's
//                           instructor; existing assignments would be misleading.
//   - new default = same as old → no-op on sessions
//
// Always safe: sessions that have already happened (date < today) and cancelled
// sessions are NEVER touched, regardless of action.
app.put('/admin/programs/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()

  const program = await c.env.DB.prepare('SELECT * FROM programs WHERE id = ?').bind(id).first()
  if (!program) return c.json({ error: 'Program not found' }, 404)

  const oldDefaultInstructor = program.default_instructor_id || null
  const newDefaultInstructor = 'default_instructor_id' in body
    ? (body.default_instructor_id || null)
    : oldDefaultInstructor
  const action = body.existing_sessions_action || 'fill_empty_only'

  await c.env.DB.prepare(`
    UPDATE programs SET
      name = ?, description = ?, booking_type = ?, booker_type = ?,
      session_days = ?, start_time = ?, end_time = ?, default_capacity = ?,
      price_display = ?, show_instructor = ?, forward_view_weeks = ?,
      forward_view_enabled = ?, cancellation_hours = ?, max_bookings_per_week = ?,
      is_active = ?, start_date = ?, end_date = ?, default_instructor_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.name ?? program.name,
    body.description ?? program.description,
    body.booking_type ?? program.booking_type,
    body.booker_type ?? program.booker_type,
    body.session_days ?? program.session_days,
    body.start_time ?? program.start_time,
    body.end_time ?? program.end_time,
    body.default_capacity ?? program.default_capacity,
    body.price_display ?? program.price_display,
    body.show_instructor !== undefined ? (body.show_instructor ? 1 : 0) : program.show_instructor,
    body.forward_view_weeks ?? program.forward_view_weeks,
    body.forward_view_enabled !== undefined ? (body.forward_view_enabled ? 1 : 0) : program.forward_view_enabled,
    body.cancellation_hours ?? program.cancellation_hours,
    body.max_bookings_per_week ?? program.max_bookings_per_week,
    body.is_active !== undefined ? (body.is_active ? 1 : 0) : program.is_active,
    'start_date' in body ? (body.start_date || null) : program.start_date,
    'end_date' in body ? (body.end_date || null) : program.end_date,
    newDefaultInstructor,
    id
  ).run()

  // ── Session backfill logic ───────────────────────────────────────────────
  let sessionsUpdated = 0
  let sessionsCleared = 0

  // Case 1: New default is NULL — clear instructor on all future non-cancelled sessions
  if (newDefaultInstructor === null) {
    if (oldDefaultInstructor !== null || action === 'overwrite') {
      // Find sessions to clear
      const toClear = await c.env.DB.prepare(`
        SELECT id FROM sessions
        WHERE program_id = ?
          AND instructor_id IS NOT NULL
          AND date >= date('now')
          AND (is_cancelled IS NULL OR is_cancelled = 0)
      `).bind(id).all()

      const ids = (toClear.results || []).map(r => r.id)
      if (ids.length > 0) {
        const ph = '(' + ids.map(() => '?').join(',') + ')'
        await c.env.DB.prepare(
          `UPDATE sessions SET instructor_id = NULL WHERE id IN ${ph}`
        ).bind(...ids).run()

        // Also clear the corresponding session_instructors rows
        await c.env.DB.prepare(
          `DELETE FROM session_instructors WHERE session_id IN ${ph}`
        ).bind(...ids).run()

        sessionsCleared = ids.length
      }
    }
  }
  // Case 2: New default is set, no change from old — no-op (don't touch sessions
  //         the admin didn't actually change anything related to instructor)
  else if (newDefaultInstructor === oldDefaultInstructor) {
    // No session changes
  }
  // Case 3: New default is set, different from old (or old was NULL) — backfill
  else {
    // Determine which sessions to update based on action
    let toUpdateQuery
    if (action === 'overwrite') {
      // All future non-cancelled sessions, regardless of current instructor
      toUpdateQuery = `
        SELECT id FROM sessions
        WHERE program_id = ?
          AND date >= date('now')
          AND (is_cancelled IS NULL OR is_cancelled = 0)
      `
    } else {
      // Only NULL-instructor future non-cancelled sessions
      toUpdateQuery = `
        SELECT id FROM sessions
        WHERE program_id = ?
          AND instructor_id IS NULL
          AND date >= date('now')
          AND (is_cancelled IS NULL OR is_cancelled = 0)
      `
    }

    const toUpdate = await c.env.DB.prepare(toUpdateQuery).bind(id).all()
    const ids = (toUpdate.results || []).map(r => r.id)

    if (ids.length > 0) {
      const ph = '(' + ids.map(() => '?').join(',') + ')'

      // Update sessions.instructor_id
      await c.env.DB.prepare(
        `UPDATE sessions SET instructor_id = ? WHERE id IN ${ph}`
      ).bind(newDefaultInstructor, ...ids).run()

      // For overwrite mode, replace session_instructors rows. For fill_empty_only,
      // there shouldn't be any existing session_instructors rows for these
      // sessions (since their instructor_id was NULL), but we DELETE first
      // defensively in case they exist for any reason.
      await c.env.DB.prepare(
        `DELETE FROM session_instructors WHERE session_id IN ${ph}`
      ).bind(...ids).run()

      // Insert fresh session_instructors rows
      for (const sid of ids) {
        try {
          const siId = 'si_' + uid()
          await c.env.DB.prepare(
            'INSERT INTO session_instructors (id, session_id, instructor_id) VALUES (?, ?, ?)'
          ).bind(siId, sid, newDefaultInstructor).run()
        } catch (e) {
          // Defensive: if the insert fails for any reason, sessions.instructor_id
          // is already updated above and remains the source of truth. Log and continue.
          console.error('session_instructors insert failed for session', sid, e?.message)
        }
      }

      sessionsUpdated = ids.length
    }
  }

  // ── session_days orphan cleanup (v3.4) ───────────────────────────────────
  // If admin removed a day from session_days AND opted in via
  // `session_days_action: 'delete_orphans'`, clean up future sessions on the
  // removed days:
  //   - Empty future sessions on removed days → DELETE (and their session_instructors rows)
  //   - Future sessions on removed days WITH bookings → cancel the session
  //     (is_cancelled = 1), cancel the bookings (status = 'cancelled'), and
  //     email the affected users.
  //
  // This mirrors the Default Instructor opt-in pattern: frontend hits the
  // preview endpoint first, shows admin the count, and only sends this action
  // flag after explicit admin confirmation.
  let sessionsOrphanDeleted = 0
  let sessionsOrphanCancelled = 0
  let bookingsOrphanCancelled = 0

  const sessionDaysAction = body.session_days_action || 'skip'
  if (sessionDaysAction === 'delete_orphans' && body.session_days !== undefined) {
    const oldDays = new Set(
      (program.session_days || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
    )
    const newDays = new Set(
      (body.session_days || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
    )
    const removedDays = [...oldDays].filter(d => !newDays.has(d))

    if (removedDays.length > 0) {
      // Pull every future non-cancelled session on a removed day, with booking count
      const orphanSessionsResult = await c.env.DB.prepare(`
        SELECT
          s.id, s.date, s.start_time, s.day_of_week,
          (SELECT COUNT(*) FROM bookings b
           WHERE b.session_id = s.id AND b.status = 'confirmed') AS confirmed_count
        FROM sessions s
        WHERE s.program_id = ?
          AND s.day_of_week IN (${removedDays.map(() => '?').join(',')})
          AND s.date >= date('now')
          AND (s.is_cancelled IS NULL OR s.is_cancelled = 0)
      `).bind(id, ...removedDays).all()

      const orphans = orphanSessionsResult.results || []
      const emptyIds = orphans.filter(s => (s.confirmed_count || 0) === 0).map(s => s.id)
      const bookedSessions = orphans.filter(s => (s.confirmed_count || 0) > 0)

      // ── 1. Delete empty orphans (and their session_instructors rows) ──
      if (emptyIds.length > 0) {
        const ph = '(' + emptyIds.map(() => '?').join(',') + ')'
        try {
          // Delete session_instructors first (FK constraint)
          await c.env.DB.prepare(
            `DELETE FROM session_instructors WHERE session_id IN ${ph}`
          ).bind(...emptyIds).run()
          // Then delete sessions
          await c.env.DB.prepare(
            `DELETE FROM sessions WHERE id IN ${ph}`
          ).bind(...emptyIds).run()
          sessionsOrphanDeleted = emptyIds.length
        } catch (e) {
          console.error('Orphan empty-session delete failed:', e.message)
        }
      }

      // ── 2. Cancel orphans with bookings + cancel their bookings + email ──
      for (const sess of bookedSessions) {
        // Snapshot booked users BEFORE the update, so emails go out with
        // names/emails captured at this moment.
        let bookedUsers = { results: [] }
        try {
          bookedUsers = await c.env.DB.prepare(`
            SELECT b.id as booking_id, u.email, u.full_name, ch.first_name as child_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            LEFT JOIN children ch ON b.child_id = ch.id
            WHERE b.session_id = ? AND b.status = 'confirmed'
          `).bind(sess.id).all()
        } catch (e) {
          console.error('Failed to fetch booked users for orphan session', sess.id, e.message)
          continue
        }

        // Cancel session + cancel bookings
        try {
          await c.env.DB.prepare(`
            UPDATE sessions SET is_cancelled = 1, cancel_reason = ?
            WHERE id = ?
          `).bind('Program schedule changed', sess.id).run()
          await c.env.DB.prepare(`
            UPDATE bookings
            SET status = 'cancelled', cancelled_at = datetime('now')
            WHERE session_id = ? AND status = 'confirmed'
          `).bind(sess.id).run()
          sessionsOrphanCancelled++
          bookingsOrphanCancelled += bookedUsers.results.length
        } catch (e) {
          console.error('Orphan booked-session cancel failed for', sess.id, e.message)
          continue
        }

        // Email users (non-blocking)
        try {
          const updatedProg = await c.env.DB.prepare('SELECT name FROM programs WHERE id = ?').bind(id).first()
          for (const booking of bookedUsers.results) {
            const { subject: ss, html: sh } = sessionCancelledEmail({
              recipientName: booking.full_name,
              programName: updatedProg?.name || 'Session',
              date: sess.date,
              startTime: sess.start_time,
              cancelReason: 'Program schedule changed',
            })
            await sendEmail(c.env, { to: booking.email, subject: ss, html: sh })
          }
        } catch (e) {
          console.error('Orphan cancel emails failed for session', sess.id, e.message)
        }
      }
    }
  }

  return c.json({
    ok: true,
    sessions_updated: sessionsUpdated,
    sessions_cleared: sessionsCleared,
    sessions_orphan_deleted: sessionsOrphanDeleted,
    sessions_orphan_cancelled: sessionsOrphanCancelled,
    bookings_orphan_cancelled: bookingsOrphanCancelled,
  })
})

// GET /admin/config
app.get('/admin/config', requireAdmin, async (c) => {
  const config = await c.env.DB.prepare('SELECT * FROM config WHERE id = 1').first()
  return c.json({ config })
})

// PUT /admin/config
app.put('/admin/config', requireAdmin, async (c) => {
  const { admin_email } = await c.req.json()
  await c.env.DB.prepare(
    "UPDATE config SET admin_email = ?, updated_at = datetime('now') WHERE id = 1"
  ).bind(admin_email).run()
  return c.json({ ok: true })
})

// GET /admin/webhooks/registry-info
// Returns the full Registry Golf webhook URL for admin to paste into Registry
// Golf's webhook config. Includes the secret token from env. Admin-only because
// the secret token is sensitive — though admins can also see it in the
// Cloudflare dashboard.
//
// Returns { configured: false } if REGISTRY_WEBHOOK_SECRET env var is unset,
// so the UI can prompt the admin to set it.
app.get('/admin/webhooks/registry-info', requireAdmin, async (c) => {
  const secret = c.env.REGISTRY_WEBHOOK_SECRET
  if (!secret) {
    return c.json({ configured: false })
  }
  // Use the request's own origin so the URL points at the same worker that
  // answered this request — works for prod and any preview deployments.
  const url = new URL(c.req.url)
  const webhookUrl = `${url.origin}/webhooks/registry?key=${encodeURIComponent(secret)}`
  return c.json({ configured: true, url: webhookUrl })
})

// GET /admin/instructors — list all instructors for dropdowns
app.get('/admin/instructors', requireAdminOrSwinger, async (c) => {
  const instructors = await c.env.DB.prepare(`
    SELECT i.id, i.bio, u.id as user_id, u.full_name, u.email, u.status
    FROM instructors i
    JOIN users u ON i.user_id = u.id
    WHERE u.status = 'active'
    ORDER BY u.full_name ASC
  `).all()
  return c.json({ instructors: instructors.results })
})

// ─── INSTRUCTOR ROUTES ────────────────────────────────────────────────────────

// GET /instructor/sessions
app.get('/instructor/sessions', requireInstructor, async (c) => {
  const user = c.get('user')
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const sessions = await c.env.DB.prepare(`
    SELECT s.*,
      p.name as program_name,
      (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') as booked_count
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    WHERE s.instructor_id = ? AND s.date >= date('now')
    ORDER BY s.date ASC
  `).bind(instr.id).all()

  return c.json({ sessions: sessions.results })
})

// GET /instructor/students
app.get('/instructor/students', requireInstructor, async (c) => {
  const user = c.get('user')
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const students = await c.env.DB.prepare(`
    SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status,
      ch.first_name as child_name
    FROM student_instructors si
    JOIN users u ON si.student_id = u.id
    LEFT JOIN children ch ON ch.parent_id = u.id
    WHERE si.instructor_id = ?
    ORDER BY u.full_name ASC
  `).bind(instr.id).all()

  return c.json({ students: students.results })
})


// GET /instructor/sessions/:id/roster
app.get('/instructor/sessions/:id/roster', requireInstructor, async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)
  const session = await c.env.DB.prepare(`
    SELECT s.*, p.name as program_name FROM sessions s
    JOIN programs p ON s.program_id = p.id
    WHERE s.id = ? AND s.instructor_id = ?
  `).bind(id, instr.id).first()
  if (!session) return c.json({ error: 'Session not found or not assigned to you' }, 404)
  const bookings = await c.env.DB.prepare(`
    SELECT b.*, u.full_name, u.email, u.phone, ch.first_name as child_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    LEFT JOIN children ch ON b.child_id = ch.id
    WHERE b.session_id = ? AND b.status = 'confirmed'
    ORDER BY u.full_name ASC
  `).bind(id).all()
  return c.json({ session, bookings: bookings.results })
})

// GET /instructor/students/:id/sessions
app.get('/instructor/students/:id/sessions', requireInstructor, async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)
  const assigned = await c.env.DB.prepare(
    'SELECT id FROM student_instructors WHERE student_id = ? AND instructor_id = ?'
  ).bind(id, instr.id).first()
  if (!assigned) return c.json({ error: 'Student not assigned to you' }, 403)
  const sessions = await c.env.DB.prepare(`
    SELECT s.*, p.name as program_name
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    JOIN bookings b ON b.session_id = s.id
    WHERE s.instructor_id = ? AND b.user_id = ? AND b.status = 'confirmed'
    ORDER BY s.date DESC
  `).bind(instr.id, id).all()
  return c.json({ sessions: sessions.results })
})

// GET /instructor/students/:id/notes
app.get('/instructor/students/:id/notes', requireInstructor, async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)
  const notes = await c.env.DB.prepare(`
    SELECT * FROM lesson_notes
    WHERE instructor_id = ? AND student_id = ?
    ORDER BY created_at DESC
  `).bind(instr.id, id).all()
  return c.json({ notes: notes.results })
})

// ─── INSTRUCTOR SESSIONS ROUTES ──────────────────────────────────────────────

// GET /instructor/program-sessions — sessions where this instructor is assigned (week or range)
app.get('/instructor/program-sessions', requireInstructor, async (c) => {
  const user = c.get('user')
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ sessions: [] })

  const week = c.req.query('week')
  const start = c.req.query('start')
  const end = c.req.query('end')

  let dateFilter = ''
  let params = [instr.id, instr.id]
  if (start && end) {
    dateFilter = 'AND s.date >= ? AND s.date <= ?'
    params.push(start, end)
  } else if (week) {
    // Sun-Sat week
    const weekStart = new Date(week)
    const day = weekStart.getDay()
    weekStart.setDate(weekStart.getDate() - day)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    dateFilter = 'AND s.date >= ? AND s.date <= ?'
    params.push(weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0])
  }

  const sessions = await c.env.DB.prepare(`
    SELECT DISTINCT s.*,
      p.name as program_name, p.slug as program_slug,
      (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') as booked_count
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN session_instructors si ON si.session_id = s.id
    WHERE (s.instructor_id = ? OR si.instructor_id = ?) ${dateFilter}
    ORDER BY s.date ASC, s.start_time ASC
  `).bind(...params).all()

  return c.json({ sessions: sessions.results })
})

// GET /instructor/program-sessions/:id/roster — full roster for an assigned session
app.get('/instructor/program-sessions/:id/roster', requireInstructor, async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  // Verify the instructor is assigned to this session (either via instructor_id or session_instructors)
  const session = await c.env.DB.prepare(`
    SELECT s.*, p.name as program_name, p.booker_type
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    WHERE s.id = ?
      AND (
        s.instructor_id = ?
        OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.session_id = s.id AND si.instructor_id = ?)
      )
  `).bind(id, instr.id, instr.id).first()
  if (!session) return c.json({ error: 'Session not found or not assigned to you' }, 403)

  const bookings = await c.env.DB.prepare(`
    SELECT b.*, u.full_name, u.email, u.phone, u.role, ch.first_name as child_name
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    LEFT JOIN children ch ON b.child_id = ch.id
    WHERE b.session_id = ? AND b.status = 'confirmed'
    ORDER BY u.full_name ASC
  `).bind(id).all()

  return c.json({ session, bookings: bookings.results })
})

// POST /instructor/program-sessions/:id/checkin — check in a booking on an assigned session
app.post('/instructor/bookings/:bookingId/checkin', requireInstructor, async (c) => {
  const user = c.get('user')
  const { bookingId } = c.req.param()
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const booking = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(bookingId).first()
  if (!booking) return c.json({ error: 'Booking not found' }, 404)

  // Verify instructor is assigned to this session
  const auth = await c.env.DB.prepare(`
    SELECT 1 FROM sessions s
    WHERE s.id = ?
      AND (s.instructor_id = ? OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.session_id = s.id AND si.instructor_id = ?))
  `).bind(booking.session_id, instr.id, instr.id).first()
  if (!auth) return c.json({ error: 'Not assigned to this session' }, 403)

  const newCheckedIn = booking.checked_in ? 0 : 1
  await c.env.DB.prepare(
    "UPDATE bookings SET checked_in = ?, checked_in_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?"
  ).bind(newCheckedIn, newCheckedIn, bookingId).run()

  return c.json({ ok: true, checked_in: newCheckedIn })
})

// POST /instructor/program-sessions/:id/bookings — manually add a person to an assigned session
app.post('/instructor/program-sessions/:id/bookings', requireInstructor, async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const { user_id } = await c.req.json()
  if (!user_id) return c.json({ error: 'user_id required' }, 400)

  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  // Verify assignment
  const auth = await c.env.DB.prepare(`
    SELECT 1 FROM sessions s
    WHERE s.id = ?
      AND (s.instructor_id = ? OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.session_id = s.id AND si.instructor_id = ?))
  `).bind(id, instr.id, instr.id).first()
  if (!auth) return c.json({ error: 'Not assigned to this session' }, 403)

  const targetUser = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user_id).first()
  if (!targetUser) return c.json({ error: 'User not found' }, 404)

  let child_id = null
  if (targetUser.role === 'parent') {
    const child = await c.env.DB.prepare('SELECT id FROM children WHERE parent_id = ?').bind(user_id).first()
    if (child) child_id = child.id
  }

  const bkId = 'bkg_' + uid()
  try {
    await c.env.DB.prepare(
      'INSERT INTO bookings (id, session_id, user_id, child_id, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(bkId, id, user_id, child_id, 'confirmed').run()
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: 'Already booked' }, 400)
    throw e
  }

  return c.json({ ok: true, booking_id: bkId })
})

// DELETE /instructor/bookings/:bookingId — instructor removes a person from their assigned session
app.delete('/instructor/bookings/:bookingId', requireInstructor, async (c) => {
  const user = c.get('user')
  const { bookingId } = c.req.param()
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const booking = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, p.name as program_name, u.email, u.full_name, u.role, ch.first_name as child_name
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN programs p ON s.program_id = p.id
    JOIN users u ON b.user_id = u.id
    LEFT JOIN children ch ON b.child_id = ch.id
    WHERE b.id = ?
  `).bind(bookingId).first()
  if (!booking) return c.json({ error: 'Booking not found' }, 404)
  if (booking.status === 'cancelled') return c.json({ error: 'Booking already cancelled' }, 400)

  // Verify instructor is assigned to the session
  const auth = await c.env.DB.prepare(`
    SELECT 1 FROM sessions s
    WHERE s.id = ?
      AND (s.instructor_id = ? OR EXISTS (SELECT 1 FROM session_instructors si WHERE si.session_id = s.id AND si.instructor_id = ?))
  `).bind(booking.session_id, instr.id, instr.id).first()
  if (!auth) return c.json({ error: 'Not assigned to this session' }, 403)

  await c.env.DB.prepare(
    "UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?"
  ).bind(bookingId).run()

  // Email user
  try {
    const { subject, html } = bookingCancelledEmail({
      recipientName: booking.full_name,
      programName: booking.program_name,
      date: booking.date,
      startTime: booking.start_time,
      bookerType: booking.role,
      childName: booking.child_name,
    })
    await sendEmail(c.env, { to: booking.email, subject, html })
  } catch (e) {
    console.error('Instructor cancel email failed:', e.message)
  }

  return c.json({ ok: true })
})

// GET /instructor/searchable-members — for the manual booking lookup (filtered to active users)
app.get('/instructor/searchable-members', requireInstructor, async (c) => {
  const q = c.req.query('q') || ''
  const result = await c.env.DB.prepare(`
    SELECT u.id, u.full_name, u.email, u.role, ch.first_name as child_name
    FROM users u
    LEFT JOIN children ch ON ch.parent_id = u.id
    WHERE u.status = 'active' AND (u.full_name LIKE ? OR u.email LIKE ?)
    ORDER BY u.full_name ASC
    LIMIT 20
  `).bind(`%${q}%`, `%${q}%`).all()
  return c.json({ members: result.results })
})

// ─── PRIVATE LESSON ROUTES ────────────────────────────────────────────────────

// GET /instructor/lessons — all private lessons for this instructor (schedule view)
app.get('/instructor/lessons', requireInstructor, async (c) => {
  const user = c.get('user')
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ lessons: [] })

  const lessons = await c.env.DB.prepare(`
    SELECT pl.*,
      u.full_name as full_name, u.email as student_email, u.role as student_role,
      ch.first_name as child_name,
      ln.note as coaching_note, ln.updated_at as note_updated_at,
      CASE WHEN ln.id IS NOT NULL THEN 1 ELSE 0 END as has_note
    FROM private_lessons pl
    LEFT JOIN users u ON pl.student_id = u.id
    LEFT JOIN children ch ON ch.parent_id = u.id
    LEFT JOIN lesson_notes ln ON ln.lesson_id = pl.id AND ln.instructor_id = ?
    WHERE pl.instructor_id = ?
    ORDER BY pl.date DESC, pl.start_time ASC
  `).bind(instr.id, instr.id).all()

  return c.json({ lessons: lessons.results })
})

// GET /instructor/students/:id/lessons — lessons for a specific student
app.get('/instructor/students/:id/lessons', requireInstructor, async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const assigned = await c.env.DB.prepare(
    'SELECT id FROM student_instructors WHERE student_id = ? AND instructor_id = ?'
  ).bind(id, instr.id).first()
  if (!assigned) return c.json({ error: 'Student not assigned to you' }, 403)

  const lessons = await c.env.DB.prepare(`
    SELECT pl.*,
      ln.note as coaching_note, ln.updated_at as note_updated_at,
      CASE WHEN ln.id IS NOT NULL THEN 1 ELSE 0 END as has_note,
      CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END as has_gspro
    FROM private_lessons pl
    LEFT JOIN lesson_notes ln ON ln.lesson_id = pl.id AND ln.instructor_id = ?
    LEFT JOIN gspro_uploads g ON g.lesson_id = pl.id
    WHERE pl.instructor_id = ? AND pl.student_id = ?
    ORDER BY pl.date DESC, pl.start_time ASC
  `).bind(instr.id, instr.id, id).all()

  return c.json({ lessons: lessons.results })
})

// POST /instructor/students/:id/lessons — create a private lesson
app.post('/instructor/students/:id/lessons', requireInstructor, async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const { date, start_time, end_time, bay, notes } = await c.req.json()

  if (!date || !start_time || !end_time) return c.json({ error: 'Date and times are required' }, 400)

  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const assigned = await c.env.DB.prepare(
    'SELECT id FROM student_instructors WHERE student_id = ? AND instructor_id = ?'
  ).bind(id, instr.id).first()
  if (!assigned) return c.json({ error: 'Student not assigned to you' }, 403)

  const lessonId = 'pl_' + uid()
  await c.env.DB.prepare(`
    INSERT INTO private_lessons (id, instructor_id, student_id, date, start_time, end_time, bay, notes, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')
  `).bind(lessonId, instr.id, id, date, start_time, end_time, bay || null, notes || null).run()

  return c.json({ ok: true, lesson_id: lessonId })
})

// PUT /instructor/lessons/:id — edit a private lesson
// Accepts optional student_id so an instructor can assign/reassign the student
// on an unassigned lesson (e.g. one created by the Registry Golf webhook).
app.put('/instructor/lessons/:id', requireInstructor, async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const body = await c.req.json()
  const { date, start_time, end_time, bay, notes, student_id } = body

  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const lesson = await c.env.DB.prepare(
    'SELECT * FROM private_lessons WHERE id = ? AND instructor_id = ?'
  ).bind(id, instr.id).first()
  if (!lesson) return c.json({ error: 'Lesson not found' }, 404)

  // If client passed student_id explicitly (including null/empty to unassign),
  // validate and use it. If the field is absent from the payload, keep current.
  let nextStudentId = lesson.student_id
  if (Object.prototype.hasOwnProperty.call(body, 'student_id')) {
    if (student_id === null || student_id === '' || student_id === undefined) {
      nextStudentId = null
    } else {
      // Verify the student exists and is actually assigned to this instructor
      const assignment = await c.env.DB.prepare(
        'SELECT 1 as ok FROM student_instructors WHERE student_id = ? AND instructor_id = ?'
      ).bind(student_id, instr.id).first()
      if (!assignment) return c.json({ error: 'Student not assigned to you' }, 403)
      nextStudentId = student_id
    }
  }

  await c.env.DB.prepare(`
    UPDATE private_lessons SET
      student_id = ?, date = ?, start_time = ?, end_time = ?, bay = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    nextStudentId,
    date ?? lesson.date,
    start_time ?? lesson.start_time,
    end_time ?? lesson.end_time,
    bay ?? lesson.bay,
    notes ?? lesson.notes,
    id
  ).run()

  return c.json({ ok: true })
})

// DELETE /instructor/lessons/:id — cancel a private lesson
app.delete('/instructor/lessons/:id', requireInstructor, async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')

  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const lesson = await c.env.DB.prepare(
    'SELECT * FROM private_lessons WHERE id = ? AND instructor_id = ?'
  ).bind(id, instr.id).first()
  if (!lesson) return c.json({ error: 'Lesson not found' }, 404)

  await c.env.DB.prepare(
    "UPDATE private_lessons SET is_cancelled = 1, updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run()

  return c.json({ ok: true })
})

// POST /instructor/students/:id/notes — upsert coaching note for a private lesson
app.post('/instructor/students/:id/notes', requireInstructor, async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const { lesson_id, note } = await c.req.json()

  if (!note?.trim()) return c.json({ error: 'Note cannot be empty' }, 400)
  if (!lesson_id) return c.json({ error: 'lesson_id is required' }, 400)

  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const assigned = await c.env.DB.prepare(
    'SELECT id FROM student_instructors WHERE student_id = ? AND instructor_id = ?'
  ).bind(id, instr.id).first()
  if (!assigned) return c.json({ error: 'Student not assigned to you' }, 403)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM lesson_notes WHERE instructor_id = ? AND student_id = ? AND lesson_id = ?'
  ).bind(instr.id, id, lesson_id).first()

  if (existing) {
    await c.env.DB.prepare(
      "UPDATE lesson_notes SET note = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(note.trim(), existing.id).run()
    return c.json({ ok: true, updated: true })
  }

  const noteId = 'note_' + uid()
  await c.env.DB.prepare(
    'INSERT INTO lesson_notes (id, instructor_id, student_id, lesson_id, note) VALUES (?, ?, ?, ?, ?)'
  ).bind(noteId, instr.id, id, lesson_id, note.trim()).run()

  return c.json({ ok: true, note_id: noteId })
})


// ─── GSPRO / THEORY AI ROUTES ─────────────────────────────────────────────────

// POST /instructor/lessons/:id/gspro — upload CSV for a lesson
app.post('/instructor/lessons/:id/gspro', requireInstructor, async (c) => {
  const { id: lessonId } = c.req.param()
  const clerkId = c.get('clerkId')
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(clerkId).first()
  const instr = await c.env.DB.prepare('SELECT * FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const lesson = await c.env.DB.prepare('SELECT * FROM private_lessons WHERE id = ? AND instructor_id = ?').bind(lessonId, instr.id).first()
  if (!lesson) return c.json({ error: 'Lesson not found or not yours' }, 404)

  const { csv_data } = await c.req.json()
  if (!csv_data) return c.json({ error: 'csv_data is required' }, 400)

  // Upsert — replace existing upload for this lesson
  const existing = await c.env.DB.prepare('SELECT id FROM gspro_uploads WHERE lesson_id = ?').bind(lessonId).first()
  if (existing) {
    await c.env.DB.prepare("UPDATE gspro_uploads SET csv_data = ?, uploaded_at = datetime('now') WHERE lesson_id = ?")
      .bind(csv_data, lessonId).run()
  } else {
    const uploadId = 'gspro_' + uid()
    await c.env.DB.prepare('INSERT INTO gspro_uploads (id, lesson_id, student_id, instructor_id, csv_data) VALUES (?, ?, ?, ?, ?)')
      .bind(uploadId, lessonId, lesson.student_id, instr.id, csv_data).run()
  }

  return c.json({ ok: true })
})

// GET /lessons/:id/gspro — fetch GSPro data for a lesson (student, instructor, admin)
app.get('/lessons/:id/gspro', requireAuth, async (c) => {
  const { id: lessonId } = c.req.param()
  const clerkId = c.get('clerkId')
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(clerkId).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  const upload = await c.env.DB.prepare('SELECT * FROM gspro_uploads WHERE lesson_id = ?').bind(lessonId).first()
  if (!upload) return c.json({ upload: null })

  // Access control
  if (user.role === 'student' && upload.student_id !== user.id) return c.json({ error: 'Forbidden' }, 403)
  if (user.role === 'instructor') {
    const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
    if (!instr || upload.instructor_id !== instr.id) return c.json({ error: 'Forbidden' }, 403)
  }

  return c.json({ upload })
})

// ─── SWINGER THEORY AI ROUTES ─────────────────────────────────────────────────

// GET /swinger/practice — list all practice sessions for the logged-in swinger
app.get('/swinger/practice', requireSwinger, async (c) => {
  const user = c.get('user')
  const sessions = await c.env.DB.prepare(`
    SELECT ps.*,
      CASE WHEN g.id IS NOT NULL THEN 1 ELSE 0 END as has_gspro
    FROM practice_sessions ps
    LEFT JOIN practice_gspro g ON g.practice_session_id = ps.id
    WHERE ps.user_id = ?
    ORDER BY ps.date DESC, ps.created_at DESC
  `).bind(user.id).all()
  return c.json({ sessions: sessions.results })
})

// POST /swinger/practice — create a new practice session
app.post('/swinger/practice', requireSwinger, async (c) => {
  const user = c.get('user')
  const { date, notes } = await c.req.json()
  if (!date) return c.json({ error: 'Date is required' }, 400)

  const id = 'ps_' + uid()
  await c.env.DB.prepare(
    'INSERT INTO practice_sessions (id, user_id, date, notes) VALUES (?, ?, ?, ?)'
  ).bind(id, user.id, date, notes?.trim() || null).run()

  return c.json({ ok: true, session_id: id })
})

// GET /swinger/practice/:id — get a single practice session with its GSPro data
app.get('/swinger/practice/:id', requireSwinger, async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const session = await c.env.DB.prepare(
    'SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first()
  if (!session) return c.json({ error: 'Practice session not found' }, 404)

  const gspro = await c.env.DB.prepare(
    'SELECT * FROM practice_gspro WHERE practice_session_id = ?'
  ).bind(id).first()

  return c.json({ session, gspro: gspro || null })
})

// PUT /swinger/practice/:id — update date or notes
app.put('/swinger/practice/:id', requireSwinger, async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const body = await c.req.json()

  const existing = await c.env.DB.prepare(
    'SELECT * FROM practice_sessions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first()
  if (!existing) return c.json({ error: 'Practice session not found' }, 404)

  await c.env.DB.prepare(`
    UPDATE practice_sessions
    SET date = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    body.date ?? existing.date,
    'notes' in body ? (body.notes?.trim() || null) : existing.notes,
    id
  ).run()

  return c.json({ ok: true })
})

// DELETE /swinger/practice/:id — delete a practice session and its GSPro data
app.delete('/swinger/practice/:id', requireSwinger, async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const existing = await c.env.DB.prepare(
    'SELECT id FROM practice_sessions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first()
  if (!existing) return c.json({ error: 'Practice session not found' }, 404)

  await c.env.DB.prepare('DELETE FROM practice_gspro WHERE practice_session_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM practice_sessions WHERE id = ?').bind(id).run()

  return c.json({ ok: true })
})

// POST /swinger/practice/:id/gspro — upload (or replace) GSPro CSV for a practice session
app.post('/swinger/practice/:id/gspro', requireSwinger, async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()
  const { csv_data } = await c.req.json()
  if (!csv_data) return c.json({ error: 'csv_data is required' }, 400)

  const session = await c.env.DB.prepare(
    'SELECT id FROM practice_sessions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first()
  if (!session) return c.json({ error: 'Practice session not found' }, 404)

  const existing = await c.env.DB.prepare(
    'SELECT id FROM practice_gspro WHERE practice_session_id = ?'
  ).bind(id).first()

  if (existing) {
    await c.env.DB.prepare(
      "UPDATE practice_gspro SET csv_data = ?, uploaded_at = datetime('now') WHERE practice_session_id = ?"
    ).bind(csv_data, id).run()
  } else {
    const uploadId = 'pg_' + uid()
    await c.env.DB.prepare(
      'INSERT INTO practice_gspro (id, practice_session_id, user_id, csv_data) VALUES (?, ?, ?, ?)'
    ).bind(uploadId, id, user.id, csv_data).run()
  }

  return c.json({ ok: true })
})

// DELETE /swinger/practice/:id/gspro — remove GSPro data from a practice session
app.delete('/swinger/practice/:id/gspro', requireSwinger, async (c) => {
  const user = c.get('user')
  const { id } = c.req.param()

  const session = await c.env.DB.prepare(
    'SELECT id FROM practice_sessions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first()
  if (!session) return c.json({ error: 'Practice session not found' }, 404)

  await c.env.DB.prepare(
    'DELETE FROM practice_gspro WHERE practice_session_id = ?'
  ).bind(id).run()

  return c.json({ ok: true })
})

// ─── STAFF SCHEDULE (SHIFTS) ──────────────────────────────────────────────────
// Schedule for swinger employees. Admin can CRUD; swingers can read only.
// Entirely separate from the customer-facing sessions/bookings system.

const SHIFT_TYPES = ['Morning', 'Mid', 'Day', 'Evening', 'Night', 'All Day', 'Custom']

function validateTimeStr(t) {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
}
function validateDateStr(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
}
function timeStrToMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

// GET /admin/shifts/swingers — list all users with role='swinger' for use as the roster
// Sorted alphabetically by full_name. Available to admins and swingers.
app.get('/admin/shifts/swingers', requireAdminOrSwinger, async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, full_name, email, phone
    FROM users
    WHERE role = 'swinger' AND status = 'active'
    ORDER BY full_name ASC
  `).all()
  return c.json({ swingers: result.results })
})

// GET /admin/shifts/range?start=YYYY-MM-DD&end=YYYY-MM-DD[&user_id=me|<id>]
// Returns shifts in the date range, joined with the swinger's name.
// Admins can pass any user_id (or omit for all). Swingers can ONLY pass user_id=me
// (or their own id) — this enforces the personal-schedule scoping for SwingerSchedule.
app.get('/admin/shifts/range', requireAdminOrSwinger, async (c) => {
  const start = c.req.query('start')
  const end = c.req.query('end')
  const userIdParam = c.req.query('user_id')
  if (!validateDateStr(start) || !validateDateStr(end)) {
    return c.json({ error: 'Invalid start or end date (expected YYYY-MM-DD)' }, 400)
  }

  const caller = c.get('user')

  // Resolve user_id filter. 'me' is shorthand for the caller's own id.
  let userIdFilter = null
  if (userIdParam === 'me') {
    userIdFilter = caller.id
  } else if (userIdParam) {
    userIdFilter = userIdParam
  }

  // Swingers must not see other swingers' shifts on this endpoint — force scope to self.
  if (caller.role === 'swinger') {
    if (userIdFilter && userIdFilter !== caller.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    userIdFilter = caller.id
  }

  let result
  if (userIdFilter) {
    result = await c.env.DB.prepare(`
      SELECT s.id, s.user_id, s.date, s.start_time, s.end_time, s.shift_type,
             u.full_name as swinger_name
      FROM shifts s
      JOIN users u ON s.user_id = u.id
      WHERE s.date >= ? AND s.date <= ? AND s.user_id = ?
      ORDER BY s.date ASC, s.start_time ASC
    `).bind(start, end, userIdFilter).all()
  } else {
    result = await c.env.DB.prepare(`
      SELECT s.id, s.user_id, s.date, s.start_time, s.end_time, s.shift_type,
             u.full_name as swinger_name
      FROM shifts s
      JOIN users u ON s.user_id = u.id
      WHERE s.date >= ? AND s.date <= ?
      ORDER BY s.date ASC, s.start_time ASC
    `).bind(start, end).all()
  }
  return c.json({ shifts: result.results })
})

// POST /admin/shifts — create a new shift (admin only)
// Body: { user_id, date, start_time, end_time, shift_type }
app.post('/admin/shifts', requireAdmin, async (c) => {
  const body = await c.req.json()
  const { user_id, date, start_time, end_time, shift_type } = body || {}

  // Validation
  if (!user_id) return c.json({ error: 'user_id is required' }, 400)
  if (!validateDateStr(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400)
  if (!validateTimeStr(start_time)) return c.json({ error: 'start_time must be HH:MM' }, 400)
  if (!validateTimeStr(end_time)) return c.json({ error: 'end_time must be HH:MM' }, 400)
  if (timeStrToMin(start_time) >= timeStrToMin(end_time)) {
    return c.json({ error: 'end_time must be after start_time' }, 400)
  }
  const finalType = shift_type && SHIFT_TYPES.includes(shift_type) ? shift_type : 'Custom'

  // Verify user exists and is a swinger
  const swinger = await c.env.DB.prepare(
    "SELECT id FROM users WHERE id = ? AND role = 'swinger' AND status = 'active'"
  ).bind(user_id).first()
  if (!swinger) return c.json({ error: 'User not found or not an active swinger' }, 404)

  const id = 'shift_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  await c.env.DB.prepare(`
    INSERT INTO shifts (id, user_id, date, start_time, end_time, shift_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, user_id, date, start_time, end_time, finalType).run()

  return c.json({ ok: true, id })
})

// PUT /admin/shifts/:id — update an existing shift (admin only)
app.put('/admin/shifts/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { user_id, date, start_time, end_time, shift_type } = body || {}

  // Validation (same as POST)
  if (!user_id) return c.json({ error: 'user_id is required' }, 400)
  if (!validateDateStr(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400)
  if (!validateTimeStr(start_time)) return c.json({ error: 'start_time must be HH:MM' }, 400)
  if (!validateTimeStr(end_time)) return c.json({ error: 'end_time must be HH:MM' }, 400)
  if (timeStrToMin(start_time) >= timeStrToMin(end_time)) {
    return c.json({ error: 'end_time must be after start_time' }, 400)
  }
  const finalType = shift_type && SHIFT_TYPES.includes(shift_type) ? shift_type : 'Custom'

  const existing = await c.env.DB.prepare('SELECT id FROM shifts WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Shift not found' }, 404)

  const swinger = await c.env.DB.prepare(
    "SELECT id FROM users WHERE id = ? AND role = 'swinger' AND status = 'active'"
  ).bind(user_id).first()
  if (!swinger) return c.json({ error: 'User not found or not an active swinger' }, 404)

  await c.env.DB.prepare(`
    UPDATE shifts SET user_id = ?, date = ?, start_time = ?, end_time = ?, shift_type = ?,
                      updated_at = datetime('now')
    WHERE id = ?
  `).bind(user_id, date, start_time, end_time, finalType, id).run()

  return c.json({ ok: true })
})

// DELETE /admin/shifts/:id — delete a shift (admin only)
app.delete('/admin/shifts/:id', requireAdmin, async (c) => {
  const id = c.req.param('id')
  const existing = await c.env.DB.prepare('SELECT id FROM shifts WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Shift not found' }, 404)
  await c.env.DB.prepare('DELETE FROM shifts WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// POST /admin/shifts/copy-week — copy all shifts from one week into another (admin only)
// Body: { source_week_start: 'YYYY-MM-DD', target_week_start: 'YYYY-MM-DD' }
//   - Both dates must be a Sunday (week start in this app's grid).
//   - For each shift in [source_week_start, source+6], inserts a clone shifted by
//     the offset between source and target.
//   - SKIPS any (user_id, target_date) pair that already has at least one shift —
//     so re-running the copy never overwrites or duplicates a populated day.
// Returns: { ok: true, created: N, skipped: M }
app.post('/admin/shifts/copy-week', requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { source_week_start, target_week_start } = body || {}

  if (!validateDateStr(source_week_start) || !validateDateStr(target_week_start)) {
    return c.json({ error: 'source_week_start and target_week_start must be YYYY-MM-DD' }, 400)
  }

  // Compute source range (7 days inclusive) and the target offset in days
  const sStart = new Date(source_week_start + 'T12:00:00')
  const tStart = new Date(target_week_start + 'T12:00:00')
  if (Number.isNaN(sStart.getTime()) || Number.isNaN(tStart.getTime())) {
    return c.json({ error: 'Invalid date' }, 400)
  }
  const dayMs = 24 * 60 * 60 * 1000
  const offsetDays = Math.round((tStart - sStart) / dayMs)
  if (offsetDays === 0) {
    return c.json({ error: 'source_week_start and target_week_start cannot be the same day' }, 400)
  }

  const sEnd = new Date(sStart.getTime() + 6 * dayMs)
  const sStartStr = source_week_start
  const sEndStr = sEnd.getFullYear() + '-' +
    String(sEnd.getMonth() + 1).padStart(2, '0') + '-' +
    String(sEnd.getDate()).padStart(2, '0')

  // Pull source shifts
  const source = await c.env.DB.prepare(`
    SELECT user_id, date, start_time, end_time, shift_type
    FROM shifts
    WHERE date >= ? AND date <= ?
  `).bind(sStartStr, sEndStr).all()

  const sourceShifts = source.results || []
  if (sourceShifts.length === 0) {
    return c.json({ ok: true, created: 0, skipped: 0 })
  }

  // Compute target dates and the set of (user_id, target_date) pairs we'd touch
  const targets = sourceShifts.map(s => {
    const sd = new Date(s.date + 'T12:00:00')
    const td = new Date(sd.getTime() + offsetDays * dayMs)
    const tdStr = td.getFullYear() + '-' +
      String(td.getMonth() + 1).padStart(2, '0') + '-' +
      String(td.getDate()).padStart(2, '0')
    return { ...s, target_date: tdStr }
  })

  // Find existing shifts in the target week for any of those user-day pairs
  const tStartStr = target_week_start
  const tEnd = new Date(tStart.getTime() + 6 * dayMs)
  const tEndStr = tEnd.getFullYear() + '-' +
    String(tEnd.getMonth() + 1).padStart(2, '0') + '-' +
    String(tEnd.getDate()).padStart(2, '0')

  const existing = await c.env.DB.prepare(`
    SELECT user_id, date FROM shifts
    WHERE date >= ? AND date <= ?
  `).bind(tStartStr, tEndStr).all()

  const taken = new Set()
  for (const r of (existing.results || [])) {
    taken.add(r.user_id + '|' + r.date)
  }

  // Insert clones, skipping anything already populated
  let created = 0
  let skipped = 0
  for (const t of targets) {
    const key = t.user_id + '|' + t.target_date
    if (taken.has(key)) {
      skipped += 1
      continue
    }
    const id = 'shift_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    await c.env.DB.prepare(`
      INSERT INTO shifts (id, user_id, date, start_time, end_time, shift_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, t.user_id, t.target_date, t.start_time, t.end_time, t.shift_type).run()
    // Mark this pair so multiple source shifts on the same day still each get inserted
    // (we only want to skip if a pre-existing shift was already there)
    created += 1
  }

  return c.json({ ok: true, created, skipped })
})

// GET /admin/shifts/metrics?start=YYYY-MM-DD&end=YYYY-MM-DD
// Returns aggregated hours/shifts per swinger over the date range.
// Admin only — swingers no longer see team-wide metrics on their personal schedule.
app.get('/admin/shifts/metrics', requireAdmin, async (c) => {
  const start = c.req.query('start')
  const end = c.req.query('end')
  if (!validateDateStr(start) || !validateDateStr(end)) {
    return c.json({ error: 'Invalid start or end date (expected YYYY-MM-DD)' }, 400)
  }

  // Pull shifts in range with names. Aggregation is small enough to do in JS for clarity.
  const result = await c.env.DB.prepare(`
    SELECT s.user_id, s.date, s.start_time, s.end_time, s.shift_type,
           u.full_name as swinger_name
    FROM shifts s
    JOIN users u ON s.user_id = u.id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY u.full_name ASC, s.date ASC
  `).bind(start, end).all()

  const byUser = {}
  for (const r of result.results) {
    if (!byUser[r.user_id]) {
      byUser[r.user_id] = {
        user_id: r.user_id,
        full_name: r.swinger_name,
        shifts: 0,
        total_hours: 0,
        saturdays: 0,
        sundays: 0,
        by_type: { Morning: 0, Mid: 0, Day: 0, Evening: 0, Night: 0, 'All Day': 0, Custom: 0 },
      }
    }
    const m = byUser[r.user_id]
    const hrs = Math.max(0, (timeStrToMin(r.end_time) - timeStrToMin(r.start_time)) / 60)
    m.shifts += 1
    m.total_hours += hrs
    if (r.shift_type in m.by_type) m.by_type[r.shift_type] += 1
    // Day-of-week from date string — use noon to dodge UTC shift
    const dow = new Date(r.date + 'T12:00:00').getDay()
    if (dow === 6) m.saturdays += 1
    if (dow === 0) m.sundays += 1
  }

  return c.json({ metrics: Object.values(byUser) })
})

// ─── TOURNAMENTS (Admin only) ────────────────────────────────────────────────
//
// Module: Monday League / FedEx tracking. Admin-only.
//
// Schema:
//   tournament_leagues   — top-level container (e.g. "Monday League").
//   tournament_teams     — fixed pairings within a league. Stores player1 +
//                          player2 (individuals, used for CTP picking) plus
//                          a denormalized name (defaults to "P1 & P2" but
//                          can be a custom team name like "Cobra Kai").
//   tournament_seasons   — a competition window (default 4 weeks).
//   tournament_results   — one row per (season, team, week_number) with a
//                          placement 1..6. NULL placement = team didn't
//                          compete that week (worth 0 pts).
//   tournament_weeks     — per-week metadata (course played, CTP hole, CTP
//                          winner). One row per (season, week_number),
//                          created lazily on first edit.
//
// Points are derived in code from placement (see lib/tournamentPoints.js) and
// never stored on the row, so changing the points table never requires a
// backfill. Standings are computed in the GET handler and returned alongside
// the raw cells, so the frontend only needs ONE fetch per tab navigation.
//
// Idempotent UPSERT pattern for results: PUT /admin/tournaments/seasons/:id/results
// takes (team_id, week_number, placement) and either inserts a new row or
// replaces the existing placement. Placement = null → DELETEs the cell so the
// table stays sparse (matches the "didn't compete" state cleanly).
//
// Max 6 teams per league (see MAX_TEAMS_PER_LEAGUE). Enforced at create time.
// Placement uniqueness per (season, week) is enforced server-side.

// GET /admin/tournaments — overview (list of leagues with team/season counts)
app.get('/admin/tournaments', requireAdmin, async (c) => {
  const leagues = await c.env.DB.prepare(`
    SELECT l.id, l.name, l.night_of_week, l.status, l.created_at,
           (SELECT COUNT(*) FROM tournament_teams t WHERE t.league_id = l.id AND t.active = 1) AS team_count,
           (SELECT COUNT(*) FROM tournament_seasons s WHERE s.league_id = l.id) AS season_count
    FROM tournament_leagues l
    ORDER BY l.created_at ASC
  `).all()
  return c.json({ leagues: leagues.results })
})

// POST /admin/tournaments/leagues — create league
app.post('/admin/tournaments/leagues', requireAdmin, async (c) => {
  const body = await c.req.json()
  const name = (body.name || '').trim()
  if (!name) return c.json({ error: 'Name is required' }, 400)
  const night = Number.isInteger(body.night_of_week) ? body.night_of_week : 1
  if (night < 0 || night > 6) return c.json({ error: 'night_of_week must be 0..6' }, 400)

  const id = 'tlg_' + uid()
  await c.env.DB.prepare(`
    INSERT INTO tournament_leagues (id, name, night_of_week, status)
    VALUES (?, ?, ?, 'active')
  `).bind(id, name, night).run()

  return c.json({ ok: true, id })
})

// PUT /admin/tournaments/leagues/:id — rename / change night / archive
app.put('/admin/tournaments/leagues/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()
  const league = await c.env.DB.prepare('SELECT * FROM tournament_leagues WHERE id = ?').bind(id).first()
  if (!league) return c.json({ error: 'League not found' }, 404)

  const name = body.name === undefined ? league.name : (body.name || '').trim()
  if (!name) return c.json({ error: 'Name cannot be empty' }, 400)
  const night = body.night_of_week === undefined ? league.night_of_week : body.night_of_week
  if (!Number.isInteger(night) || night < 0 || night > 6) {
    return c.json({ error: 'night_of_week must be 0..6' }, 400)
  }
  const status = body.status === undefined ? league.status : body.status
  if (!['active', 'archived'].includes(status)) {
    return c.json({ error: 'status must be active or archived' }, 400)
  }

  await c.env.DB.prepare(`
    UPDATE tournament_leagues SET name = ?, night_of_week = ?, status = ? WHERE id = ?
  `).bind(name, night, status, id).run()
  return c.json({ ok: true })
})

// DELETE /admin/tournaments/leagues/:id — delete league + all dependent rows
app.delete('/admin/tournaments/leagues/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const league = await c.env.DB.prepare('SELECT id FROM tournament_leagues WHERE id = ?').bind(id).first()
  if (!league) return c.json({ error: 'League not found' }, 404)

  // Manual cascade (D1 doesn't enforce FK CASCADE by default in this schema).
  // Order: weeks → results → seasons → teams → league.
  await c.env.DB.prepare(`
    DELETE FROM tournament_weeks
    WHERE season_id IN (SELECT id FROM tournament_seasons WHERE league_id = ?)
  `).bind(id).run()
  await c.env.DB.prepare(`
    DELETE FROM tournament_results
    WHERE season_id IN (SELECT id FROM tournament_seasons WHERE league_id = ?)
  `).bind(id).run()
  await c.env.DB.prepare('DELETE FROM tournament_seasons WHERE league_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM tournament_teams WHERE league_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM tournament_leagues WHERE id = ?').bind(id).run()

  return c.json({ ok: true })
})

// GET /admin/tournaments/leagues/:id — full league payload (teams + seasons + fedex)
app.get('/admin/tournaments/leagues/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const league = await c.env.DB.prepare('SELECT * FROM tournament_leagues WHERE id = ?').bind(id).first()
  if (!league) return c.json({ error: 'League not found' }, 404)

  const teams = await c.env.DB.prepare(`
    SELECT id, league_id, name, player1, player2, active, created_at
    FROM tournament_teams WHERE league_id = ? ORDER BY created_at ASC
  `).bind(id).all()

  const seasons = await c.env.DB.prepare(`
    SELECT id, league_id, name, season_number, weeks, status, started_at, created_at
    FROM tournament_seasons WHERE league_id = ? ORDER BY season_number ASC
  `).bind(id).all()

  // Pull every result row for every season in this league in one query.
  const results = await c.env.DB.prepare(`
    SELECT r.season_id, r.team_id, r.week_number, r.placement
    FROM tournament_results r
    JOIN tournament_seasons s ON r.season_id = s.id
    WHERE s.league_id = ?
  `).bind(id).all()

  const fedex = computeFedexStandings(teams.results, seasons.results, results.results)

  return c.json({
    league,
    teams: teams.results,
    seasons: seasons.results,
    fedex,
  })
})

// POST /admin/tournaments/leagues/:id/teams — create team in a league
app.post('/admin/tournaments/leagues/:id/teams', requireAdmin, async (c) => {
  const { id: leagueId } = c.req.param()
  const body = await c.req.json()
  const player1 = (body.player1 || '').trim() || null
  const player2 = (body.player2 || '').trim() || null
  // If caller didn't pass a `name`, auto-compose from the players. If neither
  // a name nor any players were provided, reject — we need *something* to
  // display.
  const composed = composeTeamName(player1, player2)
  const name = (body.name || '').trim() || composed
  if (!name) return c.json({ error: 'Provide a team name or at least one player' }, 400)

  const league = await c.env.DB.prepare('SELECT id FROM tournament_leagues WHERE id = ?').bind(leagueId).first()
  if (!league) return c.json({ error: 'League not found' }, 404)

  // Enforce 6-team max per league (active teams only).
  const activeCountRow = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM tournament_teams WHERE league_id = ? AND active = 1'
  ).bind(leagueId).first()
  if ((activeCountRow?.n || 0) >= MAX_TEAMS_PER_LEAGUE) {
    return c.json({ error: `Max ${MAX_TEAMS_PER_LEAGUE} active teams per league` }, 400)
  }

  // Case-insensitive uniqueness check within the league.
  const dup = await c.env.DB.prepare(
    'SELECT id FROM tournament_teams WHERE league_id = ? AND LOWER(name) = LOWER(?) AND active = 1'
  ).bind(leagueId, name).first()
  if (dup) return c.json({ error: 'A team with this name already exists in this league' }, 400)

  const id = 'tt_' + uid()
  await c.env.DB.prepare(`
    INSERT INTO tournament_teams (id, league_id, name, player1, player2, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).bind(id, leagueId, name, player1, player2).run()

  return c.json({ ok: true, id })
})

// PUT /admin/tournaments/teams/:id — rename / archive
app.put('/admin/tournaments/teams/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()
  const team = await c.env.DB.prepare('SELECT * FROM tournament_teams WHERE id = ?').bind(id).first()
  if (!team) return c.json({ error: 'Team not found' }, 404)

  // Player edits.
  const player1 = body.player1 === undefined ? team.player1 : ((body.player1 || '').trim() || null)
  const player2 = body.player2 === undefined ? team.player2 : ((body.player2 || '').trim() || null)

  // Name resolution: if caller passed a `name`, use it. Otherwise, if either
  // player field changed, recompose; else keep the current name.
  let name
  if (body.name !== undefined) {
    name = (body.name || '').trim()
  } else if (body.player1 !== undefined || body.player2 !== undefined) {
    name = composeTeamName(player1, player2) || team.name
  } else {
    name = team.name
  }
  if (!name) return c.json({ error: 'Name cannot be empty' }, 400)

  const active = body.active === undefined ? team.active : (body.active ? 1 : 0)

  // Re-check uniqueness if name is changing (case-insensitive, only against active teams).
  if (name.toLowerCase() !== (team.name || '').toLowerCase()) {
    const dup = await c.env.DB.prepare(
      'SELECT id FROM tournament_teams WHERE league_id = ? AND LOWER(name) = LOWER(?) AND active = 1 AND id != ?'
    ).bind(team.league_id, name, id).first()
    if (dup) return c.json({ error: 'A team with this name already exists in this league' }, 400)
  }

  await c.env.DB.prepare(`
    UPDATE tournament_teams
    SET name = ?, player1 = ?, player2 = ?, active = ?
    WHERE id = ?
  `).bind(name, player1, player2, active, id).run()
  return c.json({ ok: true })
})

// DELETE /admin/tournaments/teams/:id — hard delete (with results + CTP refs)
app.delete('/admin/tournaments/teams/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const team = await c.env.DB.prepare('SELECT id FROM tournament_teams WHERE id = ?').bind(id).first()
  if (!team) return c.json({ error: 'Team not found' }, 404)

  // Null-out CTP winner pointers in any week metadata that referenced this
  // team so we don't leave dangling references.
  await c.env.DB.prepare(
    'UPDATE tournament_weeks SET ctp_winner_team_id = NULL, ctp_winner_slot = NULL WHERE ctp_winner_team_id = ?'
  ).bind(id).run()
  await c.env.DB.prepare('DELETE FROM tournament_results WHERE team_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM tournament_teams WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// POST /admin/tournaments/leagues/:id/seasons — create season
app.post('/admin/tournaments/leagues/:id/seasons', requireAdmin, async (c) => {
  const { id: leagueId } = c.req.param()
  const body = await c.req.json()
  const league = await c.env.DB.prepare('SELECT id FROM tournament_leagues WHERE id = ?').bind(leagueId).first()
  if (!league) return c.json({ error: 'League not found' }, 404)

  const maxRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(season_number), 0) AS max_n FROM tournament_seasons WHERE league_id = ?'
  ).bind(leagueId).first()
  const nextNumber = (maxRow?.max_n || 0) + 1

  const name = (body.name || `Season ${nextNumber}`).trim()
  const weeks = Number.isInteger(body.weeks) && body.weeks > 0 && body.weeks <= 52
    ? body.weeks
    : DEFAULT_SEASON_WEEKS
  const startedAt = (body.started_at && /^\d{4}-\d{2}-\d{2}$/.test(body.started_at))
    ? body.started_at
    : null

  const id = 'tsn_' + uid()
  await c.env.DB.prepare(`
    INSERT INTO tournament_seasons (id, league_id, name, season_number, weeks, status, started_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).bind(id, leagueId, name, nextNumber, weeks, startedAt).run()

  return c.json({ ok: true, id, season_number: nextNumber })
})

// PUT /admin/tournaments/seasons/:id — rename / change weeks / change status
app.put('/admin/tournaments/seasons/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()
  const season = await c.env.DB.prepare('SELECT * FROM tournament_seasons WHERE id = ?').bind(id).first()
  if (!season) return c.json({ error: 'Season not found' }, 404)

  const name = body.name === undefined ? season.name : (body.name || '').trim()
  if (!name) return c.json({ error: 'Name cannot be empty' }, 400)
  const weeks = body.weeks === undefined ? season.weeks : Number(body.weeks)
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
    return c.json({ error: 'weeks must be 1..52' }, 400)
  }
  const status = body.status === undefined ? season.status : body.status
  if (!['active', 'completed', 'archived'].includes(status)) {
    return c.json({ error: 'status must be active, completed, or archived' }, 400)
  }
  const startedAt = body.started_at === undefined
    ? season.started_at
    : (body.started_at && /^\d{4}-\d{2}-\d{2}$/.test(body.started_at) ? body.started_at : null)

  // If shrinking weeks, prune any results AND week metadata past the new last
  // week so totals don't include orphaned cells. We surface this as a soft
  // warning in the UI before submitting.
  if (weeks < season.weeks) {
    await c.env.DB.prepare(
      'DELETE FROM tournament_results WHERE season_id = ? AND week_number > ?'
    ).bind(id, weeks).run()
    await c.env.DB.prepare(
      'DELETE FROM tournament_weeks WHERE season_id = ? AND week_number > ?'
    ).bind(id, weeks).run()
  }

  await c.env.DB.prepare(`
    UPDATE tournament_seasons SET name = ?, weeks = ?, status = ?, started_at = ? WHERE id = ?
  `).bind(name, weeks, status, startedAt, id).run()
  return c.json({ ok: true })
})

// DELETE /admin/tournaments/seasons/:id — delete season + its results + weeks
app.delete('/admin/tournaments/seasons/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const season = await c.env.DB.prepare('SELECT id FROM tournament_seasons WHERE id = ?').bind(id).first()
  if (!season) return c.json({ error: 'Season not found' }, 404)

  await c.env.DB.prepare('DELETE FROM tournament_weeks WHERE season_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM tournament_results WHERE season_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM tournament_seasons WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// GET /admin/tournaments/seasons/:id — full season payload (results grid + standings + week meta)
//
// Returns:
//   - season row
//   - league row (for breadcrumb)
//   - teams (active + any team that has results in this season, even if archived)
//   - results: array of { team_id, week_number, placement }
//   - week_meta: array of week metadata rows (course, nine, ctp_*)
//   - standings: derived [{ team_id, name, week_points, total, rank }]
app.get('/admin/tournaments/seasons/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const season = await c.env.DB.prepare('SELECT * FROM tournament_seasons WHERE id = ?').bind(id).first()
  if (!season) return c.json({ error: 'Season not found' }, 404)
  const league = await c.env.DB.prepare(
    'SELECT id, name, night_of_week, status FROM tournament_leagues WHERE id = ?'
  ).bind(season.league_id).first()

  // Teams = all currently-active teams in the league + any team referenced by
  // a result in this season (so deleted/archived teams that have history
  // don't disappear from the grid).
  const teams = await c.env.DB.prepare(`
    SELECT id, league_id, name, player1, player2, active, created_at
    FROM tournament_teams
    WHERE league_id = ? AND (
      active = 1
      OR id IN (SELECT DISTINCT team_id FROM tournament_results WHERE season_id = ?)
    )
    ORDER BY created_at ASC
  `).bind(season.league_id, id).all()

  const results = await c.env.DB.prepare(`
    SELECT team_id, week_number, placement
    FROM tournament_results WHERE season_id = ?
  `).bind(id).all()

  const weekMeta = await c.env.DB.prepare(`
    SELECT week_number, course_name, nine, ctp_hole, ctp_winner_team_id, ctp_winner_slot
    FROM tournament_weeks WHERE season_id = ? ORDER BY week_number ASC
  `).bind(id).all()

  const standings = computeSeasonStandings(teams.results, results.results, season.weeks)

  return c.json({
    season,
    league,
    teams: teams.results,
    results: results.results,
    week_meta: weekMeta.results,
    standings,
  })
})

// PUT /admin/tournaments/seasons/:id/results — upsert a single (team, week) cell
app.put('/admin/tournaments/seasons/:id/results', requireAdmin, async (c) => {
  const { id: seasonId } = c.req.param()
  const body = await c.req.json()
  const teamId = body.team_id
  const week = Number(body.week_number)
  const placementCheck = normalizePlacement(body.placement)
  if (!placementCheck.ok) return c.json({ error: 'placement must be 1..6 or null' }, 400)
  const placement = placementCheck.value

  if (!teamId) return c.json({ error: 'team_id is required' }, 400)
  if (!Number.isInteger(week) || week < 1) return c.json({ error: 'week_number must be a positive integer' }, 400)

  const season = await c.env.DB.prepare('SELECT * FROM tournament_seasons WHERE id = ?').bind(seasonId).first()
  if (!season) return c.json({ error: 'Season not found' }, 404)
  if (week > season.weeks) {
    return c.json({ error: `week_number must be 1..${season.weeks} for this season` }, 400)
  }

  const team = await c.env.DB.prepare(
    'SELECT id FROM tournament_teams WHERE id = ? AND league_id = ?'
  ).bind(teamId, season.league_id).first()
  if (!team) return c.json({ error: 'Team not found in this league' }, 404)

  // Clear cell.
  if (placement === null) {
    await c.env.DB.prepare(
      'DELETE FROM tournament_results WHERE season_id = ? AND team_id = ? AND week_number = ?'
    ).bind(seasonId, teamId, week).run()
  } else {
    // If another team holds this placement this week, clear theirs.
    await c.env.DB.prepare(`
      DELETE FROM tournament_results
      WHERE season_id = ? AND week_number = ? AND placement = ? AND team_id != ?
    `).bind(seasonId, week, placement, teamId).run()

    // Upsert.
    await c.env.DB.prepare(`
      INSERT INTO tournament_results (id, season_id, team_id, week_number, placement)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(season_id, team_id, week_number)
      DO UPDATE SET placement = excluded.placement
    `).bind('tr_' + uid(), seasonId, teamId, week, placement).run()
  }

  // Recompute and return fresh standings + the full results grid + week meta.
  const teams = await c.env.DB.prepare(`
    SELECT id, league_id, name, player1, player2, active, created_at
    FROM tournament_teams
    WHERE league_id = ? AND (
      active = 1
      OR id IN (SELECT DISTINCT team_id FROM tournament_results WHERE season_id = ?)
    )
    ORDER BY created_at ASC
  `).bind(season.league_id, seasonId).all()
  const results = await c.env.DB.prepare(`
    SELECT team_id, week_number, placement FROM tournament_results WHERE season_id = ?
  `).bind(seasonId).all()
  const standings = computeSeasonStandings(teams.results, results.results, season.weeks)

  return c.json({ ok: true, results: results.results, standings })
})

// PUT /admin/tournaments/seasons/:id/weeks/:week — upsert week metadata
//
// Body (any subset; only fields explicitly present are written):
//   { course_name, nine, ctp_hole, ctp_winner_team_id, ctp_winner_slot }
//
// Pass an empty string or null to a field to clear it. CTP winner: pass
// (team_id, slot). To clear the CTP winner, pass team_id = null.
//
// Note: ctp_winner_team_id is foreign-keyed, so the team must exist and
// belong to this league.
app.put('/admin/tournaments/seasons/:id/weeks/:week', requireAdmin, async (c) => {
  const { id: seasonId, week: weekParam } = c.req.param()
  const week = Number(weekParam)
  const body = await c.req.json()

  const season = await c.env.DB.prepare('SELECT * FROM tournament_seasons WHERE id = ?').bind(seasonId).first()
  if (!season) return c.json({ error: 'Season not found' }, 404)
  if (!Number.isInteger(week) || week < 1 || week > season.weeks) {
    return c.json({ error: `week must be 1..${season.weeks} for this season` }, 400)
  }

  // Pull existing row (if any) so we can patch only the fields the caller sent.
  const existing = await c.env.DB.prepare(
    'SELECT * FROM tournament_weeks WHERE season_id = ? AND week_number = ?'
  ).bind(seasonId, week).first()

  // Validate + resolve each field: undefined = leave alone, null/'' = clear,
  // otherwise validate.
  let courseName = existing?.course_name ?? null
  if (body.course_name !== undefined) {
    if (body.course_name === null || body.course_name === '') courseName = null
    else courseName = String(body.course_name).trim().slice(0, 200) || null
  }

  let nine = existing?.nine ?? null
  if (body.nine !== undefined) {
    const r = normalizeNine(body.nine)
    if (!r.ok) return c.json({ error: "nine must be 'front' or 'back'" }, 400)
    nine = r.value
  }

  let ctpHole = existing?.ctp_hole ?? null
  if (body.ctp_hole !== undefined) {
    const r = normalizeHole(body.ctp_hole)
    if (!r.ok) return c.json({ error: 'ctp_hole must be 1..18 or null' }, 400)
    ctpHole = r.value
  }

  let ctpTeamId = existing?.ctp_winner_team_id ?? null
  let ctpSlot = existing?.ctp_winner_slot ?? null
  if (body.ctp_winner_team_id !== undefined) {
    if (body.ctp_winner_team_id === null || body.ctp_winner_team_id === '') {
      ctpTeamId = null
      ctpSlot = null
    } else {
      const t = await c.env.DB.prepare(
        'SELECT id FROM tournament_teams WHERE id = ? AND league_id = ?'
      ).bind(body.ctp_winner_team_id, season.league_id).first()
      if (!t) return c.json({ error: 'CTP winner team not found in this league' }, 404)
      ctpTeamId = body.ctp_winner_team_id
    }
  }
  if (body.ctp_winner_slot !== undefined) {
    const r = normalizeSlot(body.ctp_winner_slot)
    if (!r.ok) return c.json({ error: "ctp_winner_slot must be 'player1' or 'player2'" }, 400)
    ctpSlot = r.value
  }
  // If we have a team but no slot, that's an inconsistency — reject so we
  // don't silently store a half-set winner.
  if (ctpTeamId && !ctpSlot) {
    return c.json({ error: 'ctp_winner_slot is required when ctp_winner_team_id is set' }, 400)
  }
  // If slot but no team, normalize to "no winner" (slot alone is meaningless).
  if (!ctpTeamId) ctpSlot = null

  if (existing) {
    await c.env.DB.prepare(`
      UPDATE tournament_weeks
      SET course_name = ?, nine = ?, ctp_hole = ?,
          ctp_winner_team_id = ?, ctp_winner_slot = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(courseName, nine, ctpHole, ctpTeamId, ctpSlot, existing.id).run()
  } else {
    await c.env.DB.prepare(`
      INSERT INTO tournament_weeks
        (id, season_id, week_number, course_name, nine, ctp_hole, ctp_winner_team_id, ctp_winner_slot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind('tw_' + uid(), seasonId, week, courseName, nine, ctpHole, ctpTeamId, ctpSlot).run()
  }

  // Return the freshly-written week + the full week_meta array so the page
  // can splice in without an extra fetch.
  const weekMeta = await c.env.DB.prepare(`
    SELECT week_number, course_name, nine, ctp_hole, ctp_winner_team_id, ctp_winner_slot
    FROM tournament_weeks WHERE season_id = ? ORDER BY week_number ASC
  `).bind(seasonId).all()

  return c.json({ ok: true, week_meta: weekMeta.results })
})

// ─── Tournament helpers (computed in worker, not stored) ─────────────────────

// Compute per-team season standings from raw result rows.
function computeSeasonStandings(teams, results, weeks) {
  const byTeam = {}
  for (const t of teams) {
    byTeam[t.id] = {
      team_id: t.id,
      name: t.name,
      week_points: new Array(weeks).fill(0),
      total: 0,
      rank: 0,
    }
  }
  for (const r of results) {
    const row = byTeam[r.team_id]
    if (!row) continue
    if (r.week_number < 1 || r.week_number > weeks) continue
    const pts = leaguePointsForPlacement(r.placement)
    row.week_points[r.week_number - 1] = pts
    row.total += pts
  }
  const arr = Object.values(byTeam)
  arr.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  let lastTotal = null
  let lastRank = 0
  arr.forEach((row, i) => {
    if (row.total !== lastTotal) {
      lastRank = i + 1
      lastTotal = row.total
    }
    row.rank = lastRank
  })
  return arr
}

// Compute FedEx all-time standings across every season in a league.
function computeFedexStandings(teams, seasons, results) {
  const seasonOrder = seasons.map(s => s.id)
  const seasonIndex = Object.fromEntries(seasonOrder.map((sid, i) => [sid, i]))

  const byTeam = {}
  for (const t of teams) {
    byTeam[t.id] = {
      team_id: t.id,
      name: t.name,
      active: t.active,
      season_points: new Array(seasonOrder.length).fill(0),
      total: 0,
      rank: 0,
    }
  }
  for (const r of results) {
    const row = byTeam[r.team_id]
    if (!row) continue
    const idx = seasonIndex[r.season_id]
    if (idx === undefined) continue
    const pts = fedexPointsForPlacement(r.placement)
    row.season_points[idx] += pts
    row.total += pts
  }
  const arr = Object.values(byTeam)
  arr.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  let lastTotal = null
  let lastRank = 0
  arr.forEach((row, i) => {
    if (row.total !== lastTotal) {
      lastRank = i + 1
      lastTotal = row.total
    }
    row.rank = lastRank
  })
  return arr
}

// ─── CRON HANDLERS ────────────────────────────────────────────────────────────
export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    if (event.cron === '0 15 * * SUN') {
      ctx.waitUntil(generateSessions(env))
    }
    if (event.cron === '0 15 * * *') {
      ctx.waitUntil(sendReminders(env))
    }
  }
}

async function generateSessionsForProgram(program, env) {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

  // Only bail out if program has fully ended (today is past end_date).
  // Programs with future start_dates SHOULD still generate sessions for those future dates.
  if (program.end_date && todayStr > program.end_date) return 0

  const days = (program.session_days || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean)
  if (days.length === 0) return 0

  // Generate further ahead than the booking window so sessions exist before they're visible.
  // For programs with a future start_date, also extend weeksAhead so we cover the full window.
  let weeksAhead = Math.max(program.forward_view_weeks || 2, 8)
  if (program.start_date && program.start_date > todayStr) {
    const startMs = new Date(program.start_date + 'T00:00:00').getTime()
    const todayMs = new Date(todayStr + 'T00:00:00').getTime()
    const daysUntilStart = Math.ceil((startMs - todayMs) / (1000 * 60 * 60 * 24))
    const weeksUntilStart = Math.ceil(daysUntilStart / 7)
    // Cover the days until start, plus 8 weeks of running sessions, plus the booking window
    weeksAhead = Math.max(weeksAhead, weeksUntilStart + 8)
  }

  let count = 0

  for (let w = 0; w <= weeksAhead; w++) {
    for (const dayName of days) {
      const targetDayIndex = dayNames.indexOf(dayName)
      if (targetDayIndex === -1) continue

      const date = new Date(today)
      const currentDay = date.getDay()
      let diff = targetDayIndex - currentDay + (w * 7)
      if (diff < 0) diff += 7
      date.setDate(today.getDate() + diff)
      const dateStr = date.toISOString().split('T')[0]

      if (program.start_date && dateStr < program.start_date) continue
      if (program.end_date && dateStr > program.end_date) continue

      const existing = await env.DB.prepare(
        'SELECT id FROM sessions WHERE program_id = ? AND date = ?'
      ).bind(program.id, dateStr).first()
      if (existing) continue

      const id = 'sess_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20)
      await env.DB.prepare(`
        INSERT INTO sessions (id, program_id, instructor_id, date, day_of_week, start_time, end_time, capacity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, program.id, program.default_instructor_id || null, dateStr, dayName, program.start_time, program.end_time, program.default_capacity).run()

      // Also auto-add to session_instructors join table for consistency
      if (program.default_instructor_id) {
        const siId = 'si_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20)
        try {
          await env.DB.prepare(
            'INSERT INTO session_instructors (id, session_id, instructor_id) VALUES (?, ?, ?)'
          ).bind(siId, id, program.default_instructor_id).run()
        } catch (e) {
          // Ignore duplicate constraint errors
        }
      }
      count++
    }
  }
  return count
}

async function generateSessions(env) {
  const programs = await env.DB.prepare(
    'SELECT * FROM programs WHERE is_active = 1 AND forward_view_enabled = 1'
  ).all()
  for (const program of programs.results) {
    await generateSessionsForProgram(program, env)
  }
}

async function sendReminders(env) {
  // Find all sessions happening tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const sessions = await env.DB.prepare(`
    SELECT s.*, p.name as program_name, p.booker_type,
      u2.full_name as instructor_name
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u2 ON i.user_id = u2.id
    WHERE s.date = ? AND s.is_cancelled = 0
  `).bind(tomorrowStr).all()

  for (const session of sessions.results) {
    const bookings = await env.DB.prepare(`
      SELECT b.*, u.email, u.full_name, u.role, ch.first_name as child_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      LEFT JOIN children ch ON b.child_id = ch.id
      WHERE b.session_id = ? AND b.status = 'confirmed'
    `).bind(session.id).all()

    for (const booking of bookings.results) {
      try {
        const { subject, html } = reminderEmail({
          recipientName: booking.full_name,
          programName: session.program_name,
          date: session.date,
          startTime: session.start_time,
          endTime: session.end_time,
          bay: session.bay,
          instructorName: session.instructor_name,
          bookerType: booking.role,
          childName: booking.child_name,
        })
        await sendEmail(env, { to: booking.email, subject, html })
      } catch (e) {
        console.error('Reminder email failed for', booking.email, e.message)
      }
    }
  }
}
