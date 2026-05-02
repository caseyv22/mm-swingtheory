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

// POST /auth/forgot-password — public, triggers Clerk password reset email
app.post('/auth/forgot-password', async (c) => {
  const { email } = await c.req.json()
  if (!email) return c.json({ error: 'Email is required' }, 400)

  // Look up user in Clerk by email
  const lookupRes = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { 'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}` } }
  )
  if (!lookupRes.ok) {
    // Don't reveal whether the email exists — return success either way
    return c.json({ ok: true })
  }
  const users = await lookupRes.json()
  if (!Array.isArray(users) || users.length === 0) {
    return c.json({ ok: true })
  }

  const clerkUserId = users[0].id

  // Generate password reset link
  const resetRes = await fetch(
    `https://api.clerk.com/v1/users/${clerkUserId}/password_reset_links`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  )

  if (!resetRes.ok) {
    console.error('Reset link generation failed')
    return c.json({ ok: true })
  }

  const resetData = await resetRes.json()
  const resetUrl = resetData.url

  // Look up user in D1 for full name
  const dbUser = await c.env.DB.prepare(
    'SELECT full_name FROM users WHERE clerk_id = ?'
  ).bind(clerkUserId).first()

  // Send password reset email via our own template
  try {
    const { subject, html } = passwordResetEmail({
      recipientName: dbUser?.full_name || 'there',
      resetUrl,
    })
    await sendEmail(c.env, { to: email, subject, html })
  } catch (e) {
    console.error('Password reset email failed:', e.message)
  }

  return c.json({ ok: true })
})

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

  // If session was just cancelled, email all booked users
  if (body.is_cancelled === 1 && !session.is_cancelled) {
    try {
      const bookedUsers = await c.env.DB.prepare(`
        SELECT b.*, u.email, u.full_name, u.role, ch.first_name as child_name
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        LEFT JOIN children ch ON b.child_id = ch.id
        WHERE b.session_id = ? AND b.status = 'confirmed'
      `).bind(id).all()
      const prog = await c.env.DB.prepare('SELECT name FROM programs WHERE id = ?').bind(session.program_id).first()
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

// POST /admin/bookings — manual booking bypasses all rules
app.post('/admin/bookings', requireAdminOrSwinger, async (c) => {
  const { session_id, user_id } = await c.req.json()

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user_id).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  let child_id = null
  if (user.role === 'parent') {
    const child = await c.env.DB.prepare('SELECT id FROM children WHERE parent_id = ?').bind(user_id).first()
    if (child) child_id = child.id
  }

  const id = 'bkg_' + uid()
  try {
    await c.env.DB.prepare(
      'INSERT INTO bookings (id, session_id, user_id, child_id, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, session_id, user_id, child_id, 'confirmed').run()
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: 'Already booked' }, 400)
    throw e
  }

  return c.json({ ok: true, booking_id: id })
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
      i.id as instructor_record_id, i.bio as instructor_bio
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
  const { full_name, email, role, phone, child_first_name, child_age } = body

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

  // Create child record if parent
  if (role === 'parent' && child_first_name) {
    const childId = 'child_' + uid()
    await c.env.DB.prepare(
      'INSERT INTO children (id, parent_id, first_name, age) VALUES (?, ?, ?, ?)'
    ).bind(childId, userId, child_first_name, child_age || null).run()
  }

  // Create instructors record if instructor
  if (role === 'instructor') {
    const instrId = 'instr_' + uid()
    await c.env.DB.prepare(
      'INSERT INTO instructors (id, user_id) VALUES (?, ?)'
    ).bind(instrId, userId).run()
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
  }

  return c.json({ ok: true, user_id: userId, temp_password: tempPassword })
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
// Deletes user from Clerk + cascades through D1
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

  // Cascade delete — order matters for FK constraints
  const deletes = [
    ['DELETE FROM bookings WHERE user_id = ?', [id]],
    ['DELETE FROM lesson_notes WHERE student_id = ?', [id]],
    ['DELETE FROM lesson_notes WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = ?)', [id]],
    ['DELETE FROM private_lessons WHERE student_id = ?', [id]],
    ['DELETE FROM private_lessons WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = ?)', [id]],
    ['DELETE FROM session_instructors WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = ?)', [id]],
    ['DELETE FROM children WHERE parent_id = ?', [id]],
    ['DELETE FROM student_instructors WHERE student_id = ?', [id]],
    ['DELETE FROM student_instructors WHERE instructor_id IN (SELECT id FROM instructors WHERE user_id = ?)', [id]],
    ['DELETE FROM instructors WHERE user_id = ?', [id]],
    ['DELETE FROM users WHERE id = ?', [id]],
  ]
  for (const [sql, params] of deletes) {
    try {
      await c.env.DB.prepare(sql).bind(...params).run()
    } catch (e) {
      console.error('Delete step failed:', sql, e.message)
    }
  }

  return c.json({ ok: true })
})

