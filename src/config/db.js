import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  connectTimeout: 10_000,
  // Return DECIMAL columns as numbers instead of strings
  decimalNumbers: true,
});

/**
 * Checks the database connection on startup.
 * @returns {Promise<boolean>}
 */
export async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log(`[db] Connected → ${process.env.DB_HOST}/${process.env.DB_NAME}`);
    return true;
  } catch (err) {
    // Connecting to "localhost" tries IPv4 + IPv6 and may throw an AggregateError with an empty message
    const detail = err.message || err.errors?.map((e) => e.message).join(' | ') || 'unknown error';
    console.error(`[db] Connection error (${err.code ?? 'UNKNOWN'}): ${detail}`);
    return false;
  }
}

export async function closePool() {
  await pool.end();
}

export default pool;
