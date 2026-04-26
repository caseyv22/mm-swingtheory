import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { generateSessions } from './crons/generateSessions.js';
import { sendReminders } from './crons/sendReminders.js';
import {
  requireAuth, requireAdmin, requireInstructor
} from './lib/auth.js';
import {
  generateId, getConfig, getUserByClerkId, getProgram,
  getProgramBySlug, getSession, getBookingCount,
  getWeekBookingCount, getChildByParentId, getInstructor
} from './lib/db.js';

const app = new Hono();

app.use('/*', cors({
  origin: [
    'https://mm.swingtheory.golf',
    'https://lessons.swingtheory.golf',
    'https://mm-1a4.pages.dev',
    'http://localhost:5173'
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Health ───────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true, service: 'st-platform-api' }));

// ─── Programs ─────────────────────────────────────────────────
app.get('/programs', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const subdomain = c.req.header('x-subdomain') || 'mm';

  const programs = await c.env.DB.prepare(
    'SELECT * FROM programs WHERE is_active = 1 ORDER BY created_at ASC'
  ).all();

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);

  const filtered = programs.results.filter(p => {
    if (subdomain === 'lessons') {
      return p.slug === 'theory-ai';
    }
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

// ─── Sessions ─────────────────────────────────────────────────
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
    GROUP BY s.id
    ORDER BY s.date ASC, s.start_time ASC
  `).bind(program.id, today, endDateStr).all();

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);
  let myBookings = new Set();

  if (dbUser) {
    const bookings = await c.env.DB.prepare(`
      SELECT session_id FROM bookings
      WHERE user_id = ? AND status = 'confirmed'
    `).bind(dbUser.id).all();
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

// ─── Bookings ─────────────────────────────────────────────────
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
  const weekCount = await getWeekBookingCount(c.env.DB, dbUser.id, program.id, session.date);
  if (weekCount >= program.max_bookings_per_week) {
    return c.json({ error: `Maximum ${program.max_bookings_per_week} booking(s) per week allowed` }, 400);
  }

  let childId = null;
  if (program.booker_type === 'parent') {
    const child = await getChildByParentId(c.env.DB, dbUser.id);
    if (!child) return c.json({ error: 'No child found for this account' }, 404);
    childId = child.id;
  }

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO bookings (id, session_id, user_id, child_id, status)
    VALUES (?, ?, ?, ?, 'confirmed')
  `).bind(id, session_id, dbUser.id, childId).run();

  return c.json({ ok: true, booking_id: id }, 201);
});

app.delete('/bookings/:id', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const bookingId = c.req.param('id');
  const dbUser = await getUserByClerkId(c.env.DB, user.sub);
  if (!dbUser) return c.json({ error: 'User not found' }, 404);

  const booking = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, s.program_id FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    WHERE b.id = ? AND b.user_id = ?
  `).bind(bookingId, dbUser.id).first();

  if (!booking) return c.json({ error: 'Booking not found' }, 404);
  if (booking.status === 'cancelled') return c.json({ error: 'Already cancelled' }, 400);

  const program = await getProgram(c.env.DB, booking.program_id);
  const sessionStart = new Date(`${booking.date}T${booking.start_time}:00-07:00`);
  const hoursUntil = (sessionStart - new Date()) / (1000 * 60 * 60);

  if (hoursUntil < program.cancellation_hours) {
    return c.json({ error: `Cancellations must be made at least ${program.cancellation_hours} hours in advance` }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now')
    WHERE id = ?
  `).bind(bookingId).run();

  return c.json({ ok: true });
});

