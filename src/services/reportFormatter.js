// Pure formatting functions (no database access) so they can be unit tested.
import { PERIODS, shiftDate } from './periods.js';

const LOCALE = 'en-US';
const LINE = '━━━━━━━━━━━━━━━━━━';
const MEDALS = ['🥇', '🥈', '🥉'];

export function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Formats the change between two values, e.g. "▲ +12.5%", "▼ −4%", "＝ 0%".
 * Returns "—" when there is no baseline to compare against.
 */
export function formatChange(current, previous) {
  if (!previous) return current ? '▲ new' : '—';
  const ratio = (current - previous) / previous;
  const pct = new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    maximumFractionDigits: Math.abs(ratio) < 0.1 ? 1 : 0,
    signDisplay: 'exceptZero',
  }).format(ratio);
  if (pct === '0%') return '＝ 0%';
  return `${ratio > 0 ? '▲' : '▼'} ${pct.replace('-', '−')}`;
}

export function makeFormatters(currency = 'TRY') {
  const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency });
  const int = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
  const pct = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });
  return {
    number: (v) => int.format(Number(v) || 0),
    currency: (v) => money.format(Number(v) || 0),
    percent: (v) => pct.format(Number(v) || 0),
    text: (v) => String(v ?? ''),
  };
}

/**
 * Fills "{column}" / "{column|format}" placeholders from a row. Values are HTML-escaped;
 * the template itself is trusted config and may contain Telegram HTML tags.
 */
export function renderTemplate(template, row, formatters) {
  return template.replace(/\{(\w+)(?:\|(\w+))?\}/g, (match, column, fmt) => {
    if (!(column in row)) return '?';
    const value = row[column];
    return escapeHtml(fmt ? formatters[fmt](value) : value ?? '');
  });
}

function renderMetrics(section, rows, report, ctx) {
  const [current, ...previous] = rows;
  const ref = PERIODS[report.period].refDate(ctx.date);
  const labels = report.compare.map((c) => c.label.replace('{weekday}', ctx.weekdayOf(shiftDate(ref, c.shift))));
  const lines = [];
  for (const m of section.metrics) {
    const value = Number(current[m.column]) || 0;
    lines.push(`${m.emoji ? `${m.emoji} ` : ''}<b>${escapeHtml(m.label)}:</b> ${ctx.fmt[m.format](current[m.column])}`);
    if (previous.length) {
      const parts = previous.map((p, i) => `${formatChange(value, Number(p[m.column]) || 0)} vs ${escapeHtml(labels[i])}`);
      lines.push(`    <i>${parts.join(' · ')}</i>`);
    }
  }
  return lines;
}

function renderList(section, rows, ctx) {
  const total = section.totalColumn && rows.length ? Number(rows[0][section.totalColumn]) || rows.length : rows.length;
  if (!rows.length && !section.emptyText) return null;

  const title = `${section.emoji ? `${section.emoji} ` : ''}<b>${escapeHtml(section.title)}</b>`;
  const lines = [section.totalColumn && rows.length ? `${title} (${ctx.fmt.number(total)})` : title];
  if (!rows.length) {
    lines.push(`<i>${escapeHtml(section.emptyText)}</i>`);
    return lines;
  }
  rows.forEach((row, i) => {
    const bullet = section.ranked ? MEDALS[i] ?? `${i + 1}.` : section.bullet;
    const text = renderTemplate(section.item, row, ctx.fmt);
    lines.push(bullet ? `${bullet} ${text}` : text);
  });
  if (total > rows.length) lines.push(`<i>…and ${ctx.fmt.number(total - rows.length)} more</i>`);
  return lines;
}

/**
 * Turns a report definition and its query results into a Telegram (HTML) message.
 * @param {object} report normalized report definition
 * @param {{ date: Date, sections: { rows: object[] }[] }} result
 * @param {{ timezone?: string, currency?: string }} [options]
 */
export function renderReport(report, result, { timezone = 'Europe/Istanbul', currency = 'TRY' } = {}) {
  const { date } = result;
  const ctx = {
    date,
    fmt: makeFormatters(currency),
    weekdayOf: (d) => d.toLocaleDateString(LOCALE, { timeZone: timezone, weekday: 'long' }),
  };
  const period = PERIODS[report.period];
  const time = date.toLocaleTimeString(LOCALE, { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });

  const blocks = [[
    `${report.emoji ? `${report.emoji} ` : ''}<b>${escapeHtml(report.title)}</b>`,
    `📅 ${escapeHtml(period.describe(date, timezone))}`,
  ]];
  report.sections.forEach((section, i) => {
    const rows = result.sections[i]?.rows ?? [];
    const lines = section.type === 'metrics' ? renderMetrics(section, rows, report, ctx) : renderList(section, rows, ctx);
    if (lines?.length) blocks.push(lines);
  });

  const note = period.toDate && report.compare.length ? ' · compared up to the same time' : '';
  blocks.push([`<i>🤖 Automated report • ${escapeHtml(time)}${note}</i>`]);

  return blocks.map((b) => b.join('\n')).join(`\n${LINE}\n`);
}
