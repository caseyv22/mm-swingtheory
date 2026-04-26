import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { generateSessions } from './crons/generateSessions.js';
import { sendReminders } from './crons/sendReminders.js';
import {
  requireAuth, requireAdmin, requireInstructor
} from './lib/auth.js';
import {
  generateId, getConfig, getUserByClerkId, getUserById,
  getProgram, getProgramBySlug, getSession, getBookingCount,
  getWeekBookingCount, getChildByParentId, getInstructor
} from './lib/db.js';

const app = new Hono();

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use('/*', cors({
  origin: (origin) => {
    if (!origin) return true;
    if (origin === 'http://localhost:5173') return true;
    if (origin.endsWith('.pages.dev')) return true;
    if (origin === 'https://mm.swingtheory.golf') return true;
    if (origin === 'https://lessons.swingtheory.golf') return true;
    return false;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-subdomain'],
}));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ ok: true, service: 'st-platform-api' }));

// ─── Users / Me ───────────────────────────────────────────────────────────────

app.get('/users/me', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);
  if (!dbUser) return c.json({ error: 'User not found' }, 404);

  const children = await c.env.DB.prepare(
    'SELECT * FROM children WHERE parent_id = ? ORDER BY created_at ASC'
  ).bind(dbUser.id).all();

  return c.json({ user: dbUser, children: children.results });
});

app.post('/users/me', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const body = await c.req.json();
  const { full_name, phone, kid_first_name, kid_age } = body;

  const existing = await getUserByClerkId(c.env.DB, user.sub);

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE users SET full_name = ?, phone = ?, updated_at = datetime('now') WHERE clerk_id = ?`
    ).bind(full_name || existing.full_name, phone || existing.phone, user.sub).run();

    if (kid_first_name) {
      const child = await getChildByParentId(c.env.DB, existing.id);
      if (child) {
        await c.env.DB.prepare(
          'UPDATE children SET first_name = ?, age = ? WHERE id = ?'
        ).bind(kid_first_name, kid_age ?? child.age, child.id).run();
      }
    }

    const updated = await getUserByClerkId(c.env.DB, user.sub);
    const children = await c.env.DB.prepare(
      'SELECT * FROM children WHERE parent_id = ? ORDER BY created_at ASC'
    ).bind(updated.id).all();
    return c.json({ user: updated, children: children.results });
  }

  // Create new user
  const userId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO users (id, clerk_id, email, full_name, phone, role, status)
     VALUES (?, ?, ?, ?, ?, 'student', 'active')`
  ).bind(userId, user.sub, user.email || '', full_name || '', phone || '').run();

  let children = [];
  if (kid_first_name) {
    const childId = generateId();
    await c.env.DB.prepare(
      'INSERT INTO children (id, parent_id, first_name, age) VALUES (?, ?, ?, ?)'
    ).bind(childId, userId, kid_first_name, kid_age || null).run();
    children = [{ id: childId, parent_id: userId, first_name: kid_first_name, age: kid_age || null }];
  }

  const newUser = await getUserByClerkId(c.env.DB, user.sub);
  return c.json({ user: newUser, children }, 201);
});

// ─── Programs ─────────────────────────────────────────────────────────────────

app.get('/programs', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const subdomain = c.req.header('x-subdomain') || 'mm';
  const dbUser = await getUserByClerkId(c.env.DB, user.sub);

  const programs = await c.env.DB.prepare(
    'SELECT * FROM programs WHERE is_active = 1 ORDER BY created_at ASC'
  ).all();

  const filtered = programs.results.filter(p => {
    if (subdomain === 'lessons') return p.slug === 'theory-ai';
    return p.slug !== 'theory-ai';
  });

  return c.json({ programs: filtered, user: dbUser });
});

