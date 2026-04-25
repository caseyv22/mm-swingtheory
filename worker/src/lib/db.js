export function generateId() {
  return crypto.randomUUID();
}

export async function getConfig(db) {
  return await db.prepare('SELECT * FROM config WHERE id = 1').first();
}

export async function getUserByClerkId(db, clerkId) {
  return await db.prepare('SELECT * FROM users WHERE clerk_id = ?').bind(clerkId).first();
}

export async function getUserById(db, userId) {
  return await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
}

export async function getProgram(db, programId) {
  return await db.prepare('SELECT * FROM programs WHERE id = ?').bind(programId).first();
}

export async function getProgramBySlug(db, slug) {
  return await db.prepare('SELECT * FROM programs WHERE slug = ? AND is_active = 1').bind(slug).first();
}

export async function getSession(db, sessionId) {
  return await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first();
}

export async function getBookingCount(db, sessionId) {
  const result = await db.prepare(
    "SELECT COUNT(*) as count FROM bookings WHERE session_id = ? AND status = 'confirmed'"
  ).bind(sessionId).first();
  return result.count;
}

export async function getChildByParentId(db, parentId) {
  return await db.prepare('SELECT * FROM children WHERE parent_id = ?').bind(parentId).first();
}

export async function getWeekBookingCount(db, userId, programId, sessionDate) {
  const date = new Date(sessionDate + 'T00:00:00Z');
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const mondayStr = monday.toISOString().split('T')[0];
  const sundayStr = sunday.toISOString().split('T')[0];

  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM bookings b
    JOIN sessions s ON b.session_id = s.id
    WHERE b.user_id = ?
      AND s.program_id = ?
      AND b.status = 'confirmed'
      AND s.date >= ?
      AND s.date <= ?
  `).bind(userId, programId, mondayStr, sundayStr).first();

  return result.count;
}

export async function getInstructor(db, instructorId) {
  return await db.prepare(`
    SELECT i.*, u.full_name, u.email, u.phone
    FROM instructors i
    JOIN users u ON i.user_id = u.id
    WHERE i.id = ?
  `).bind(instructorId).first();
}
