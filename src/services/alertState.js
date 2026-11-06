// Persists which alerts were already sent, so a restart doesn't repeat them.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const STATE_FILE = resolve(process.env.ALERT_STATE_FILE || 'data/alert-state.json');

const DEFAULT_STATE = {
  outOfStockIds: [],
  orderGap: { alertedForOrderId: null },
};

export async function loadAlertState() {
  try {
    const saved = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    return { ...DEFAULT_STATE, ...saved };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[alerts] Could not read state file, starting fresh: ${err.message}`);
    return structuredClone(DEFAULT_STATE);
  }
}

export async function saveAlertState(state) {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}
