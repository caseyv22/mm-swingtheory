import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { generateSessions } from './crons/generateSessions.js';
import { sendReminders } from './crons/sendReminders.js';
import { requireAuth, requireAdmin } from './lib/auth.js';
import { getConfig, generateId, getMemberByClerkId, getSession, getBookingCount, getWeekBookingCount } from './lib/db.js';

const app = new Hono();

app.use('/*', cors({
  origin: ['https://mm.swingtheory.golf', 'https://mm-1a4.pages.dev', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/health', (c) => c.json({ ok: true, service: 'mm-api' }));

app.get('/sessions', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const config = await getConfig(c.env.DB);

  if (!config.forward_view_enabled) {
    return c.json({ paused: true, sessions: [] });
  }

  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + config.forward_view_weeks * 7);
  const endDateStr = endDate.toISOString().split('T')[0];

  const sessions = await c.env.DB.prepare(`
    SELECT s.*,
      COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as booked_count
    FROM sessions s
    LEFT JOIN bookings b ON s.id = b.session_id
    WHERE s.date >= ? AND s.date <= ?
    GROUP BY s.id
    ORDER BY s.date ASC
  `).bind(today, endDateStr).all();

  const member = await getMemberByClerkId(c.env.DB, user.sub);

  let myBookings = new Set();
  if (member) {
    const bookings = await c.env.DB.prepare(`
      SELECT session_id FROM bookings
      WHERE member_id = ? AND status = 'confirmed'
    `).bind(member.id).all();
    myBookings = new Set(bookings.results.map(b => b.session_id));
  }

  const enriched = sessions.results.map(s => ({
    ...s,
    spots_remaining: s.capacity - s.booked_count,
    is_booked_by_me: myBookings.has(s.id),
  }));

  return c.json({ paused: false, sessions: enriched });
});

app.post('/bookings', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const { session_id } = await c.req.json();
  if (!session_id) return c.json({ error: 'session_id required' }, 400);

  const member = await getMemberByClerkId(c.env.DB, user.sub);
  if (!member) return c.json({ error: 'Member not found' }, 404);
  if (member.status !== 'active') return c.json({ error: 'Account inactive' }, 403);

  const session = await getSession(c.env.DB, session_id);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  if (session.is_cancelled) return c.json({ error: 'Session is cancelled' }, 400);

  const today = new Date().toISOString().split('T')[0];
  if (session.date < today) return c.json({ error: 'Session is in the past' }, 400);

  const bookedCount = await getBookingCount(c.env.DB, session_id);
  if (bookedCount >= session.capacity) return c.json({ error: 'Session is full' }, 400);

  const config = await getConfig(c.env.DB);
  const weekCount = await getWeekBookingCount(c.env.DB, member.id, session.date);
  if (weekCount >= config.max_bookings_per_week) {
    return c.json({ error: `Maximum ${config.max_bookings_per_week} booking(s) per week allowed` }, 400);
  }

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO bookings (id, member_id, session_id, status)
    VALUES (?, ?, ?, 'confirmed')
  `).bind(id, member.id, session_id).run();

  return c.json({ ok: true, booking_id: id }, 201);
});

app.delete('/bookings/:id', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const bookingId = c.req.param('id');
  const member = await getMemberByClerkId(c.env.DB, user.sub);
  if (!member) return c.json({ error: 'Member not found' }, 404);

  const booking = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    WHERE b.id = ? AND b.member_id = ?
  `).bind(bookingId, member.id).first();

  if (!booking) return c.json({ error: 'Booking not found' }, 404);
  if (booking.status === 'cancelled') return c.json({ error: 'Already cancelled' }, 400);

  const config = await getConfig(c.env.DB);
  const sessionStart = new Date(`${booking.date}T${booking.start_time}:00-07:00`);
  const hoursUntil = (sessionStart - new Date()) / (1000 * 60 * 60);

  if (hoursUntil < config.cancellation_hours) {
    return c.json({ error: `Cancellations must be made at least ${config.cancellation_hours} hours in advance` }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now')
    WHERE id = ?
  `).bind(bookingId).run();

  return c.json({ ok: true });
});

app.post('/members', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const { parent_name, phone, kid_name, kid_age } = await c.req.json();

  if (!parent_name || !kid_name) {
    return c.json({ error: 'parent_name and kid_name are required' }, 400);
  }

  const { getClerkClient } = await import('./lib/auth.js');
  const clerk = getClerkClient(c.env);
  const clerkUser = await clerk.users.getUser(user.sub);
  const email = clerkUser.emailAddresses?.[0]?.emailAddress;

  if (!email) return c.json({ error: 'No email found on Clerk account' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM members WHERE clerk_id = ?').bind(user.sub).first();
  if (existing) return c.json({ error: 'Member already exists' }, 409);

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO members (id, parent_name, email, phone, kid_name, kid_age, clerk_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `).bind(id, parent_name, email, phone || null, kid_name, kid_age || null, user.sub).run();

  return c.json({ ok: true, member_id: id }, 201);
});

app.get('/members/me', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const member = await getMemberByClerkId(c.env.DB, user.sub);
  if (!member) return c.json({ member: null });
  return c.json({ member });
});

