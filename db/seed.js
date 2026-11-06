// Sample data generator: fills business_db with the last N days of orders.
// Usage: npm run seed   (requires a user with write access)
//   Falls back to root / empty password (XAMPP default) unless SEED_DB_USER / SEED_DB_PASSWORD are set.
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DAYS = 60;

const PRODUCTS = [
  ['A4 Copy Paper (5 reams)', 'Stationery', 649.9],
  ['HP 85A Compatible Toner', 'Supplies', 389.0],
  ['Ergonomic Office Chair', 'Furniture', 4299.0],
  ['Office Desk 140cm', 'Furniture', 5490.0],
  ['Wireless Mouse', 'Electronics', 349.9],
  ['Mechanical Keyboard', 'Electronics', 1899.0],
  ['27" Monitor', 'Electronics', 7999.0],
  ['USB-C Hub 7-in-1', 'Electronics', 899.0],
  ['File Folders (10 pack)', 'Stationery', 279.9],
  ['Ballpoint Pens (50 pack)', 'Stationery', 199.9],
  ['Stapler', 'Stationery', 159.9],
  ['Whiteboard 90x120', 'Office Equipment', 1249.0],
  ['Paper Shredder', 'Office Equipment', 2799.0],
  ['Label Printer', 'Office Equipment', 2199.0],
  ['Filter Coffee 1kg', 'Kitchen', 549.0],
  ['Black Tea 1kg', 'Kitchen', 289.0],
  ['Paper Cups (1000 pack)', 'Kitchen', 459.0],
  ['Paper Towels (12 pack)', 'Cleaning', 239.9],
  ['All-Purpose Cleaner 5L', 'Cleaning', 189.9],
  ['Trash Bags (100 pack)', 'Cleaning', 129.9],
  ['Laptop Bag', 'Accessories', 799.0],
  ['Monitor Stand', 'Accessories', 649.0],
  ['Power Strip (5 outlets)', 'Electronics', 299.0],
  ['1080p Webcam', 'Electronics', 1199.0],
  ['Headset with Microphone', 'Electronics', 999.0],
];

const CUSTOMERS = [
  'Atlas Logistics Inc.', 'Star Architecture', 'Harbor Law Office', 'North Software Ltd.',
  'Aegean Accounting', 'Taurus Foods', 'Blue Agency', 'Cloud Consulting', 'Anatolia Insurance',
  'Marmara Dental Clinic', 'Summit Construction', 'Rock Education Group', 'Nature Pharmacy', 'Peak Automotive',
];

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const pad = (n) => String(n).padStart(2, '0');
const toSql = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.SEED_DB_USER || 'root',
    password: process.env.SEED_DB_PASSWORD || '',
    database: process.env.DB_NAME || 'business_db',
  });

  console.log('[seed] Clearing existing data...');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('TRUNCATE order_items');
  await conn.query('TRUNCATE orders');
  await conn.query('TRUNCATE products');
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // Products: a few are deliberately below their critical stock level
  const productRows = PRODUCTS.map(([name, category, price], i) => {
    const critical = rand(5, 20);
    const stock = i % 7 === 3 ? rand(0, critical - 1) : rand(critical + 5, 300);
    return [name, category, price, stock, critical];
  });
  await conn.query('INSERT INTO products (name, category, price, stock, critical_stock) VALUES ?', [productRows]);

  // Make the first products more popular
  const weightedProducts = productRows.flatMap((_, i) => Array(i < 10 ? 4 : 1).fill(i + 1));

  const now = new Date();
  let orderCount = 0;
  await conn.beginTransaction();

  for (let day = DAYS; day >= 0; day--) {
    const date = new Date(now);
    date.setDate(now.getDate() - day);
    const isWeekend = [0, 6].includes(date.getDay());
    // B2B: busy on weekdays, quiet on weekends, with a slight growth trend
    const trend = 1 + ((DAYS - day) / DAYS) * 0.25;
    const count = Math.round((isWeekend ? rand(3, 8) : rand(15, 35)) * trend);

    for (let o = 0; o < count; o++) {
      let time = new Date(date);
      time.setHours(rand(8, 19), rand(0, 59), rand(0, 59), 0);
      if (day === 0) {
        // Demo: spread today's orders between midnight and now,
        // so "today" has data no matter when the script runs.
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        time = new Date(startOfDay.getTime() + Math.random() * (now - startOfDay));
      }

      const itemCount = rand(1, 4);
      const items = [];
      let total = 0;
      for (let k = 0; k < itemCount; k++) {
        const productId = pick(weightedProducts);
        const price = productRows[productId - 1][2];
        const quantity = rand(1, 5);
        total += price * quantity;
        items.push([productId, quantity, price]);
      }

      const r = Math.random();
      const status = r < 0.06 ? 'cancelled' : day === 0 && r < 0.3 ? 'processing' : 'completed';

      const [res] = await conn.query(
        'INSERT INTO orders (customer, amount, status, created_at) VALUES (?, ?, ?, ?)',
        [pick(CUSTOMERS), total.toFixed(2), status, toSql(time)],
      );
      await conn.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ?',
        [items.map((item) => [res.insertId, ...item])],
      );
      orderCount++;
    }
  }

  await conn.commit();
  console.log(`[seed] Inserted ${productRows.length} products and ${orderCount} orders (last ${DAYS} days).`);
  await conn.end();
}

main().catch((err) => {
  console.error('[seed] Error:', err.message);
  process.exit(1);
});