// ─── My Bookings ──────────────────────────────────────────────
app.get('/my-bookings', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);
  if (!dbUser) return c.json({ bookings: [] });

  const bookings = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, s.end_time, s.is_cancelled, s.bay,
      p.name as program_name, p.slug as program_slug, p.show_instructor,
      u.full_name as instructor_name,
      ch.first_name as child_name
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u ON i.user_id = u.id
    LEFT JOIN children ch ON b.child_id = ch.id
    WHERE b.user_id = ?
    ORDER BY s.date DESC
  `).bind(dbUser.id).all();

  return c.json({ bookings: bookings.results });
});

// ─── Users ────────────────────────────────────────────────────
app.get('/users/me', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);

  if (!dbUser) {
    return c.json({ user: null, first_login: true, role: null });
  }

  let child = null;
  if (dbUser.role === 'parent') {
    child = await getChildByParentId(c.env.DB, dbUser.id);
  }

  const first_login = dbUser.role === 'parent' && !child;

  return c.json({
    user: dbUser,
    child,
    first_login,
    role: dbUser.role,
  });
});

app.post('/users/child', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const { first_name, age } = await c.req.json();
  if (!first_name) return c.json({ error: 'first_name required' }, 400);

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);
  if (!dbUser) return c.json({ error: 'User not found' }, 404);
  if (dbUser.role !== 'parent') return c.json({ error: 'Only parents can add children' }, 403);

  const existing = await getChildByParentId(c.env.DB, dbUser.id);
  if (existing) return c.json({ error: 'Child already exists' }, 409);

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO children (id, parent_id, first_name, age)
    VALUES (?, ?, ?, ?)
  `).bind(id, dbUser.id, first_name, age || null).run();

  return c.json({ ok: true, child_id: id }, 201);
});

// ─── Admin — Invite ───────────────────────────────────────────
app.post('/admin/invite', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { first_name, last_name, email, phone, role } = await c.req.json();

  if (!first_name || !last_name || !email || !role) {
    return c.json({ error: 'first_name, last_name, email, and role are required' }, 400);
  }

  if (!['parent', 'student', 'instructor', 'admin'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();
  if (existing) return c.json({ error: 'A user with this email already exists' }, 409);

  try {
    const { createClerkClient } = await import('@clerk/backend');
    const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });

    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: c.env.INVITE_REDIRECT_URL,
      publicMetadata: { role },
    });

    const userId = generateId();
    await c.env.DB.prepare(`
      INSERT INTO users (id, clerk_id, email, full_name, phone, role, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).bind(
      userId,
      invitation.id,
      email,
      `${first_name} ${last_name}`,
      phone || null,
      role
    ).run();

    return c.json({ ok: true, user_id: userId, invitation_id: invitation.id }, 201);

  } catch (e) {
    console.error('Invite error:', e.message);
    return c.json({ error: 'Failed to send invitation: ' + e.message }, 500);
  }
});

// ─── Admin — Users ────────────────────────────────────────────
app.get('/admin/users', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const role = c.req.query('role');
  const status = c.req.query('status');

  let query = 'SELECT * FROM users WHERE 1=1';
  const bindings = [];

  if (role) { query += ' AND role = ?'; bindings.push(role); }
  if (status) { query += ' AND status = ?'; bindings.push(status); }
  query += ' ORDER BY created_at DESC';

  const result = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ users: result.results });
});

app.get('/admin/users/:id', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(c.req.param('id')).first();

  if (!user) return c.json({ error: 'User not found' }, 404);

  let child = null;
  if (user.role === 'parent') {
    child = await getChildByParentId(c.env.DB, user.id);
  }

  const bookings = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, s.end_time, p.name as program_name
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    JOIN programs p ON s.program_id = p.id
    WHERE b.user_id = ?
    ORDER BY s.date DESC
  `).bind(user.id).all();

  return c.json({ user, child, bookings: bookings.results });
});

