// Browser and Node use the same read-only protocol. No credentials in URLs.
import { recoveryRequest } from './recovery-request.mjs';

export async function downloadRecovery(base, key, progress = () => {}, { concurrency = 2, interval = 0, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), onRequest = () => {} } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 || !Number.isFinite(interval) || interval < 0) throw new Error('Invalid backup request limits.');
  let nextRequest = 0;
  const get = async (params, targets) => {
    if (interval) {
      const start = Math.max(Date.now(), nextRequest);
      nextRequest = start + interval;
      const delay = start - Date.now();
      if (delay > 0) await wait(delay);
    }
    const method = targets ? 'POST' : 'GET';
    return recoveryRequest(`${base}/history-api/recovery${params ? '?' + new URLSearchParams(params) : ''}`, {
      method, headers: { 'x-admin-key': key, ...(targets ? { 'content-type': 'application/json' } : {}) }, cache: 'no-store',
      ...(targets ? { body: JSON.stringify({ records: targets }) } : {}),
    }, { onAttempt: attempt => onRequest({ method, attempt }) });
  };
  const inventory = await get(), records = [];
  const total = Object.values(inventory.stores).reduce((sum, rows) => sum + rows.length, 0);
  // CLI backups can pace requests without changing the browser download defaults.
  const queue = Object.entries(inventory.stores).flatMap(([store, rows]) => rows.map(row => ({ store, ...row })));
  const batched = inventory.batch?.version === 1;
  const limit = batched ? inventory.batch.maxRecords : 1;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Unsupported backup batch size.');
  const batches = []; let batch = [], bytes = 100;
  for (const row of queue) {
    const target = { store: row.store, key: row.key, etag: row.etag };
    const size = new TextEncoder().encode(JSON.stringify(target)).length + 1;
    if (batch.length && (batch.length === limit || bytes + size > 48000)) { batches.push(batch); batch = []; bytes = 100; }
    batch.push(target); bytes += size;
  }
  if (batch.length) batches.push(batch);
  let next = 0, failed = false;
  const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
    while (!failed && next < batches.length) {
      let pending = batches[next++];
      try {
        while (pending.length && !failed) {
          const result = batched ? await get(undefined, pending) : { records: [await get(pending[0])], consumed: 1 };
          if (!Array.isArray(result?.records) || !Number.isInteger(result.consumed) || result.consumed < 1 || result.consumed > pending.length || result.records.length !== result.consumed) throw new Error('Incomplete backup batch response.');
          for (let i = 0; i < result.consumed; i++) {
            const record = result.records[i], expected = pending[i];
            if (record?.store !== expected.store || record?.key !== expected.key || record?.etag !== expected.etag) throw new Error('Backup batch does not match the pinned inventory.');
            records.push(record); progress(records.length, total);
          }
          pending = pending.slice(result.consumed);
        }
      }
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