app.get('/programs/:slug', async (c) => {
  const { error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const program = await getProgramBySlug(c.env.DB, c.req.param('slug'));
  if (!program) return c.json({ error: 'Program not found' }, 404);

  return c.json({ program });
});

app.get('/programs/:slug/sessions', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const program = await getProgramBySlug(c.env.DB, c.req.param('slug'));
  if (!program) return c.json({ error: 'Program not found' }, 404);

  if (!program.forward_view_enabled) {
    return c.json({ paused: true, sessions: [] });
  }

  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + program.forward_view_weeks * 7);
  const endDateStr = endDate.toISOString().split('T')[0];

  const sessions = await c.env.DB.prepare(`
    SELECT s.*,
      u.full_name as instructor_name,
      COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as booked_count
    FROM sessions s
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u ON i.user_id = u.id
    LEFT JOIN bookings b ON s.id = b.session_id
    WHERE s.program_id = ?
      AND s.date >= ?
      AND s.date <= ?
      AND s.is_cancelled = 0
    GROUP BY s.id
    ORDER BY s.date ASC, s.start_time ASC
  `).bind(program.id, today, endDateStr).all();

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);

  let myBookings = new Set();
  if (dbUser) {
    const bookings = await c.env.DB.prepare(
      `SELECT session_id FROM bookings WHERE user_id = ? AND status = 'confirmed'`
    ).bind(dbUser.id).all();
    myBookings = new Set(bookings.results.map(b => b.session_id));
  }

  const enriched = sessions.results.map(s => ({
    ...s,
    spots_remaining: s.capacity - s.booked_count,
    is_booked_by_me: myBookings.has(s.id),
    instructor_name: program.show_instructor ? s.instructor_name : null,
  }));

  return c.json({ paused: false, program, sessions: enriched });
});

// ─── Bookings ─────────────────────────────────────────────────────────────────

app.get('/bookings/mine', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);
  if (!dbUser) return c.json({ error: 'User not found' }, 404);

  const bookings = await c.env.DB.prepare(`
    SELECT
      b.id, b.status, b.checked_in, b.checked_in_at, b.booked_at, b.cancelled_at,
      s.id as session_id, s.date, s.start_time, s.end_time,
      s.is_cancelled as session_cancelled, s.bay,
      p.id as program_id, p.name as program_name, p.cancellation_hours, p.slug as program_slug,
      ch.first_name as child_first_name, ch.age as child_age
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN children ch ON b.child_id = ch.id
    WHERE b.user_id = ?
    ORDER BY s.date ASC, s.start_time ASC
  `).bind(dbUser.id).all();

  const today = new Date().toISOString().split('T')[0];
  const upcoming = bookings.results.filter(b => b.date >= today && b.status === 'confirmed');
  const past = bookings.results.filter(b => b.date < today || b.status === 'cancelled');

  return c.json({ upcoming, past });
});

