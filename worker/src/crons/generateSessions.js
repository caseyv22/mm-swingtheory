import { generateId, getConfig } from '../lib/db.js';

// US Federal holidays as MM-DD strings (fixed-date ones)
// Floating holidays (MLK, Presidents, Memorial, Labor, Columbus, Thanksgiving)
// are calculated dynamically below
const FIXED_HOLIDAYS = [
  '01-01', // New Year's Day
  '06-19', // Juneteenth
  '07-04', // Independence Day
  '11-11', // Veterans Day
  '12-25', // Christmas Day
];

function getNthWeekday(year, month, weekday, n) {
  // Get the nth occurrence of a weekday in a month
  // weekday: 0=Sun, 1=Mon, ..., 6=Sat
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
  const date = new Date(Date.UTC(year, month, 0)); // last day of month
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().split('T')[0];
}

function getFederalHolidays(year) {
  const holidays = new Set();

  // Fixed holidays
  for (const mmdd of FIXED_HOLIDAYS) {
    holidays.add(`${year}-${mmdd}`);
  }

  // MLK Day: 3rd Monday of January
  holidays.add(getNthWeekday(year, 1, 1, 3));
  // Presidents Day: 3rd Monday of February
  holidays.add(getNthWeekday(year, 2, 1, 3));
  // Memorial Day: last Monday of May
  holidays.add(getLastWeekday(year, 5, 1));
  // Labor Day: 1st Monday of September
  holidays.add(getNthWeekday(year, 9, 1, 1));
  // Columbus Day: 2nd Monday of October
  holidays.add(getNthWeekday(year, 10, 1, 2));
  // Thanksgiving: 4th Thursday of November
  holidays.add(getNthWeekday(year, 11, 4, 4));

  return holidays;
}

const DAY_NAMES = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

export async function generateSessions(db) {
  const config = await getConfig(db);
  const sessionDays = config.session_days.split(',').map(d => d.trim().toLowerCase());
  const weeksAhead = config.forward_view_weeks || 2;
  const capacity = config.default_capacity || 10;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const endDate = new Date(today);
  endDate.setUTCDate(today.getUTCDate() + weeksAhead * 7);

  // Collect all target dates
  const targetDates = [];
  const cursor = new Date(today);

  while (cursor <= endDate) {
    const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][cursor.getUTCDay()];
    if (sessionDays.includes(dayName)) {
      targetDates.push({
        date: cursor.toISOString().split('T')[0],
        dayOfWeek: dayName,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  let created = 0;
  let skipped = 0;

  for (const { date, dayOfWeek } of targetDates) {
    // Check if session already exists
    const existing = await db
      .prepare('SELECT id FROM sessions WHERE date = ?')
      .bind(date)
      .first();

    if (existing) {
      skipped++;
      continue;
    }

    // Check if it's a federal holiday
    const year = new Date(date + 'T00:00:00Z').getUTCFullYear();
    const holidays = getFederalHolidays(year);
    const isCancelled = holidays.has(date) ? 1 : 0;
    const cancelReason = isCancelled ? 'Holiday' : null;

    const id = generateId();
    await db.prepare(`
      INSERT INTO sessions (id, date, day_of_week, capacity, is_cancelled, cancel_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, date, dayOfWeek, capacity, isCancelled, cancelReason).run();

    created++;
  }

  return { created, skipped };
}
