// Pure formatting functions (no database access) so they can be unit tested.

const LOCALE = 'en-US';
const LINE = '━━━━━━━━━━━━━━━━━━';

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

/**
 * @typedef {{ orders: number, revenue: number }} Period
 * @typedef {{
 *   date: Date,
 *   today: Period, yesterday: Period, lastWeek: Period,
 *   topProducts: { name: string, quantity: number, revenue: number }[],
 *   lowStock: { name: string, stock: number, criticalStock: number }[],
 *   lowStockTotal: number,
 * }} DailyReportData
 */

/**
 * Turns report data into a Telegram (HTML) message.
 * @param {DailyReportData} data
 * @param {{ timezone?: string, currency?: string }} [options]
 */
export function formatDailyReport(data, { timezone = 'Europe/Istanbul', currency = 'TRY' } = {}) {
  const { date, today, yesterday, lastWeek, topProducts = [], lowStock = [], lowStockTotal = lowStock.length } = data;
  const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency });
  const int = new Intl.NumberFormat(LOCALE);

  const day = date.toLocaleDateString(LOCALE, {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const weekday = date.toLocaleDateString(LOCALE, { timeZone: timezone, weekday: 'long' });
  const time = date.toLocaleTimeString(LOCALE, { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });

  const aov = (p) => (p.orders > 0 ? p.revenue / p.orders : 0);
  const compare = (cur, y, w) =>
    `    <i>${formatChange(cur, y)} vs yesterday · ${formatChange(cur, w)} vs last ${weekday}</i>`;

  const lines = [
    '📊 <b>DAILY SALES REPORT</b>',
    `📅 ${escapeHtml(day)}`,
    LINE,
    `🛒 <b>Orders:</b> ${int.format(today.orders)}`,
    compare(today.orders, yesterday.orders, lastWeek.orders),
    `💰 <b>Revenue:</b> ${money.format(today.revenue)}`,
    compare(today.revenue, yesterday.revenue, lastWeek.revenue),
    `📈 <b>Avg. Order Value:</b> ${money.format(aov(today))}`,
    compare(aov(today), aov(yesterday), aov(lastWeek)),
  ];

  if (topProducts.length) {
    lines.push(LINE, '🏆 <b>Top Products</b>');
    const medals = ['🥇', '🥈', '🥉'];
    topProducts.forEach((p, i) => {
      lines.push(`${medals[i] ?? `${i + 1}.`} ${escapeHtml(p.name)} — ${money.format(p.revenue)} (${int.format(p.quantity)} pcs)`);
    });
  }

  if (lowStock.length) {
    lines.push(LINE, `⚠️ <b>Low Stock</b> (${int.format(lowStockTotal)} product${lowStockTotal === 1 ? '' : 's'})`);
    for (const p of lowStock) {
      const icon = p.stock === 0 ? '🔴' : '🟠';
      const left = p.stock === 0 ? 'OUT OF STOCK' : `${int.format(p.stock)} left`;
      lines.push(`${icon} ${escapeHtml(p.name)} — ${left} (min ${int.format(p.criticalStock)})`);
    }
    if (lowStockTotal > lowStock.length) {
      lines.push(`<i>…and ${int.format(lowStockTotal - lowStock.length)} more</i>`);
    }
  }

  lines.push(LINE, `<i>🤖 Automated report • ${escapeHtml(time)} · compared up to the same time</i>`);
  return lines.join('\n');
}
