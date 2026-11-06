import pool from '../config/db.js';
import { formatDailyReport } from './reportFormatter.js';

const TOP_PRODUCTS_LIMIT = 3;
const LOW_STOCK_LIMIT = 5;

// Today so far vs. yesterday and the same weekday last week, each up to the
// same time of day. Comparing a partial day with a full day would be misleading.
// Range conditions (instead of DATE(created_at)) let MySQL use the created_at index.
const PERIOD_SUMMARY_SQL = `
  SELECT
    SUM(created_at >= CURDATE())                                                AS today_orders,
    SUM(IF(created_at >= CURDATE(), amount, 0))                                 AS today_revenue,
    SUM(created_at >= CURDATE() - INTERVAL 1 DAY AND created_at <= NOW() - INTERVAL 1 DAY)               AS yesterday_orders,
    SUM(IF(created_at >= CURDATE() - INTERVAL 1 DAY AND created_at <= NOW() - INTERVAL 1 DAY, amount, 0)) AS yesterday_revenue,
    SUM(created_at >= CURDATE() - INTERVAL 7 DAY AND created_at <= NOW() - INTERVAL 7 DAY)               AS last_week_orders,
    SUM(IF(created_at >= CURDATE() - INTERVAL 7 DAY AND created_at <= NOW() - INTERVAL 7 DAY, amount, 0)) AS last_week_revenue
  FROM orders
  WHERE created_at >= CURDATE() - INTERVAL 7 DAY
    AND created_at <= NOW()
    AND status <> 'cancelled'
`;

const TOP_PRODUCTS_SQL = `
  SELECT p.name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.unit_price) AS revenue
  FROM order_items oi
  JOIN orders   o ON o.id = oi.order_id
  JOIN products p ON p.id = oi.product_id
  WHERE o.created_at >= CURDATE()
    AND o.status <> 'cancelled'
  GROUP BY p.id, p.name
  ORDER BY revenue DESC
  LIMIT ?
`;

// Most urgent first: out of stock, then lowest stock relative to its critical level
const LOW_STOCK_SQL = `
  SELECT name, stock, critical_stock, COUNT(*) OVER () AS total
  FROM products
  WHERE stock <= critical_stock
  ORDER BY stock / NULLIF(critical_stock, 0) ASC, stock ASC
  LIMIT ?
`;

const num = (v) => Number(v) || 0;

/**
 * Fetches all daily report data from the database.
 * @returns {Promise<import('./reportFormatter.js').DailyReportData>}
 */
export async function fetchDailyReportData() {
  const [[[summary]], [topRows], [stockRows]] = await Promise.all([
    pool.query(PERIOD_SUMMARY_SQL),
    pool.query(TOP_PRODUCTS_SQL, [TOP_PRODUCTS_LIMIT]),
    pool.query(LOW_STOCK_SQL, [LOW_STOCK_LIMIT]),
  ]);

  return {
    date: new Date(),
    today: { orders: num(summary?.today_orders), revenue: num(summary?.today_revenue) },
    yesterday: { orders: num(summary?.yesterday_orders), revenue: num(summary?.yesterday_revenue) },
    lastWeek: { orders: num(summary?.last_week_orders), revenue: num(summary?.last_week_revenue) },
    topProducts: topRows.map((r) => ({ name: r.name, quantity: num(r.quantity), revenue: num(r.revenue) })),
    lowStock: stockRows.map((r) => ({ name: r.name, stock: num(r.stock), criticalStock: num(r.critical_stock) })),
    lowStockTotal: num(stockRows[0]?.total),
  };
}

/**
 * Builds the formatted daily report message.
 * @returns {Promise<string>}
 */
export async function generateDailyReport() {
  const data = await fetchDailyReportData();
  return formatDailyReport(data, {
    timezone: process.env.REPORT_TIMEZONE || 'Europe/Istanbul',
    currency: process.env.REPORT_CURRENCY || 'TRY',
  });
}
