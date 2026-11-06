import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHourRange, parseDays, zonedClock, formatDuration,
  diffOutOfStock, formatStockAlert, evaluateOrderGap,
} from '../src/services/alerts.js';

test('parseHourRange / parseDays', () => {
  assert.deepEqual(parseHourRange('9-18'), { start: 9, end: 18 });
  assert.throws(() => parseHourRange('18-9'));
  assert.throws(() => parseHourRange('nine'));
  assert.deepEqual([...parseDays('1-5')], [1, 2, 3, 4, 5]);
  assert.deepEqual([...parseDays('1,3,6-7')], [1, 3, 6, 7]);
  assert.throws(() => parseDays('0-8'));
});

test('zonedClock uses the given timezone', () => {
  // 2026-11-06 07:30 UTC = Friday 10:30 in Istanbul (UTC+3)
  assert.deepEqual(zonedClock(new Date('2026-11-06T07:30:00Z'), 'Europe/Istanbul'), { isoDay: 5, minutesOfDay: 630 });
  // 2026-11-07 22:00 UTC = Monday 01:00 in Istanbul
  assert.deepEqual(zonedClock(new Date('2026-11-08T22:00:00Z'), 'Europe/Istanbul'), { isoDay: 1, minutesOfDay: 60 });
});

test('formatDuration', () => {
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(190), '3h 10m');
});

test('diffOutOfStock: alerts once, reports restocks', () => {
  const rows = [
    { id: 1, name: 'Toner', stock: 0, critical_stock: 10 },
    { id: 2, name: 'Paper', stock: 0, critical_stock: 5 },
    { id: 3, name: 'Desk', stock: 12, critical_stock: 3 },
  ];
  const diff = diffOutOfStock([2, 3], rows);
  assert.deepEqual(diff.newlyOut.map((p) => p.id), [1]); // 2 was already alerted
  assert.deepEqual(diff.restocked.map((p) => p.id), [3]);
  assert.deepEqual(diff.nowOut, [1, 2]);

  const msg = formatStockAlert(diff);
  assert.match(msg, /OUT OF STOCK<\/b>\n• Toner <i>\(min 10\)<\/i>/);
  assert.match(msg, /Back in stock<\/b>\n• Desk — 12 pcs/);
});

const config = { days: new Set([1, 2, 3, 4, 5]), start: 9, end: 18, thresholdMinutes: 180 };
const noAlert = { alertedForOrderId: null };

test('evaluateOrderGap: alerts after threshold in business hours', () => {
  const r = evaluateOrderGap({
    minutesSinceLastOrder: 200, lastOrderId: 50,
    clock: { isoDay: 3, minutesOfDay: 15 * 60 }, config, state: noAlert,
  });
  assert.equal(r.action, 'alert');
  assert.equal(r.gapMinutes, 200);
  assert.deepEqual(r.nextState, { alertedForOrderId: 50 });
});

test('evaluateOrderGap: overnight silence is not counted', () => {
  // Last order yesterday evening, now 10:00 → only 60 min of business hours passed
  const r = evaluateOrderGap({
    minutesSinceLastOrder: 900, lastOrderId: 50,
    clock: { isoDay: 3, minutesOfDay: 10 * 60 }, config, state: noAlert,
  });
  assert.equal(r.action, null);
});

test('evaluateOrderGap: quiet outside business hours and on weekends', () => {
  for (const clock of [{ isoDay: 3, minutesOfDay: 20 * 60 }, { isoDay: 6, minutesOfDay: 14 * 60 }]) {
    const r = evaluateOrderGap({ minutesSinceLastOrder: 600, lastOrderId: 50, clock, config, state: noAlert });
    assert.equal(r.action, null);
  }
});

test('evaluateOrderGap: alerts only once, resolves on new order', () => {
  const clock = { isoDay: 3, minutesOfDay: 16 * 60 };
  const alerted = { alertedForOrderId: 50 };
  assert.equal(evaluateOrderGap({ minutesSinceLastOrder: 400, lastOrderId: 50, clock, config, state: alerted }).action, null);

  const r = evaluateOrderGap({ minutesSinceLastOrder: 1, lastOrderId: 51, clock, config, state: alerted });
  assert.equal(r.action, 'resolved');
  assert.deepEqual(r.nextState, { alertedForOrderId: null });
});
