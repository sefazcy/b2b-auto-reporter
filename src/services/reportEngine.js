// Runs a report definition's queries against the database.
import pool from '../config/db.js';
import { PERIODS, shiftRange, applyRange } from './periods.js';

/**
 * @param {ReturnType<import('../config/reports.js').parseReportsConfig>[number]} report
 * @returns {Promise<{ date: Date, sections: { rows: object[] }[] }>}
 *   For metrics sections, rows[0] is the current period and rows[1..] the comparisons
 *   (in the order of report.compare). For list sections, rows are the query result.
 */
export async function runReportQueries(report) {
  const date = new Date();
  const base = PERIODS[report.period];
  const ranges = [base, ...report.compare.map((c) => shiftRange(base, c.shift))];

  const sections = await Promise.all(
    report.sections.map(async (section) => {
      if (section.type === 'metrics') {
        const results = await Promise.all(ranges.map((r) => pool.query(applyRange(section.query, r))));
        return { rows: results.map(([rows]) => rows[0] ?? {}) };
      }
      const [rows] = await pool.query(applyRange(section.query, base));
      return { rows };
    }),
  );

  return { date, sections };
}
