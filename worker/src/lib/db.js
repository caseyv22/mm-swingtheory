export function generateId() {
  return crypto.randomUUID();
}

export async function getConfig(db) {
  const result = await db.prepare('SELECT * FROM config WHERE id = 1').first();
  return result;
}

export async function getSession(db, sessionId) {
  return await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first();
}

export async function getBookingCount(db, sessionId) {
  const result = await db
    .prepare("SELECT COUNT(*) as count FROM bookings WHERE session_id = ? AND status = 'confirmed'")
    .bind(sessionId)
    .first();
  return result.count;
}

export async function getMember(db, memberId) {
  return await db.prepare('SELECT * FROM members WHERE id = ?').bind(memberId).first();
}

export async function getMemberByClerkId(db, clerkId) {
  return await db.prepare('SELECT * FROM members WHERE clerk_id = ?').bind(clerkId).first();
}

export async function getWeekBookingCount(db, memberId, sessionDate) {
  // Get Mon-Sun week boundaries for the session date
  const date = new Date(sessionDate + 'T00:00:00Z');
  const day = date.getUTCDay(); // 0=Sun, 1=Mon...
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
    WHERE b.member_id = ?
      AND b.status = 'confirmed'
      AND s.date >= ?
      AND s.date <= ?
  `).bind(memberId, mondayStr, sundayStr).first();

  return result.count;
}
