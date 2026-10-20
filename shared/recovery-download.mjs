// Browser and Node use the same read-only protocol. No credentials in URLs.
export async function downloadRecovery(base, key, progress = () => {}) {
  const get = async params => {
    const response = await fetch(`${base}/history-api/recovery${params ? '?' + new URLSearchParams(params) : ''}`, { headers: { 'x-admin-key': key }, cache: 'no-store', signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error((await response.json()).error || `Backup failed (${response.status}).`);
    return response.json();
  };
  const inventory = await get(), records = [];
  const total = Object.values(inventory.stores).reduce((sum, rows) => sum + rows.length, 0);
  // Four in flight keeps the UI responsive without an unbounded server request.
  const queue = Object.entries(inventory.stores).flatMap(([store, rows]) => rows.map(row => ({ store, ...row })));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, total) }, async () => {
    while (next < queue.length) {
      const row = queue[next++];
      records.push(await get(row)); progress(records.length, total);
    }
  }));
  // Detect a puzzle publish/rollback while records were being read. New visit
  // objects after inventory are deliberately outside this backup's cut-off.
  const control = inventory.stores['babble-history-preview-v1'].find(row => row.key === 'control');
  if (control) await get({ store: 'babble-history-preview-v1', ...control });
  else if ((await get()).stores['babble-history-preview-v1'].some(row => row.key === 'control')) throw new Error('A puzzle was published during backup. Start again.');
  return { schemaVersion: 1, inventory, records };
}
