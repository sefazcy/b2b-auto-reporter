import pool from '../config/db.js';

// Today's orders. Uses a date range instead of DATE(created_at)
// so the index on created_at can be used.
const DAILY_SUMMARY_SQL = `
  SELECT
    COUNT(id)               AS total_orders,
    IFNULL(SUM(amount), 0)  AS total_revenue
  FROM orders
  WHERE created_at >= CURDATE()
    AND created_at <  CURDATE() + INTERVAL 1 DAY
    AND status <> 'cancelled'
`;

const LOCALE = 'en-US';

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Turns raw numbers into a Telegram (HTML) message.
 * @param {{ totalOrders: number, totalRevenue: number, date: Date }} data
 */
export function formatDailyReport({ totalOrders, totalRevenue, date }) {
  const tz = process.env.REPORT_TIMEZONE || 'Europe/Istanbul';
  const currency = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: process.env.REPORT_CURRENCY || 'TRY',
  });
  const integer = new Intl.NumberFormat(LOCALE);

  const day = date.toLocaleDateString(LOCALE, {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const time = date.toLocaleTimeString(LOCALE, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const average = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const line = '━━━━━━━━━━━━━━━━━━';

  return [
    '📊 <b>DAILY SALES REPORT</b>',
    `📅 ${escapeHtml(day)}`,
    line,
    `🛒 <b>Total Orders:</b> ${integer.format(totalOrders)}`,
    `💰 <b>Total Revenue:</b> ${currency.format(totalRevenue)}`,
    `📈 <b>Avg. Order Value:</b> ${currency.format(average)}`,
    line,
    `<i>🤖 Automated report • ${escapeHtml(time)}</i>`,
  ].join('\n');
}

/**
 * Fetches today's summary from the database and returns the formatted message.
 * @returns {Promise<string>}
 */
export async function generateDailyReport() {
  const [rows] = await pool.query(DAILY_SUMMARY_SQL);
  const row = rows[0] ?? {};

  return formatDailyReport({
    totalOrders: Number(row.total_orders) || 0,
    totalRevenue: Number(row.total_revenue) || 0,
    date: new Date(),
  });
}
