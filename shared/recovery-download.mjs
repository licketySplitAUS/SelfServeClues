// Browser and Node use the same read-only protocol. No credentials in URLs.
import { recoveryRequest } from './recovery-request.mjs';

export async function downloadRecovery(base, key, progress = () => {}, { concurrency = 4, interval = 0, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 || !Number.isFinite(interval) || interval < 0) throw new Error('Invalid backup request limits.');
  let nextRequest = 0;
  const get = async params => {
    if (interval) {
      const start = Math.max(Date.now(), nextRequest);
      nextRequest = start + interval;
      const delay = start - Date.now();
      if (delay > 0) await wait(delay);
    }
    return recoveryRequest(`${base}/history-api/recovery${params ? '?' + new URLSearchParams(params) : ''}`, { headers: { 'x-admin-key': key }, cache: 'no-store' });
  };
  const inventory = await get(), records = [];
  const total = Object.values(inventory.stores).reduce((sum, rows) => sum + rows.length, 0);
  // CLI backups can pace requests without changing the browser download defaults.
  const queue = Object.entries(inventory.stores).flatMap(([store, rows]) => rows.map(row => ({ store, ...row })));
  let next = 0, failed = false;
  const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (!failed && next < queue.length) {
      const row = queue[next++];
      try { records.push(await get(row)); progress(records.length, total); }
      catch (error) { failed = true; throw error; }
    }
  }));
  const failure = workers.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  // Detect a puzzle publish/rollback while records were being read. New visit
  // objects after inventory are deliberately outside this backup's cut-off.
  const control = inventory.stores['babble-history-preview-v1'].find(row => row.key === 'control');
  if (control) await get({ store: 'babble-history-preview-v1', ...control });
  else if ((await get()).stores['babble-history-preview-v1'].some(row => row.key === 'control')) throw new Error('A puzzle was published during backup. Start again.');
  return { schemaVersion: 1, inventory, records };
}
