import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatChange, escapeHtml, renderTemplate, makeFormatters, renderReport } from '../src/services/reportFormatter.js';
import { parseReportsConfig } from '../src/config/reports.js';

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

test('renderTemplate: formats, escaping, unknown columns', () => {
  const fmt = makeFormatters('TRY');
  const row = { name: 'Desk <XL>', revenue: 15000, qty: 3, share: 0.256 };
  assert.match(renderTemplate('{name} — {revenue|currency} ({qty|number} pcs)', row, fmt), /^Desk &lt;XL&gt; — TRY\s?15,000\.00 \(3 pcs\)$/);
  assert.equal(renderTemplate('{share|percent}', row, fmt), '25.6%');
  assert.equal(renderTemplate('{missing}', row, fmt), '?');
});

// The shipped config doubles as a fixture, so it is always valid and renders as expected
const [daily] = parseReportsConfig(readFileSync('config/reports.yml', 'utf8'));
const date = new Date('2026-11-06T16:00:00Z'); // Friday 19:00 in Istanbul

test('renderReport: metrics with comparisons, lists', () => {
  const msg = renderReport(daily, {
    date,
    sections: [
      { rows: [
        { orders: 30, revenue: 90000, avg_order: 3000 },
        { orders: 20, revenue: 100000, avg_order: 5000 },
        { orders: 30, revenue: 60000, avg_order: 2000 },
      ] },
      { rows: [{ name: 'Desk <XL>', quantity: 3, revenue: 15000 }] },
      { rows: [
        { name: 'Toner', critical_stock: 10, icon: '🔴', status: 'OUT OF STOCK', total: 7 },
        { name: 'Paper', critical_stock: 15, icon: '🟠', status: '4 left', total: 7 },
      ] },
    ],
  });
  assert.match(msg, /📊 <b>DAILY SALES REPORT<\/b>\n📅 Friday, November 6, 2026/);
  assert.match(msg, /🛒 <b>Orders:<\/b> 30\n {4}<i>▲ \+50% vs yesterday · ＝ 0% vs last Friday<\/i>/);
  assert.match(msg, /💰 <b>Revenue:<\/b> TRY\s?90,000\.00/);
  assert.match(msg, /🥇 Desk &lt;XL&gt; — TRY\s?15,000\.00 \(3 pcs\)/);
  assert.match(msg, /⚠️ <b>Low Stock<\/b> \(7\)\n🔴 Toner — OUT OF STOCK \(min 10\)\n🟠 Paper — 4 left \(min 15\)/);
  assert.match(msg, /…and 5 more/);
  assert.match(msg, /19:00 · compared up to the same time/);
});

test('renderReport: {weekday} label follows the period, not the run time', () => {
  // Sent on Saturday morning about yesterday (Friday) → "vs last Friday"
  const report = { ...daily, period: 'yesterday' };
  const saturday = new Date('2026-11-07T06:00:00Z');
  const row = { orders: 1, revenue: 1, avg_order: 1 };
  const msg = renderReport(report, { date: saturday, sections: [{ rows: [row, row, row] }, { rows: [] }, { rows: [] }] });
  assert.match(msg, /📅 Friday, November 6, 2026/);
  assert.match(msg, /vs last Friday/);
  assert.doesNotMatch(msg, /compared up to the same time/);
});

test('renderReport: empty lists are hidden, zero day does not crash', () => {
  const zero = { orders: 0, revenue: 0, avg_order: 0 };
  const msg = renderReport(daily, { date, sections: [{ rows: [zero, zero, zero] }, { rows: [] }, { rows: [] }] });
  assert.match(msg, /Orders:<\/b> 0\n {4}<i>— vs yesterday/);
  assert.doesNotMatch(msg, /Top Products|Low Stock/);
});