app.post('/bookings', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const { session_id } = await c.req.json();
  if (!session_id) return c.json({ error: 'session_id required' }, 400);

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);
  if (!dbUser) return c.json({ error: 'User not found' }, 404);
  if (dbUser.status !== 'active') return c.json({ error: 'Account inactive' }, 403);

  const session = await getSession(c.env.DB, session_id);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  if (session.is_cancelled) return c.json({ error: 'Session is cancelled' }, 400);

  const today = new Date().toISOString().split('T')[0];
  if (session.date < today) return c.json({ error: 'Session is in the past' }, 400);

  const bookedCount = await getBookingCount(c.env.DB, session_id);
  if (bookedCount >= session.capacity) return c.json({ error: 'Session is full' }, 400);

  const program = await getProgram(c.env.DB, session.program_id);
  if (!program) return c.json({ error: 'Program not found' }, 404);

  const weekCount = await getWeekBookingCount(c.env.DB, dbUser.id, program.id, session.date);
  if (weekCount >= program.max_bookings_per_week) {
    return c.json({
      error: `Maximum ${program.max_bookings_per_week} booking(s) per week allowed`
    }, 400);
  }

  // Resolve child for parent-type programs
  let childId = null;
  if (program.booker_type === 'parent') {
    const child = await getChildByParentId(c.env.DB, dbUser.id);
    if (!child) return c.json({ error: 'No child profile found for this account' }, 400);
    childId = child.id;
  }

  // Check for duplicate
  const duplicate = await c.env.DB.prepare(
    `SELECT id FROM bookings WHERE session_id = ? AND user_id = ? AND status = 'confirmed'`
  ).bind(session_id, dbUser.id).first();
  if (duplicate) return c.json({ error: 'Already booked for this session' }, 409);

  const bookingId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO bookings (id, session_id, user_id, child_id, status)
     VALUES (?, ?, ?, ?, 'confirmed')`
  ).bind(bookingId, session_id, dbUser.id, childId).run();

  // Send emails (non-fatal)
  try {
    const { sendBookingConfirmation, sendAdminBookingAlert } = await import('./lib/email.js');
    const child = childId
      ? await c.env.DB.prepare('SELECT * FROM children WHERE id = ?').bind(childId).first()
      : null;
    await sendBookingConfirmation(c.env, dbUser, session, program, child);
    await sendAdminBookingAlert(c.env, dbUser, session, program, child);
  } catch (emailErr) {
    console.error('Email error (non-fatal):', emailErr);
  }

  return c.json({ ok: true, booking_id: bookingId }, 201);
});

app.delete('/bookings/:id', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const bookingId = c.req.param('id');

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);
  if (!dbUser) return c.json({ error: 'User not found' }, 404);

  const booking = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, s.program_id
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    WHERE b.id = ?
  `).bind(bookingId).first();

  if (!booking) return c.json({ error: 'Booking not found' }, 404);
  if (booking.user_id !== dbUser.id) return c.json({ error: 'Forbidden' }, 403);
  if (booking.status === 'cancelled') return c.json({ error: 'Booking already cancelled' }, 400);

  // Enforce cancellation window
  const program = await getProgram(c.env.DB, booking.program_id);
  const sessionDateTime = new Date(`${booking.date}T${booking.start_time}:00`);
  const hoursUntil = (sessionDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntil < program.cancellation_hours) {
    return c.json({
      error: `Cancellations must be made at least ${program.cancellation_hours} hours before the session`
    }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`
  ).bind(bookingId).run();

  // Send emails (non-fatal)
  try {
    const { sendCancellationConfirmation, sendAdminCancellationAlert } = await import('./lib/email.js');
    const session = await getSession(c.env.DB, booking.session_id);
    const child = booking.child_id
      ? await c.env.DB.prepare('SELECT * FROM children WHERE id = ?').bind(booking.child_id).first()
      : null;
    await sendCancellationConfirmation(c.env, dbUser, session, program, child);
    await sendAdminCancellationAlert(c.env, dbUser, session, program, child);
  } catch (emailErr) {
    console.error('Email error (non-fatal):', emailErr);
  }

  return c.json({ ok: true });
});

// ─── Admin: Sessions ──────────────────────────────────────────────────────────

app.get('/admin/sessions', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { week, program_id } = c.req.query();

  let startDate, endDate;
  if (week) {
    const monday = new Date(week + 'T12:00:00Z');
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    startDate = monday.toISOString().split('T')[0];
    endDate = sunday.toISOString().split('T')[0];
  } else {
    const now = new Date();
    const day = now.getUTCDay();
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    startDate = monday.toISOString().split('T')[0];
    endDate = sunday.toISOString().split('T')[0];
  }

  let query = `
    SELECT s.*,
      p.name as program_name,
      u.full_name as instructor_name,
      COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as booked_count
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u ON i.user_id = u.id
    LEFT JOIN bookings b ON s.id = b.session_id
    WHERE s.date >= ? AND s.date <= ?
  `;
  const binds = [startDate, endDate];

  if (program_id) {
    query += ' AND s.program_id = ?';
    binds.push(program_id);
  }

  query += ' GROUP BY s.id ORDER BY s.date ASC, s.start_time ASC';

  const sessions = await c.env.DB.prepare(query).bind(...binds).all();

  return c.json({ sessions: sessions.results, startDate, endDate });
});

app.post('/admin/sessions', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const body = await c.req.json();
  const { program_id, date, start_time, end_time, capacity, instructor_id, bay } = body;

  if (!program_id || !date) return c.json({ error: 'program_id and date required' }, 400);

  const program = await getProgram(c.env.DB, program_id);
  if (!program) return c.json({ error: 'Program not found' }, 404);

  const sessionId = generateId();
  const dayOfWeek = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', timeZone: 'UTC'
  }).toLowerCase();

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, program_id, date, day_of_week, start_time, end_time, capacity, instructor_id, bay)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sessionId,
    program_id,
    date,
    dayOfWeek,
    start_time || program.start_time || '16:00',
    end_time || program.end_time || '17:00',
    capacity || program.default_capacity || 10,
    instructor_id || null,
    bay || null
  ).run();

  return c.json({ ok: true, session_id: sessionId }, 201);
});

app.put('/admin/sessions/:id', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const sessionId = c.req.param('id');
  const body = await c.req.json();
  const { capacity, is_cancelled, cancel_reason, instructor_id, bay, notes } = body;

  const session = await getSession(c.env.DB, sessionId);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  await c.env.DB.prepare(
    `UPDATE sessions SET
      capacity     = ?,
      is_cancelled = ?,
      cancel_reason = ?,
      instructor_id = ?,
      bay          = ?,
      notes        = ?
     WHERE id = ?`
  ).bind(
    capacity ?? session.capacity,
    is_cancelled ?? session.is_cancelled,
    cancel_reason ?? session.cancel_reason,
    instructor_id ?? session.instructor_id,
    bay ?? session.bay,
    notes ?? session.notes,
    sessionId
  ).run();

  // If newly cancelled, email all booked parents
  if (is_cancelled === 1 && session.is_cancelled === 0) {
    try {
      const { sendSessionCancelledEmail } = await import('./lib/email.js');
      const program = await getProgram(c.env.DB, session.program_id);
      const bookings = await c.env.DB.prepare(`
        SELECT b.*, u.email, u.full_name, u.phone,
               ch.first_name as child_first_name
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        LEFT JOIN children ch ON b.child_id = ch.id
        WHERE b.session_id = ? AND b.status = 'confirmed'
      `).bind(sessionId).all();

      for (const booking of bookings.results) {
        await sendSessionCancelledEmail(c.env, booking, session, program, cancel_reason);
      }
    } catch (emailErr) {
      console.error('Email error (non-fatal):', emailErr);
    }
  }

  return c.json({ ok: true });
});

// ─── Admin: Roster & Check-In ─────────────────────────────────────────────────

app.get('/admin/sessions/:id/roster', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const sessionId = c.req.param('id');
  const session = await getSession(c.env.DB, sessionId);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const program = await getProgram(c.env.DB, session.program_id);

  const roster = await c.env.DB.prepare(`
    SELECT
      b.id as booking_id, b.status, b.checked_in, b.checked_in_at, b.booked_at,
      u.id as user_id, u.full_name as parent_name, u.email as parent_email, u.phone as parent_phone,
      ch.first_name as child_first_name, ch.age as child_age
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    LEFT JOIN children ch ON b.child_id = ch.id
    WHERE b.session_id = ? AND b.status = 'confirmed'
    ORDER BY b.booked_at ASC
  `).bind(sessionId).all();

  return c.json({
    session,
    program,
    roster: roster.results,
    booked_count: roster.results.length
  });
});

app.post('/admin/bookings/:id/checkin', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const bookingId = c.req.param('id');
  const { checked_in } = await c.req.json();

  const booking = await c.env.DB.prepare(
    'SELECT * FROM bookings WHERE id = ?'
  ).bind(bookingId).first();
  if (!booking) return c.json({ error: 'Booking not found' }, 404);

  await c.env.DB.prepare(
    `UPDATE bookings SET
      checked_in    = ?,
      checked_in_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
     WHERE id = ?`
  ).bind(checked_in ? 1 : 0, checked_in ? 1 : 0, bookingId).run();

  return c.json({ ok: true });
});

// ─── Admin: Manual Booking ────────────────────────────────────────────────────

app.post('/admin/bookings', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { user_id, session_id } = await c.req.json();
  if (!user_id || !session_id) return c.json({ error: 'user_id and session_id required' }, 400);

  const targetUser = await getUserById(c.env.DB, user_id);
  if (!targetUser) return c.json({ error: 'User not found' }, 404);

  const session = await getSession(c.env.DB, session_id);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  if (session.is_cancelled) return c.json({ error: 'Session is cancelled' }, 400);

  const program = await getProgram(c.env.DB, session.program_id);

  // Check for duplicate
  const duplicate = await c.env.DB.prepare(
    `SELECT id FROM bookings WHERE session_id = ? AND user_id = ? AND status = 'confirmed'`
  ).bind(session_id, user_id).first();
  if (duplicate) return c.json({ error: 'User already has a confirmed booking for this session' }, 409);

  // Admin bypasses capacity check — resolve child if needed
  let childId = null;
  if (program.booker_type === 'parent') {
    const child = await getChildByParentId(c.env.DB, user_id);
    if (child) childId = child.id;
  }

  const bookingId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO bookings (id, session_id, user_id, child_id, status)
     VALUES (?, ?, ?, ?, 'confirmed')`
  ).bind(bookingId, session_id, user_id, childId).run();

  // Email the parent as if they booked themselves
  try {
    const { sendBookingConfirmation } = await import('./lib/email.js');
    const child = childId
      ? await c.env.DB.prepare('SELECT * FROM children WHERE id = ?').bind(childId).first()
      : null;
    await sendBookingConfirmation(c.env, targetUser, session, program, child);
  } catch (emailErr) {
    console.error('Email error (non-fatal):', emailErr);
  }

  return c.json({ ok: true, booking_id: bookingId }, 201);
});

