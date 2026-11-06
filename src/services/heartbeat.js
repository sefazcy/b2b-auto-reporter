// Dead man's switch: pings HEARTBEAT_URL after each successful run.
// If the service crashes or hangs, the pings stop and an external monitor
// (e.g. healthchecks.io, Uptime Kuma, Better Stack) notifies you.

/**
 * @param {'ok' | 'fail'} [status]
 * @returns {Promise<boolean>}
 */
export async function pingHeartbeat(status = 'ok') {
  const url = process.env.HEARTBEAT_URL;
  if (!url) return false;
  // healthchecks.io convention: append /fail to signal an explicit failure
  const target = status === 'fail' ? `${url.replace(/\/$/, '')}/fail` : url;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.warn(`[heartbeat] Ping failed: ${err.message}`);
    return false;
  }
}
