// Instant alert checks. Decision logic is kept in pure functions so it can be unit tested;
// the async check* functions only fetch data and delegate to them.
import pool from '../config/db.js';
import { escapeHtml } from './reportFormatter.js';

// ---------- config parsing ----------

/** "9-18" → { start: 9, end: 18 } (hours, end exclusive) */
export function parseHourRange(value = '9-18') {
  const m = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/.exec(value);
  if (!m) throw new Error(`Invalid hour range: "${value}" (expected e.g. 9-18)`);
  const [start, end] = [Number(m[1]), Number(m[2])];
  if (start >= end || end > 24) throw new Error(`Invalid hour range: "${value}"`);
  return { start, end };
}

/** ISO weekdays (1 = Monday … 7 = Sunday): "1-5" or "1,3,5" → Set */
export function parseDays(value = '1-5') {
  const days = new Set();
  for (const part of value.split(',')) {
    const [a, b = a] = part.split('-').map((s) => Number(s.trim()));
    if (!(a >= 1 && b <= 7 && a <= b)) throw new Error(`Invalid day list: "${value}" (expected e.g. 1-5)`);
    for (let d = a; d <= b; d++) days.add(d);
  }
  return days;
}

const ISO_DAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Weekday and minutes since midnight for a date in a given timezone. */
export function zonedClock(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { isoDay: ISO_DAY[parts.weekday], minutesOfDay: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ---------- out of stock ----------

/**
 * @param {number[]} alertedIds products we already alerted about
 * @param {{ id: number, name: string, stock: number, critical_stock: number }[]} rows
 *   products that are out of stock now, plus the previously alerted ones
 */
export function diffOutOfStock(alertedIds, rows) {
  const alerted = new Set(alertedIds);
  const newlyOut = rows.filter((r) => r.stock <= 0 && !alerted.has(r.id));
  const restocked = rows.filter((r) => r.stock > 0 && alerted.has(r.id));
  const nowOut = rows.filter((r) => r.stock <= 0).map((r) => r.id);
  return { newlyOut, restocked, nowOut };
}

export function formatStockAlert({ newlyOut, restocked }) {
  const lines = [];
  if (newlyOut.length) {
    lines.push('🔴 <b>OUT OF STOCK</b>');
    for (const p of newlyOut) lines.push(`• ${escapeHtml(p.name)} <i>(min ${p.critical_stock})</i>`);
  }
  if (restocked.length) {
    if (lines.length) lines.push('');
    lines.push('✅ <b>Back in stock</b>');
    for (const p of restocked) lines.push(`• ${escapeHtml(p.name)} — ${p.stock} pcs`);
  }
  return lines.join('\n');
}

export async function checkOutOfStock(alertedIds) {
  const [rows] = await pool.query(
    'SELECT id, name, stock, critical_stock FROM products WHERE stock <= 0 OR id IN (?) ORDER BY name',
    [alertedIds.length ? alertedIds : [-1]],
  );
  const diff = diffOutOfStock(alertedIds, rows);
  const message = diff.newlyOut.length || diff.restocked.length ? formatStockAlert(diff) : null;
  return { message, nextAlertedIds: diff.nowOut };
}

// ---------- no orders ----------

/**
 * Decides whether to raise or resolve a "no orders" alert.
 * Alerts once per silence; resolves when a newer order arrives.
 * @param {{
 *   minutesSinceLastOrder: number | null, lastOrderId: number | null,
 *   clock: { isoDay: number, minutesOfDay: number },
 *   config: { days: Set<number>, start: number, end: number, thresholdMinutes: number },
 *   state: { alertedForOrderId: number | null },
 * }} input
 * @returns {{ action: 'alert' | 'resolved' | null, gapMinutes?: number, nextState: object }}
 */
export function evaluateOrderGap({ minutesSinceLastOrder, lastOrderId, clock, config, state }) {
  const alertedFor = state?.alertedForOrderId ?? null;
  const lastId = lastOrderId ?? 0;

  if (alertedFor !== null) {
    return lastId !== alertedFor
      ? { action: 'resolved', nextState: { alertedForOrderId: null } }
      : { action: null, nextState: state };
  }

  const open = config.start * 60;
  const inHours = config.days.has(clock.isoDay) && clock.minutesOfDay >= open && clock.minutesOfDay < config.end * 60;
  if (!inHours) return { action: null, nextState: state };

  // Silence is only counted from the start of business hours (overnight quiet is normal)
  const gapMinutes = Math.min(minutesSinceLastOrder ?? Infinity, clock.minutesOfDay - open);
  if (gapMinutes >= config.thresholdMinutes) {
    return { action: 'alert', gapMinutes, nextState: { alertedForOrderId: lastId } };
  }
  return { action: null, nextState: state };
}

export async function checkOrderGap(state, { timezone, now = new Date() } = {}) {
  const config = {
    ...parseHourRange(process.env.ALERT_BUSINESS_HOURS),
    days: parseDays(process.env.ALERT_BUSINESS_DAYS),
    thresholdMinutes: Math.round(Number(process.env.ALERT_NO_ORDER_HOURS || 3) * 60),
  };
  // Time difference is computed in SQL so Node and MySQL timezones can't disagree
  const [[row]] = await pool.query(
    'SELECT MAX(id) AS last_id, TIMESTAMPDIFF(MINUTE, MAX(created_at), NOW()) AS minutes_since FROM orders',
  );
  const result = evaluateOrderGap({
    minutesSinceLastOrder: row?.minutes_since ?? null,
    lastOrderId: row?.last_id ?? null,
    clock: zonedClock(now, timezone),
    config,
    state,
  });

  let message = null;
  if (result.action === 'alert') {
    message = [
      `⏰ <b>NO ORDERS FOR ${formatDuration(result.gapMinutes)}</b>`,
      'No new orders during business hours. Check that the website and payments are working.',
    ].join('\n');
  } else if (result.action === 'resolved') {
    message = '✅ <b>Orders are coming in again</b>\nA new order was received.';
  }
  return { message, nextState: result.nextState };
}
