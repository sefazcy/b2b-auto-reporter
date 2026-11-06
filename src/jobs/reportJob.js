import cron from 'node-cron';
import { runReportQueries } from '../services/reportEngine.js';
import { renderReport } from '../services/reportFormatter.js';
import { sendTelegramReport } from '../services/notifier.js';
import { pingHeartbeat } from '../services/heartbeat.js';
import { escapeHtml } from '../services/reportFormatter.js';

const running = new Set();

const formatOptions = () => ({
  timezone: process.env.REPORT_TIMEZONE || 'Europe/Istanbul',
  currency: process.env.REPORT_CURRENCY || 'TRY',
});

/** Builds the message for a report (no sending). */
export async function buildReport(report) {
  const result = await runReportQueries(report);
  return renderReport(report, result, formatOptions());
}

/**
 * Builds and sends one report. Never crashes the app on failure.
 * @returns {Promise<boolean>}
 */
export async function runReport(report) {
  if (running.has(report.id)) {
    console.warn(`[report:${report.id}] Previous run is still in progress, skipping.`);
    return false;
  }
  running.add(report.id);
  const started = Date.now();
  try {
    console.log(`[report:${report.id}] Building...`);
    const sent = await sendTelegramReport(await buildReport(report));
    console.log(`[report:${report.id}] Done (${Date.now() - started} ms, sent: ${sent})`);
    await pingHeartbeat(sent ? 'ok' : 'fail');
    return sent;
  } catch (err) {
    console.error(`[report:${report.id}] Failed: ${err.message}`);
    await sendTelegramReport(
      `⚠️ <b>${escapeHtml(report.title)} could not be generated</b>\n<code>${escapeHtml(err.message)}</code>`,
    );
    await pingHeartbeat('fail');
    return false;
  } finally {
    running.delete(report.id);
  }
}

/** Schedules every enabled report on its own cron expression. */
export function startReportJobs(reports) {
  const timezone = formatOptions().timezone;
  return reports
    .filter((r) => r.enabled)
    .map((report) => {
      const task = cron.schedule(report.schedule, () => runReport(report), { timezone, name: `report-${report.id}` });
      console.log(`[report:${report.id}] Scheduled → "${report.schedule}" (${timezone})`);
      return task;
    });
}
