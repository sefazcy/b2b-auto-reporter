import 'dotenv/config';
import { testConnection, closePool } from './config/db.js';
import { loadReportsConfig } from './config/reports.js';
import { startReportJobs, runReport } from './jobs/reportJob.js';
import { startAlertJob, runAlertCheck } from './jobs/alertJob.js';

const isDev = (process.env.NODE_ENV || 'development') === 'development';
const alertsEnabled = (process.env.ALERTS_ENABLED ?? 'true') !== 'false';

// --test-run            → send every enabled report now (development only)
// --test-run=daily,...  → send only these reports
const testRunArg = process.argv.find((a) => a === '--test-run' || a.startsWith('--test-run='));
const testRunIds = testRunArg?.includes('=') ? testRunArg.split('=')[1].split(',').filter(Boolean) : null;
const alertCheck = process.argv.includes('--alert-check');

async function main() {
  console.log(`[app] Starting b2b-auto-reporter (mode: ${isDev ? 'development' : 'production'})`);

  // Validate config before anything else so mistakes show up immediately
  const reports = loadReportsConfig();
  console.log(`[app] Loaded ${reports.length} report(s): ${reports.map((r) => r.id + (r.enabled ? '' : ' (disabled)')).join(', ')}`);

  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[app] Could not connect to the database. Check your .env settings.');
    process.exit(1);
  }

  const tasks = startReportJobs(reports);
  if (alertsEnabled) tasks.push(startAlertJob());

  if (isDev && testRunArg) {
    const selected = testRunIds ? reports.filter((r) => testRunIds.includes(r.id)) : reports.filter((r) => r.enabled);
    const unknown = (testRunIds ?? []).filter((id) => !reports.some((r) => r.id === id));
    if (unknown.length) console.warn(`[app] Unknown report id(s): ${unknown.join(', ')}`);
    console.log(`[app] Test run: sending ${selected.map((r) => r.id).join(', ') || 'nothing'} now...`);
    for (const report of selected) await runReport(report);
  }
  if (alertsEnabled && alertCheck) {
    console.log('[app] Running alert checks now...');
    await runAlertCheck();
  }

  const shutdown = async (signal) => {
    console.log(`[app] Received ${signal}, shutting down...`);
    tasks.forEach((t) => t.stop());
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Global error boundary: log unexpected errors
process.on('unhandledRejection', (reason) => {
  console.error('[app] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[app] Uncaught exception:', err);
  process.exit(1);
});

main().catch((err) => {
  console.error(`[app] ${err.message}`);
  process.exit(1);
});
