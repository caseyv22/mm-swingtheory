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
  getWeekBookingCount, getChildByParentId
} from './lib/db.js';

const app = new Hono();

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

app.get('/health', (c) => c.json({ ok: true, service: 'st-platform-api' }));

app.get('/programs', async (c) => {
  const { user, error } = await requireAuth(c.req.raw, c.env);
  if (error) return error;

  const subdomain = c.req.header('x-subdomain') || 'mm';

  const programs = await c.env.DB.prepare(
    'SELECT * FROM programs WHERE is_active = 1 ORDER BY created_at ASC'
  ).all();

  const dbUser = await getUserByClerkId(c.env.DB, user.sub);

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
    const child = await getChildByParentId(c.env.DB, dbUser
