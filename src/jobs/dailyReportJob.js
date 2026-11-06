import cron from 'node-cron';
import { generateDailyReport } from '../services/reporter.js';
import { sendTelegramReport } from '../services/notifier.js';

let running = false;

/**
 * Builds and sends the report. Never crashes the app on failure.
 * @returns {Promise<boolean>}
 */
export async function runDailyReport() {
  if (running) {
    console.warn('[job] Previous report is still running, skipping this trigger.');
    return false;
  }
  running = true;
  const started = Date.now();
  try {
    console.log('[job] Building daily report...');
    const message = await generateDailyReport();
    const sent = await sendTelegramReport(message);
    console.log(`[job] Done (${Date.now() - started} ms, sent: ${sent})`);
    return sent;
  } catch (err) {
    console.error(`[job] Failed to build report: ${err.message}`);
    // Try to notify the owner about the failure as well
    await sendTelegramReport(`⚠️ <b>Report could not be generated</b>\n<code>${String(err.message).replace(/[<>&]/g, '')}</code>`);
    return false;
  } finally {
    running = false;
  }
}

/**
 * Starts the scheduled job based on REPORT_CRON_SCHEDULE.
 */
export function startDailyReportJob() {
  const schedule = process.env.REPORT_CRON_SCHEDULE || '0 19 * * *';
  const timezone = process.env.REPORT_TIMEZONE || 'Europe/Istanbul';

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid REPORT_CRON_SCHEDULE: "${schedule}"`);
  }

  const task = cron.schedule(schedule, runDailyReport, { timezone, name: 'daily-report' });
  console.log(`[job] Daily report scheduled → "${schedule}" (${timezone})`);
  return task;
}