app.put('/admin/users/:id/status', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { status } = await c.req.json();
  if (!['active', 'inactive'].includes(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  await c.env.DB.prepare('UPDATE users SET status = ? WHERE id = ?')
    .bind(status, c.req.param('id')).run();

  return c.json({ ok: true });
});

// ─── Admin — Programs ─────────────────────────────────────────
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

  const updates = await c.req.json();
  const allowed = [
    'name', 'description', 'session_days', 'start_time', 'end_time',
    'default_capacity', 'price_display', 'show_instructor',
    'forward_view_weeks', 'forward_view_enabled',
    'cancellation_hours', 'max_bookings_per_week', 'is_active'
  ];

  const fields = Object.keys(updates).filter(k => allowed.includes(k));
  if (fields.length === 0) return c.json({ error: 'No valid fields' }, 400);

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);

  await c.env.DB.prepare(
    `UPDATE programs SET ${setClause}, updated_at = datetime('now') WHERE id = ?`
  ).bind(...values, c.req.param('id')).run();

  return c.json({ ok: true });
});

// ─── Admin — Sessions ─────────────────────────────────────────
app.get('/admin/sessions', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const date = c.req.query('date');
  const programId = c.req.query('program_id');
  const weekStart = c.req.query('week_start');

  let query = `
    SELECT s.*, p.name as program_name,
      u.full_name as instructor_name,
      COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as booked_count
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u ON i.user_id = u.id
    LEFT JOIN bookings b ON s.id = b.session_id
    WHERE 1=1
  `;
  const bindings = [];

  if (date) { query += ' AND s.date = ?'; bindings.push(date); }
  if (programId) { query += ' AND s.program_id = ?'; bindings.push(programId); }
  if (weekStart) {
    const start = new Date(weekStart + 'T00:00:00Z');
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    query += ' AND s.date >= ? AND s.date <= ?';
    bindings.push(weekStart, end.toISOString().split('T')[0]);
  }

  query += ' GROUP BY s.id ORDER BY s.date ASC, s.start_time ASC';

  const sessions = await c.env.DB.prepare(query).bind(...bindings).all();
  return c.json({ sessions: sessions.results });
});

app.get('/admin/sessions/:id/roster', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const session = await c.env.DB.prepare(`
    SELECT s.*, p.name as program_name, p.show_instructor,
      u.full_name as instructor_name
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN instructors i ON s.instructor_id = i.id
    LEFT JOIN users u ON i.user_id = u.id
    WHERE s.id = ?
  `).bind(c.req.param('id')).first();

  if (!session) return c.json({ error: 'Session not found' }, 404);

  const bookings = await c.env.DB.prepare(`
    SELECT b.*, u.full_name, u.email, u.phone, u.role,
      ch.first_name as child_name, ch.age as child_age
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    LEFT JOIN children ch ON b.child_id = ch.id
    WHERE b.session_id = ? AND b.status = 'confirmed'
    ORDER BY b.booked_at ASC
  `).bind(c.req.param('id')).all();

  return c.json({ session, bookings: bookings.results });
});

app.put('/admin/sessions/:id', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const updates = await c.req.json();
  const allowed = ['instructor_id', 'bay', 'capacity', 'is_cancelled', 'cancel_reason', 'notes', 'start_time', 'end_time'];

  const fields = Object.keys(updates).filter(k => allowed.includes(k));
  if (fields.length === 0) return c.json({ error: 'No valid fields' }, 400);

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);

  await c.env.DB.prepare(
    `UPDATE sessions SET ${setClause} WHERE id = ?`
  ).bind(...values, c.req.param('id')).run();

  return c.json({ ok: true });
});

app.post('/admin/sessions', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { program_id, date, start_time, end_time, capacity, instructor_id, bay } = await c.req.json();

  if (!program_id || !date || !start_time || !end_time) {
    return c.json({ error: 'program_id, date, start_time, end_time required' }, 400);
  }

  const program = await getProgram(c.env.DB, program_id);
  if (!program) return c.json({ error: 'Program not found' }, 404);

  const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][
    new Date(date + 'T00:00:00Z').getUTCDay()
  ];

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO sessions (id, program_id, date, day_of_week, start_time, end_time, capacity, instructor_id, bay)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, program_id, date, dayName, start_time, end_time,
    capacity || program.default_capacity,
    instructor_id || null,
    bay || null
  ).run();

  return c.json({ ok: true, session_id: id }, 201);
});

