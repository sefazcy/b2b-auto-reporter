import 'dotenv/config';
import { testConnection, closePool } from './config/db.js';
import { startDailyReportJob, runDailyReport } from './jobs/dailyReportJob.js';
import { startAlertJob, runAlertCheck } from './jobs/alertJob.js';

const isDev = (process.env.NODE_ENV || 'development') === 'development';
const testRun = process.argv.includes('--test-run');
const alertCheck = process.argv.includes('--alert-check');
const alertsEnabled = (process.env.ALERTS_ENABLED ?? 'true') !== 'false';

async function main() {
  console.log(`[app] Starting b2b-auto-reporter (mode: ${isDev ? 'development' : 'production'})`);

  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[app] Could not connect to the database. Check your .env settings.');
    process.exit(1);
  }

  const tasks = [startDailyReportJob()];
  if (alertsEnabled) tasks.push(startAlertJob());

  // In development, --test-run sends one report immediately
  if (isDev && testRun) {
    console.log('[app] Test run: sending a report now...');
    await runDailyReport();
  }
  // --alert-check runs the alert checks once immediately
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

main();
