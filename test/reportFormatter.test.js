import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatChange, formatDailyReport, escapeHtml } from '../src/services/reportFormatter.js';

test('formatChange: increase, decrease, no change', () => {
  assert.equal(formatChange(150, 100), '▲ +50%');
  assert.equal(formatChange(80, 100), '▼ −20%');
  assert.equal(formatChange(100, 100), '＝ 0%');
  assert.equal(formatChange(105, 100), '▲ +5%');
  assert.equal(formatChange(1053, 1000), '▲ +5.3%');
});

test('formatChange: missing baseline', () => {
  assert.equal(formatChange(10, 0), '▲ new');
  assert.equal(formatChange(0, 0), '—');
});

test('escapeHtml escapes Telegram HTML special characters', () => {
  assert.equal(escapeHtml('A & B <C>'), 'A &amp; B &lt;C&gt;');
});

const base = {
  date: new Date('2026-11-06T16:00:00Z'), // Friday 19:00 in Istanbul
  today: { orders: 30, revenue: 90000 },
  yesterday: { orders: 20, revenue: 100000 },
  lastWeek: { orders: 30, revenue: 60000 },
};

test('formatDailyReport: summary and comparisons', () => {
  const msg = formatDailyReport(base);
  assert.match(msg, /Friday, November 6, 2026/);
  assert.match(msg, /Orders:<\/b> 30/);
  assert.match(msg, /▲ \+50% vs yesterday · ＝ 0% vs last Friday/);
  assert.match(msg, /Revenue:<\/b> TRY\s?90,000\.00/);
  assert.match(msg, /19:00/);
  assert.doesNotMatch(msg, /Top Products|Low Stock/);
});

test('formatDailyReport: top products and low stock sections', () => {
  const msg = formatDailyReport({
    ...base,
    topProducts: [{ name: 'Desk <XL>', quantity: 3, revenue: 15000 }],
    lowStock: [
      { name: 'Toner', stock: 0, criticalStock: 10 },
      { name: 'Paper', stock: 4, criticalStock: 15 },
    ],
    lowStockTotal: 7,
  });
  assert.match(msg, /🥇 Desk &lt;XL&gt; — TRY\s?15,000\.00 \(3 pcs\)/);
  assert.match(msg, /Low Stock<\/b> \(7 products\)/);
  assert.match(msg, /🔴 Toner — OUT OF STOCK \(min 10\)/);
  assert.match(msg, /🟠 Paper — 4 left \(min 15\)/);
  assert.match(msg, /…and 5 more/);
});

test('formatDailyReport: empty day does not crash', () => {
  const zero = { orders: 0, revenue: 0 };
  const msg = formatDailyReport({ date: base.date, today: zero, yesterday: zero, lastWeek: zero });
  assert.match(msg, /Orders:<\/b> 0/);
  assert.match(msg, /— vs yesterday/);
});
