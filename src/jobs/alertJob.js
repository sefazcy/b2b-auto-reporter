import cron from 'node-cron';
import { checkOutOfStock, checkOrderGap, parseHourRange, parseDays } from '../services/alerts.js';
import { loadAlertState, saveAlertState } from '../services/alertState.js';
import { sendTelegramReport } from '../services/notifier.js';
import { pingHeartbeat } from '../services/heartbeat.js';

let running = false;

/**
 * Runs all alert checks once. State is only advanced when the message was
 * actually delivered, so a failed send is retried on the next run.
 * @returns {Promise<number>} number of alerts sent
 */
export async function runAlertCheck() {
  if (running) {
    console.warn('[alerts] Previous check is still running, skipping.');
    return 0;
  }
  running = true;
  let sent = 0;
  try {
    const state = await loadAlertState();
    const timezone = process.env.REPORT_TIMEZONE || 'Europe/Istanbul';

    const checks = [
      ['out-of-stock', async () => {
        const { message, nextAlertedIds } = await checkOutOfStock(state.outOfStockIds);
        return { message, apply: () => { state.outOfStockIds = nextAlertedIds; } };
      }],
      ['no-orders', async () => {
        const { message, nextState } = await checkOrderGap(state.orderGap, { timezone });
        return { message, apply: () => { state.orderGap = nextState; } };
      }],
    ];

    let healthy = true;
    for (const [name, check] of checks) {
      try {
        const { message, apply } = await check();
        if (!message) { apply(); continue; }
        if (await sendTelegramReport(message)) {
          apply();
          sent++;
          console.log(`[alerts] ${name}: alert sent`);
        } else {
          healthy = false;
        }
      } catch (err) {
        healthy = false;
        console.error(`[alerts] ${name} check failed: ${err.message}`);
      }
    }

    await saveAlertState(state);
    await pingHeartbeat(healthy ? 'ok' : 'fail');
    return sent;
  } finally {
    running = false;
  }
}

export function startAlertJob() {
  const schedule = process.env.ALERT_CRON_SCHEDULE || '*/15 * * * *';
  const timezone = process.env.REPORT_TIMEZONE || 'Europe/Istanbul';

  if (!cron.validate(schedule)) throw new Error(`Invalid ALERT_CRON_SCHEDULE: "${schedule}"`);
  // Fail fast on bad config instead of on the first run
  parseHourRange(process.env.ALERT_BUSINESS_HOURS);
  parseDays(process.env.ALERT_BUSINESS_DAYS);

  const task = cron.schedule(schedule, runAlertCheck, { timezone, name: 'alerts' });
  console.log(`[alerts] Alert checks scheduled → "${schedule}" (${timezone})`);
  return task;
}