app.get('/my-bookings', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const member = await getMemberByClerkId(c.env.DB, user.sub);
  if (!member) return c.json({ bookings: [] });

  const bookings = await c.env.DB.prepare(`
    SELECT b.*, s.date, s.start_time, s.end_time, s.is_cancelled
    FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    WHERE b.member_id = ?
    ORDER BY s.date DESC
  `).bind(member.id).all();

  return c.json({ bookings: bookings.results });
});

app.get('/admin/members', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const status = c.req.query('status');
  let result;

  if (status) {
    result = await c.env.DB.prepare('SELECT * FROM members WHERE status = ? ORDER BY created_at DESC').bind(status).all();
  } else {
    result = await c.env.DB.prepare('SELECT * FROM members ORDER BY created_at DESC').all();
  }

  return c.json({ members: result.results });
});

app.put('/admin/members/:id/status', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { status } = await c.req.json();
  if (!['active', 'inactive'].includes(status)) return c.json({ error: 'Invalid status' }, 400);

  await c.env.DB.prepare('UPDATE members SET status = ? WHERE id = ?')
    .bind(status, c.req.param('id')).run();

  return c.json({ ok: true });
});

app.get('/admin/roster/:date', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const date = c.req.param('date');
  const sessions = await c.env.DB.prepare(`
    SELECT s.*,
      COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as booked_count
    FROM sessions s
    LEFT JOIN bookings b ON s.id = b.session_id
    WHERE s.date = ?
    GROUP BY s.id
  `).bind(date).all();

  const result = [];
  for (const session of sessions.results) {
    const bookings = await c.env.DB.prepare(`
      SELECT b.*, m.parent_name, m.kid_name, m.phone
      FROM bookings b
      JOIN members m ON b.member_id = m.id
      WHERE b.session_id = ? AND b.status = 'confirmed'
      ORDER BY b.booked_at ASC
    `).bind(session.id).all();

    result.push({ ...session, bookings: bookings.results });
  }

  return c.json({ sessions: result });
});

app.post('/admin/checkin', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { booking_id, checked_in } = await c.req.json();

  await c.env.DB.prepare(`
    UPDATE bookings SET checked_in = ?, checked_in_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
    WHERE id = ?
  `).bind(checked_in ? 1 : 0, checked_in ? 1 : 0, booking_id).run();

  return c.json({ ok: true });
});

app.post('/admin/sessions/:id/cancel', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { reason } = await c.req.json();

  await c.env.DB.prepare(`
    UPDATE sessions SET is_cancelled = 1, cancel_reason = ? WHERE id = ?
  `).bind(reason || null, c.req.param('id')).run();

  return c.json({ ok: true });
});

app.put('/admin/config', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const updates = await c.req.json();
  const allowed = ['session_days','forward_view_weeks','forward_view_enabled','cancellation_hours','max_bookings_per_week','default_capacity','admin_email'];

  const fields = Object.keys(updates).filter(k => allowed.includes(k));
  if (fields.length === 0) return c.json({ error: 'No valid fields' }, 400);

  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);

  await c.env.DB.prepare(`UPDATE config SET ${setClause}, updated_at = datetime('now') WHERE id = 1`)
    .bind(...values).run();

  return c.json({ ok: true });
});

app.post('/admin/bookings', async (c) => {
  const { error } = await requireAdmin(c.req.raw, c.env);
  if (error) return error;

  const { member_id, session_id } = await c.req.json();
  if (!member_id || !session_id) return c.json({ error: 'member_id and session_id required' }, 400);

  const id = generateId();
  await c.env.DB.prepare(`
    INSERT INTO bookings (id, member_id, session_id, status)
    VALUES (?, ?, ?, 'confirmed')
  `).bind(id, member_id, session_id).run();

  return c.json({ ok: true, booking_id: id }, 201);
});

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
