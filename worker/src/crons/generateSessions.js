import { generateId } from '../lib/db.js';

const FIXED_HOLIDAYS = [
  '01-01', '06-19', '07-04', '11-11', '12-25',
];

function getNthWeekday(year, month, weekday, n) {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (date.getUTCMonth() === month - 1) {
    if (date.getUTCDay() === weekday) {
      count++;
      if (count === n) return date.toISOString().split('T')[0];
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return null;
}

function getLastWeekday(year, month, weekday) {
  const date = new Date(Date.UTC(year, month, 0));
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().split('T')[0];
}

function getFederalHolidays(year) {
  const holidays = new Set();
  for (const mmdd of FIXED_HOLIDAYS) holidays.add(`${year}-${mmdd}`);
  holidays.add(getNthWeekday(year, 1, 1, 3));
  holidays.add(getNthWeekday(year, 2, 1, 3));
  holidays.add(getLastWeekday(year, 5, 1));
  holidays.add(getNthWeekday(year, 9, 1, 1));
  holidays.add(getNthWeekday(year, 10, 1, 2));
  holidays.add(getNthWeekday(year, 11, 4, 4));
  return holidays;
}

const DAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday'
];

export async function generateSessions(db) {
  // Get all active group programs that have session_days defined
  const programs = await db.prepare(`
    SELECT * FROM programs
    WHERE is_active = 1
      AND booking_type = 'group'
      AND session_days IS NOT NULL
  `).all();

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const program of programs.results) {
    const sessionDays = program.session_days.split(',').map(d => d.trim().toLowerCase());
    const weeksAhead = program.forward_view_weeks || 2;
    const capacity = program.default_capacity || 10;
    const startTime = program.start_time || '16:00';
    const endTime = program.end_time || '17:00';

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setUTCDate(today.getUTCDate() + weeksAhead * 7);

    const cursor = new Date(today);

    while (cursor <= endDate) {
      const dayName = DAY_NAMES[cursor.getUTCDay()];

      if (sessionDays.includes(dayName)) {
        const date = cursor.toISOString().split('T')[0];

        const existing = await db.prepare(
          'SELECT id FROM sessions WHERE date = ? AND program_id = ?'
        ).bind(date, program.id).first();

        if (existing) {
          totalSkipped++;
        } else {
          const year = new Date(date + 'T00:00:00Z').getUTCFullYear();
          const holidays = getFederalHolidays(year);
          const isCancelled = holidays.has(date) ? 1 : 0;
          const cancelReason = isCancelled ? 'Holiday' : null;

          const id = generateId();
          await db.prepare(`
            INSERT INTO sessions (id, program_id, date, day_of_week, start_time, end_time, capacity, is_cancelled, cancel_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(id, program.id, date, dayName, startTime, endTime, capacity, isCancelled, cancelReason).run();

          totalCreated++;
        }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return { created: totalCreated, skipped: totalSkipped };
}