app.delete('/admin/bookings/:id', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const bookingId = c.req.param('id');

  const booking = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, s.program_id
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    WHERE b.id = ?
  `).bind(bookingId).first();

  if (!booking) return c.json({ error: 'Booking not found' }, 404);
  if (booking.status === 'cancelled') return c.json({ error: 'Booking already cancelled' }, 400);

  await c.env.DB.prepare(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`
  ).bind(bookingId).run();

  // Notify the parent
  try {
    const { sendCancellationConfirmation, sendAdminCancellationAlert } = await import('./lib/email.js');
    const targetUser = await getUserById(c.env.DB, booking.user_id);
    const session = await getSession(c.env.DB, booking.session_id);
    const program = await getProgram(c.env.DB, booking.program_id);
    const child = booking.child_id
      ? await c.env.DB.prepare('SELECT * FROM children WHERE id = ?').bind(booking.child_id).first()
      : null;
    await sendCancellationConfirmation(c.env, targetUser, session, program, child);
    await sendAdminCancellationAlert(c.env, targetUser, session, program, child);
  } catch (emailErr) {
    console.error('Email error (non-fatal):', emailErr);
  }

  return c.json({ ok: true });
});

// ─── Admin: Members ───────────────────────────────────────────────────────────

app.get('/admin/members', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { status, q } = c.req.query();

  let query = `
    SELECT u.*,
      ch.first_name as child_first_name, ch.age as child_age
    FROM users u
    LEFT JOIN children ch ON ch.parent_id = u.id
    WHERE u.role = 'student'
  `;
  const binds = [];

  if (status) {
    query += ' AND u.status = ?';
    binds.push(status);
  }
  if (q) {
    query += ' AND (u.full_name LIKE ? OR u.email LIKE ?)';
    binds.push(`%${q}%`, `%${q}%`);
  }

  query += ' ORDER BY u.created_at DESC';

  const members = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json({ members: members.results });
});

