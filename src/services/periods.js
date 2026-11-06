// Report periods. Ranges are SQL expressions evaluated by the database, so
// "today" always means today in the database server's timezone (no Node/MySQL
// timezone mismatch). Ranges are half-open: from <= created_at < to.

const LOCALE = 'en-US';
const DAY_MS = 24 * 60 * 60 * 1000;

const longDate = (date, timeZone) =>
  date.toLocaleDateString(LOCALE, { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const ISO_DAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Monday and Sunday of the week before `now`, in the given timezone. */
function lastWeekBounds(now, timeZone) {
  const isoDay = ISO_DAY[new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now)];
  const monday = new Date(now.getTime() - (isoDay - 1 + 7) * DAY_MS);
  return { monday, sunday: new Date(monday.getTime() + 6 * DAY_MS) };
}

// refDate: a date inside the period (used for labels like "vs last Friday")
export const PERIODS = {
  today: {
    from: 'CURDATE()',
    to: 'NOW()',
    toDate: true, // still in progress: comparisons are cut at the same time of day
    refDate: (now) => now,
    describe: (now, tz) => longDate(now, tz),
  },
  yesterday: {
    from: 'CURDATE() - INTERVAL 1 DAY',
    to: 'CURDATE()',
    toDate: false,
    refDate: (now) => new Date(now.getTime() - DAY_MS),
    describe: (now, tz) => longDate(new Date(now.getTime() - DAY_MS), tz),
  },
  // Previous ISO week, Monday 00:00 → Monday 00:00 (WEEKDAY(): Monday = 0)
  last_week: {
    from: 'CURDATE() - INTERVAL (WEEKDAY(CURDATE()) + 7) DAY',
    to: 'CURDATE() - INTERVAL WEEKDAY(CURDATE()) DAY',
    toDate: false,
    refDate: (now) => new Date(now.getTime() - 7 * DAY_MS),
    describe: (now, tz) => {
      const { monday, sunday } = lastWeekBounds(now, tz);
      const range = new Intl.DateTimeFormat(LOCALE, { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' })
        .formatRange(monday, sunday);
      return `Week of ${range} (Mon–Sun)`;
    },
  },
};

const SHIFT_RE = /^\s*(\d{1,3})\s+(DAY|WEEK|MONTH)S?\s*$/i;

/** "7 DAY" → { amount: 7, unit: 'DAY' }. Validated because it ends up in SQL. */
export function parseShift(shift) {
  const m = SHIFT_RE.exec(String(shift));
  if (!m) throw new Error(`Invalid shift "${shift}" (expected e.g. "1 DAY", "1 WEEK", "1 MONTH")`);
  return { amount: Number(m[1]), unit: m[2].toUpperCase() };
}

/** Moves a range back in time by a shift, e.g. "7 DAY" → same period last week. */
export function shiftRange(range, shift) {
  const { amount, unit } = parseShift(shift);
  const back = (expr) => `(${expr}) - INTERVAL ${amount} ${unit}`;
  return { from: back(range.from), to: back(range.to) };
}

/** Shifts a JS date (for labels only, e.g. "vs last Friday"). */
export function shiftDate(date, shift) {
  const { amount, unit } = parseShift(shift);
  const d = new Date(date);
  if (unit === 'MONTH') d.setMonth(d.getMonth() - amount);
  else d.setTime(d.getTime() - amount * (unit === 'WEEK' ? 7 : 1) * DAY_MS);
  return d;
}

/** Replaces {{from}} / {{to}} placeholders in a query with the range's SQL expressions. */
export function applyRange(sql, range) {
  return sql.replaceAll('{{from}}', `(${range.from})`).replaceAll('{{to}}', `(${range.to})`);
}
