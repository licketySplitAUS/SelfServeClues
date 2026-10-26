import test from 'node:test';
import assert from 'node:assert/strict';
import { storeNames, verifyBackup } from '../netlify/lib/recovery.mjs';
import { readBatch, BATCH_PROTOCOL } from '../netlify/lib/recovery-batch.mjs';
import { createHandler } from '../netlify/functions/history-recovery.mjs';
import { downloadRecovery } from '../shared/recovery-download.mjs';

function fixture(count = 2672) {
  const stores = new Map(storeNames.map(name => [name, new Map()]));
  stores.get(storeNames[0]).set('control', Buffer.from('{}'));
  for (let i = 1; i < count; i++) stores.get(storeNames[3]).set(`visits/2026-10-26/${i}`, Buffer.from('{}'));
  const targets = [...stores].flatMap(([store, rows]) => [...rows].map(([key]) => ({ store, key, etag: `v:${key}` })));
  let active = 0, peak = 0, reads = 0;
  const openStore = name => ({
    async *list() { yield { blobs: targets.filter(row => row.store === name).map(({ key, etag }) => ({ key, etag })) }; },
    async getWithMetadata(key) {
      active++; reads++; peak = Math.max(peak, active);
      try {
        await new Promise(resolve => setImmediate(resolve));
        const data = stores.get(name).get(key);
        return data ? { data, metadata: {}, etag: `v:${key}` } : null;
      } finally { active--; }
    },
    set() { assert.fail('A backup must never write to production.'); },
  });
  return { openStore, targets, stores, counters: () => ({ active, peak, reads }) };
}
const context = { deploy: { context: 'production', id: 'test-deploy' }, site: { id: 'test-site' } };
function credentials(t) {
  const prior = process.env.HISTORY_BACKUP_KEY; process.env.HISTORY_BACKUP_KEY = 'batch-key';
  t.after(() => { if (prior === undefined) delete process.env.HISTORY_BACKUP_KEY; else process.env.HISTORY_BACKUP_KEY = prior; });
}
const request = (records, headers = {}) => new Request('https://example.test/history-api/recovery', {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': 'batch-key', ...headers }, body: JSON.stringify({ records }),
});

test('full-size backup uses 29 HTTP requests and preserves verification and the final control read', async t => {
  credentials(t);
  const source = fixture(), handler = createHandler({ openStore: source.openStore });
  const original = globalThis.fetch, requests = [], progress = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    requests.push({ method: options.method, count: options.body ? JSON.parse(options.body).records.length : 0 });
    return handler(new Request(url, options), context);
  };
  let counted = 0;
  const saved = await downloadRecovery('https://example.test', 'batch-key', done => progress.push(done), { onRequest: () => counted++ });
  assert.equal(verifyBackup(saved).count, 2672);
  assert.equal(requests.length, 29); assert.equal(counted, 29);
  assert.equal(requests.filter(row => row.method === 'POST').length, 27);
  assert.ok(requests.every(row => row.count <= 100));
  assert.deepEqual(progress, Array.from({ length: 2672 }, (_, i) => i + 1));
  assert.equal(source.counters().reads, 2673, 'One storage read per record, plus the final control check');
  assert.ok(source.counters().peak <= 8, 'Two HTTP batches, each with at most four storage reads');
  const damaged = structuredClone(saved); damaged.records[0].data = 'YmFk';
  assert.throws(() => verifyBackup(damaged), /checksum/);
});

test('batch validates scope, size and duplicates before any storage read', async t => {
  credentials(t);
  const source = fixture(3), handler = createHandler({ openStore: source.openStore });
  for (const rows of [[], {}, Array.from({ length: 101 }, (_, i) => ({ ...source.targets[0], key: String(i) })), [source.targets[0], source.targets[0]],
    [{ ...source.targets[0], store: 'other-store' }], [{ ...source.targets[0], etag: 42 }], [{ ...source.targets[0], key: '' }]]) {
    assert.equal((await handler(request(rows), context)).status, 400);
  }
  assert.equal((await handler(request(source.targets, { 'x-admin-key': 'wrong' }), context)).status, 403);
  assert.equal((await handler(request(source.targets), { deploy: { context: 'deploy-preview' } })).status, 403);
  assert.equal((await handler(request(source.targets, { 'content-length': '65537' }), context)).status, 413);
  assert.equal((await handler(request(source.targets, { 'content-type': 'text/plain' }), context)).status, 415);
  assert.equal((await handler(new Request('https://example.test', { method: 'POST', headers: { 'x-admin-key': 'batch-key', 'content-type': 'application/json' }, body: '{' }), context)).status, 400);
  assert.equal(source.counters().reads, 0);
});

test('size-limited responses are complete prefixes; no record is dropped on continuation', async t => {
  credentials(t);
  const source = fixture(15), original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let continuations = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') {
      continuations++;
      const result = await readBatch(source.openStore, JSON.parse(options.body).records, { maxBytes: 650 });
      assert.ok(result.records.length < 15);
      return Response.json(result);
    }
    return createHandler({ openStore: source.openStore })(new Request(url, options), context);
  };
  assert.equal(verifyBackup(await downloadRecovery('https://example.test', 'batch-key')).count, 15);
  assert.ok(continuations > 1);
  const result = await readBatch(source.openStore, source.targets, { maxBytes: 650 });
  assert.equal(result.consumed, result.records.length);
  assert.deepEqual(result.records.map(row => row.key), source.targets.slice(0, result.consumed).map(row => row.key));
});

test('a changed or missing object fails the batch rather than producing a partial successful snapshot', async t => {
  credentials(t);
  const source = fixture(6), handler = createHandler({ openStore: source.openStore });
  const stale = source.targets.map((row, i) => i === 2 ? { ...row, etag: 'old-etag' } : row);
  const response = await handler(request(stale), context);
  assert.equal(response.status, 409); assert.match((await response.json()).error, /changed/);
  assert.equal(source.counters().active, 0, 'All in-flight storage reads settle before failure is returned');
  await assert.rejects(readBatch(source.openStore, source.targets, { maxSingleBytes: 1 }), /response size/);
});

test('downloader rejects missing, out-of-order and mismatched batch results without falling back to thousands of calls', async t => {
  const source = fixture(2), original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const stores = Object.fromEntries(storeNames.map(name => [name, source.targets.filter(row => row.store === name).map(({ key, etag }) => ({ key, etag }))]));
  for (const result of [{ records: [], consumed: 0 }, { records: [{}], consumed: 2 }, { records: [{ ...source.targets[1] }], consumed: 1 }]) {
    let calls = 0;
    globalThis.fetch = async (_, options) => { calls++; return Response.json(options.method === 'POST' ? result : { stores, batch: BATCH_PROTOCOL }); };
    await assert.rejects(downloadRecovery('https://example.test', 'batch-key'), /batch/);
    assert.equal(calls, 2);
  }
});