// ─── POST /admin/members/:id/reset-password ───────────────────────────────────
// Triggers Clerk password reset email
app.post('/admin/members/:id/reset-password', requireAdmin, async (c) => {
  const { id } = c.req.param()

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  if (!user) return c.json({ error: 'User not found' }, 404)

  if (!user.clerk_id || user.clerk_id.startsWith('pending_')) {
    return c.json({ error: 'User has not completed account setup yet — no Clerk account to reset' }, 400)
  }

  // Clerk: create a password reset link
  const clerkRes = await fetch(`https://api.clerk.com/v1/users/${user.clerk_id}/password_reset_links`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!clerkRes.ok) {
    const err = await clerkRes.json()
    return c.json({ error: 'Clerk password reset failed', detail: err }, 500)
  }

  const data = await clerkRes.json()
  return c.json({ ok: true, reset_link: data.url })
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
    start_date, end_date
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
      start_date, end_date, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).bind(
    id, name, slug, description || null,
    booking_type || 'group', booker_type || 'student',
    session_days || 'tuesday,thursday',
    start_time || '09:00', end_time || '10:00',
    default_capacity || 10, price_display || null,
    show_instructor ? 1 : 0,
    forward_view_weeks || 2, cancellation_hours || 24, max_bookings_per_week || 1,
    start_date || null, end_date || null
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

// PUT /admin/programs/:id
app.put('/admin/programs/:id', requireAdmin, async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()

  const program = await c.env.DB.prepare('SELECT * FROM programs WHERE id = ?').bind(id).first()
  if (!program) return c.json({ error: 'Program not found' }, 404)

  await c.env.DB.prepare(`
    UPDATE programs SET
      name = ?, description = ?, booking_type = ?, booker_type = ?,
      session_days = ?, start_time = ?, end_time = ?, default_capacity = ?,
      price_display = ?, show_instructor = ?, forward_view_weeks = ?,
      forward_view_enabled = ?, cancellation_hours = ?, max_bookings_per_week = ?,
      is_active = ?, start_date = ?, end_date = ?, updated_at = datetime('now')
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
    id
  ).run()

  return c.json({ ok: true })
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
    JOIN users u ON pl.student_id = u.id
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
    INSERT INTO private_lessons (id, instructor_id, student_id, date, start_time, end_time, bay, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(lessonId, instr.id, id, date, start_time, end_time, bay || null, notes || null).run()

  return c.json({ ok: true, lesson_id: lessonId })
})

// PUT /instructor/lessons/:id — edit a private lesson
app.put('/instructor/lessons/:id', requireInstructor, async (c) => {
  const { id } = c.req.param()
  const user = c.get('user')
  const { date, start_time, end_time, bay, notes } = await c.req.json()

  const instr = await c.env.DB.prepare('SELECT id FROM instructors WHERE user_id = ?').bind(user.id).first()
  if (!instr) return c.json({ error: 'Instructor record not found' }, 404)

  const lesson = await c.env.DB.prepare(
    'SELECT * FROM private_lessons WHERE id = ? AND instructor_id = ?'
  ).bind(id, instr.id).first()
  if (!lesson) return c.json({ error: 'Lesson not found' }, 404)

  await c.env.DB.prepare(`
    UPDATE private_lessons SET
      date = ?, start_time = ?, end_time = ?, bay = ?, notes = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(
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
        INSERT INTO sessions (id, program_id, date, day_of_week, start_time, end_time, capacity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, program.id, dateStr, dayName, program.start_time, program.end_time, program.default_capacity).run()
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
