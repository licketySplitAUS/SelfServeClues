import test from 'node:test';
import assert from 'node:assert/strict';
import { storeNames, inventory, readRecord, verifyBackup, restoreBackup } from '../netlify/lib/recovery.mjs';
import { sqlExport, emergencyPage } from '../netlify/lib/recovery-exports.mjs';
import handler from '../netlify/functions/history-recovery.mjs';
import { downloadRecovery } from '../shared/recovery-download.mjs';

const game = { puzzle: 8616, gameId: 8616, date: '2026-10-20', letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, 25), words: [{ word: 'abcd', score: 9, startRow: 1, startCol: 2 }], name: "Lickety's puzzle" };
function stores() {
  const data = new Map(storeNames.map(name => [name, new Map()])), writes = [];
  const open = name => ({
    list() { return (async function* () { yield { blobs: [...data.get(name)].map(([key, value]) => ({ key, etag: value.etag })) }; })(); },
    async getWithMetadata(key) { const row = data.get(name).get(key); return row ? { data: row.bytes, etag: row.etag, metadata: row.metadata } : null; },
    async set(key, value, options) {
      assert.equal(options.onlyIfNew, true);
      if (data.get(name).has(key)) return { modified: false };
      writes.push(`${name}/${key}`); data.get(name).set(key, { bytes: Buffer.from(value), etag: 'restored', metadata: options.metadata }); return { modified: true };
    },
  });
  const put = (name, key, value) => data.get(name).set(key, { bytes: Buffer.from(JSON.stringify(value)), etag: key + '-etag', metadata: {} });
  return { open, put, data, writes };
}
async function fixture() {
  const source = stores(), history = storeNames[0];
  source.put(history, 'control', { stateKey: 'generations/a/state', snapshotKey: 'generations/a/snapshot' });
  source.put(history, 'generations/a/state', { sourceVersion: 'baseline-a', current: game, puzzles: { 8616: game }, revisions: { 8616: 'puzzles/8616/a' } });
  source.put(history, 'generations/a/snapshot', { current: game });
  source.put(history, 'puzzles/8616/a', game);
  source.put(storeNames[1], 'current-grid', game);
  source.put(storeNames[2], 'mode', { enabled: false });
  source.put(storeNames[3], 'visits/2026-10-20/id', {});
  const index = await inventory(source.open, { baselineVersion: 'baseline-a', siteID: 'source' });
  const records = [];
  for (const [name, rows] of Object.entries(index.stores)) for (const row of rows) records.push(await readRecord(source.open, name, row.key, row.etag));
  return { source, backup: { schemaVersion: 1, inventory: index, records } };
}

test('backup authenticates before accessing storage and refuses nonproduction', async () => {
  const prior = process.env.HISTORY_PREVIEW_ADMIN_KEY;
  process.env.HISTORY_PREVIEW_ADMIN_KEY = 'test-admin';
  try {
    const denied = await handler(new Request('https://example/history-api/recovery'), {});
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('cache-control'), 'no-store');
    assert.equal((await handler(new Request('https://example/history-api/recovery', { headers: { 'x-admin-key': 'test-admin' } }), { deploy: { context: 'deploy-preview' } })).status, 403);
    assert.equal((await handler(new Request('https://example/history-api/recovery', { method: 'POST' }), {})).status, 405);
  } finally { if (prior == null) delete process.env.HISTORY_PREVIEW_ADMIN_KEY; else process.env.HISTORY_PREVIEW_ADMIN_KEY = prior; }
});
test('complete backup verifies checksums, inventory and published references', async () => {
  const { backup } = await fixture();
  assert.equal(verifyBackup(backup).count, 7);
  const damaged = structuredClone(backup); damaged.records[0].data = 'YmFk';
  assert.throws(() => verifyBackup(damaged), /checksum/);
  const missing = structuredClone(backup); missing.records.pop(); assert.throws(() => verifyBackup(missing), /Incomplete/);
  const wrong = structuredClone(backup); wrong.inventory.baselineVersion = 'other'; assert.throws(() => verifyBackup(wrong), /Baseline/);
});
test('concurrent mutation fails backup instead of silently mixing generations', async () => {
  const { source } = await fixture();
  await assert.rejects(readRecord(source.open, storeNames[0], 'control', 'stale-etag'), /changed/);
  await assert.rejects(readRecord(source.open, 'unknown', 'key', 'etag'), /Invalid/);
});
test('restore preflights all stores, dry-runs, writes control last and resumes identical data', async () => {
  const { backup } = await fixture(), target = stores();
  assert.equal((await restoreBackup(backup, target.open)).applied, false); assert.equal(target.writes.length, 0);
  await restoreBackup(backup, target.open, true); assert.equal(target.writes.length, 7);
  assert.equal(target.writes.at(-1), `${storeNames[0]}/control`);
  await restoreBackup(backup, target.open, true); assert.equal(target.writes.length, 7);
  const conflict = stores(); conflict.put(storeNames[3], 'foreign-data', {});
  await assert.rejects(restoreBackup(backup, conflict.open, true), /different data/); assert.equal(conflict.writes.length, 0);
});
test('browser/CLI download pins control and exports exactly the inventoried objects', async () => {
  const { backup } = await fixture(), oldFetch = globalThis.fetch;
  let controlReads = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers['x-admin-key'], 'key');
    const params = new URL(url).searchParams;
    if (!params.has('store')) return Response.json(backup.inventory);
    const row = backup.records.find(row => row.store === params.get('store') && row.key === params.get('key'));
    if (row.key === 'control') controlReads++;
    return Response.json(row);
  };
  try { assert.equal(verifyBackup(await downloadRecovery('https://example', 'key')).count, 7); assert.equal(controlReads, 2); }
  finally { globalThis.fetch = oldFetch; }
});
test('SQL stages separate batches, escapes text, derives totals and preserves coordinates', () => {
  const output = [...sqlExport([game], { abcd: { action: 'exclude', reason: "Babble's verdict", changedAt: 'now' } }, 'batch-a')].join('');
  assert.match(output, /Lickety''s puzzle/); assert.match(output, /Babble''s verdict/);
  assert.match(output, /8616,N'abcd',4,9,1,2/); assert.match(output, /N'2026-10-20',N'ABCDEFGHIJKLMNOPQRSTUVWXY',1,9/);
  assert.doesNotMatch(output, /INSERT INTO dbo\.|UPDATE dbo\./); assert.match(output, /BEGIN TRANSACTION/); assert.match(output, /COMMIT TRANSACTION/);
  assert.throws(() => [...sqlExport([game, game])], /duplicate/);
});
test('emergency clues are portable, identify the saved day, and escape markup', () => {
  const output = emergencyPage(game);
  assert.match(output, /2026-10-20/); assert.match(output, /ab4,9/); assert.match(output, /Since 18\/04\/06/);
  assert.doesNotMatch(output, /https?:\/\/|fetch\(|<script|src=/);
  assert.throws(() => emergencyPage({ ...game, letters: '<bad>' }), /complete puzzle/);
});