app.get('/admin/members/:id', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const userId = c.req.param('id');
  const user = await getUserById(c.env.DB, userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const children = await c.env.DB.prepare(
    'SELECT * FROM children WHERE parent_id = ?'
  ).bind(userId).all();

  const bookings = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, s.end_time, p.name as program_name
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN programs p ON s.program_id = p.id
    WHERE b.user_id = ?
    ORDER BY s.date DESC
  `).bind(userId).all();

  return c.json({ user, children: children.results, bookings: bookings.results });
});

app.put('/admin/members/:id', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const userId = c.req.param('id');
  const body = await c.req.json();
  const { status, full_name, phone } = body;

  const user = await getUserById(c.env.DB, userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  await c.env.DB.prepare(
    `UPDATE users SET
      status    = ?,
      full_name = ?,
      phone     = ?
     WHERE id = ?`
  ).bind(
    status ?? user.status,
    full_name ?? user.full_name,
    phone ?? user.phone,
    userId
  ).run();

  return c.json({ ok: true });
});

app.post('/admin/members', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const body = await c.req.json();
  const { full_name, email, phone, kid_first_name, kid_age } = body;

  if (!full_name || !email) return c.json({ error: 'full_name and email required' }, 400);

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();
  if (existing) return c.json({ error: 'A user with this email already exists' }, 409);

  const userId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO users (id, clerk_id, email, full_name, phone, role, status)
     VALUES (?, ?, ?, ?, ?, 'student', 'active')`
  ).bind(userId, `manual_${userId}`, email, full_name, phone || null).run();

  if (kid_first_name) {
    const childId = generateId();
    await c.env.DB.prepare(
      'INSERT INTO children (id, parent_id, first_name, age) VALUES (?, ?, ?, ?)'
    ).bind(childId, userId, kid_first_name, kid_age || null).run();
  }

  return c.json({ ok: true, user_id: userId }, 201);
});

// ─── Admin: Programs ──────────────────────────────────────────────────────────

app.get('/admin/programs', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const programs = await c.env.DB.prepare(
    'SELECT * FROM programs ORDER BY created_at ASC'
  ).all();

  return c.json({ programs: programs.results });
});