// ─── Admin — Bookings ─────────────────────────────────────────
app.post('/admin/bookings', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { user_id, session_id, child_id } = await c.req.json();
  if (!user_id || !session_id) {
    return c.json({ error: 'user_id and session_id required' }, 400);
  }

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO bookings (id, session_id, user_id, child_id, status)
    VALUES (?, ?, ?, ?, 'confirmed')
  `).bind(id, session_id, user_id, child_id || null).run();

  return c.json({ ok: true, booking_id: id }, 201);
});

app.delete('/admin/bookings/:id', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  await c.env.DB.prepare(`
    UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now')
    WHERE id = ?
  `).bind(c.req.param('id')).run();

  return c.json({ ok: true });
});

app.post('/admin/checkin', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { booking_id, checked_in } = await c.req.json();

  await c.env.DB.prepare(`
    UPDATE bookings
    SET checked_in = ?,
        checked_in_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
    WHERE id = ?
  `).bind(checked_in ? 1 : 0, checked_in ? 1 : 0, booking_id).run();

  return c.json({ ok: true });
});

// ─── Admin — Instructors ──────────────────────────────────────
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

app.post('/admin/instructors', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { user_id, bio } = await c.req.json();
  if (!user_id) return c.json({ error: 'user_id required' }, 400);

  const id = generateId();
  await c.env.DB.prepare(
    'INSERT INTO instructors (id, user_id, bio) VALUES (?, ?, ?)'
  ).bind(id, user_id, bio || null).run();

  await c.env.DB.prepare(
    "UPDATE users SET role = 'instructor' WHERE id = ?"
  ).bind(user_id).run();

  return c.json({ ok: true, instructor_id: id }, 201);
});

// ─── Admin — Config ───────────────────────────────────────────
app.get('/admin/config', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const config = await getConfig(c.env.DB);
  return c.json({ config });
});

app.put('/admin/config', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { admin_email } = await c.req.json();
  if (!admin_email) return c.json({ error: 'admin_email required' }, 400);

  await c.env.DB.prepare(
    "UPDATE config SET admin_email = ?, updated_at = datetime('now') WHERE id = 1"
  ).bind(admin_email).run();

  return c.json({ ok: true });
});

// ─── Instructor routes ────────────────────────────────────────
app.get('/instructor/sessions', async (c) => {
  const { user, error } = await requireInstructor(c.req.raw, c.env);
  if (error) return error;

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);
  if (!dbUser) return c.json({ error: 'User not found' }, 404);

  const instructor = await c.env.DB.prepare(
    'SELECT * FROM instructors WHERE user_id = ?'
  ).bind(dbUser.id).first();

  if (!instructor) return c.json({ error: 'Instructor profile not found' }, 404);

  const today = new Date().toISOString().split('T')[0];

  const sessions = await c.env.DB.prepare(`
    SELECT s.*, p.name as program_name,
      COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as booked_count
    FROM sessions s
    JOIN programs p ON s.program_id = p.id
    LEFT JOIN bookings b ON s.id = b.session_id
    WHERE s.instructor_id = ? AND s.date >= ?
    GROUP BY s.id
    ORDER BY s.date ASC
  `).bind(instructor.id, today).all();

  return c.json({ sessions: sessions.results });
});

// ─── Cron dispatcher ──────────────────────────────────────────
export default {
  fetch: app.fetch,

  async scheduled(event, env, ctx) {
    switch (event.cron) {
      case '0 15 * * 0':
        ctx.waitUntil(generateSessions(env.DB));
        break;
      case '0 15 * * *':
        ctx.waitUntil(sendReminders(env.DB, env.RESEND_API_KEY));
        break;
    }
  }
};