app.put('/admin/programs/:id', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const programId = c.req.param('id');
  const body = await c.req.json();

  const program = await getProgram(c.env.DB, programId);
  if (!program) return c.json({ error: 'Program not found' }, 404);

  const {
    name, description, session_days, start_time, end_time,
    default_capacity, price_display, show_instructor,
    forward_view_weeks, forward_view_enabled,
    cancellation_hours, max_bookings_per_week, is_active
  } = body;

  await c.env.DB.prepare(
    `UPDATE programs SET
      name                  = ?,
      description           = ?,
      session_days          = ?,
      start_time            = ?,
      end_time              = ?,
      default_capacity      = ?,
      price_display         = ?,
      show_instructor       = ?,
      forward_view_weeks    = ?,
      forward_view_enabled  = ?,
      cancellation_hours    = ?,
      max_bookings_per_week = ?,
      is_active             = ?,
      updated_at            = datetime('now')
     WHERE id = ?`
  ).bind(
    name ?? program.name,
    description ?? program.description,
    session_days ?? program.session_days,
    start_time ?? program.start_time,
    end_time ?? program.end_time,
    default_capacity ?? program.default_capacity,
    price_display ?? program.price_display,
    show_instructor ?? program.show_instructor,
    forward_view_weeks ?? program.forward_view_weeks,
    forward_view_enabled ?? program.forward_view_enabled,
    cancellation_hours ?? program.cancellation_hours,
    max_bookings_per_week ?? program.max_bookings_per_week,
    is_active ?? program.is_active,
    programId
  ).run();

  return c.json({ ok: true });
});

// ─── Admin: Config ────────────────────────────────────────────────────────────

app.get('/admin/config', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const config = await getConfig(c.env.DB);
  return c.json({ config });
});

app.put('/admin/config', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const body = await c.req.json();
  const { admin_email } = body;

  await c.env.DB.prepare(
    `UPDATE config SET admin_email = ?, updated_at = datetime('now') WHERE id = 1`
  ).bind(admin_email).run();

  return c.json({ ok: true });
});

// ─── Instructor: Availability (Theory AI) ────────────────────────────────────

app.get('/availability', async (c) => {
  const { error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const { program_id, date_from, date_to } = c.req.query();
  if (!program_id) return c.json({ error: 'program_id required' }, 400);

  const today = new Date().toISOString().split('T')[0];
  const from = date_from || today;
  const to = date_to || (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  })();

  const slots = await c.env.DB.prepare(`
    SELECT a.*, u.full_name as instructor_name
    FROM availability a
    JOIN instructors i ON a.instructor_id = i.id
    JOIN users u ON i.user_id = u.id
    WHERE a.program_id = ?
      AND a.date >= ?
      AND a.date <= ?
      AND a.is_booked = 0
    ORDER BY a.date ASC, a.start_time ASC
  `).bind(program_id, from, to).all();

  return c.json({ slots: slots.results });
});

app.post('/admin/availability', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const body = await c.req.json();
  const { instructor_id, program_id, bay, date, start_time, end_time } = body;

  if (!instructor_id || !program_id || !bay || !date || !start_time || !end_time) {
    return c.json({ error: 'All fields required: instructor_id, program_id, bay, date, start_time, end_time' }, 400);
  }

  const slotId = generateId();
  await c.env.DB.prepare(
    `INSERT INTO availability (id, instructor_id, program_id, bay, date, start_time, end_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(slotId, instructor_id, program_id, bay, date, start_time, end_time).run();

  return c.json({ ok: true, slot_id: slotId }, 201);
});

app.delete('/admin/availability/:id', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const slotId = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM availability WHERE id = ?').bind(slotId).run();

  return c.json({ ok: true });
});

// ─── Instructors ──────────────────────────────────────────────────────────────

app.get('/admin/instructors', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const instructors = await c.env.DB.prepare(`
    SELECT i.*, u.full_name, u.email, u.phone, u.status
    FROM instructors i
    JOIN users u ON i.user_id = u.id
    ORDER BY u.full_name ASC
  `).all();

  return c.json({ instructors: instructors.results });
});

// ─── Cron Handler ─────────────────────────────────────────────────────────────

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    switch (event.cron) {
      case '0 15 * * 0': // Sunday 8AM Pacific (UTC-7 in summer)
        ctx.waitUntil(generateSessions(env));
        break;
      case '0 15 * * *': // Daily 8AM Pacific
        ctx.waitUntil(sendReminders(env));
        break;
      default:
        console.log('Unknown cron trigger:', event.cron);
    }
  }
};
