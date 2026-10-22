import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadCluesSnapshot, validSnapshot } from '../shared/clues-snapshot.mjs';
import { diagnosticDelivery } from '../netlify/lib/diagnostic-delivery.mjs';
import { createHandler } from '../netlify/functions/expert-diagnostics.mjs';
import notify, { config as notifyConfig } from '../netlify/functions/babble-notify.mjs';
import message, { config as messageConfig } from '../netlify/functions/lickety-message.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(new URL('../public/history-preview-data/snapshot.json', import.meta.url)));
const response = data => Response.json(data);

test('network exceptions use the last good snapshot with a prominent dated warning', async () => {
  assert.equal(validSnapshot(snapshot), true);
  const cache = new Map(), storage = { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) };
  await loadCluesSnapshot({ storage, fetchImpl: async () => response(snapshot) });
  const result = await loadCluesSnapshot({ storage, fetchImpl: async () => { throw Error('network timeout'); } });
  assert.equal(result.snapshot.current.puzzle, snapshot.current.puzzle);
  assert.ok(result.notice.includes(snapshot.current.date));
  await assert.rejects(loadCluesSnapshot({ storage, allowFallback: false, fetchImpl: async () => { throw Error('network timeout'); } }), /timeout/);
});
test('a failed live request can load a bundled snapshot, clearly identified as potentially old', async () => {
  const urls = [];
  const result = await loadCluesSnapshot({ fetchImpl: async url => { urls.push(url); if (urls.length === 1) throw Error('offline'); return response(snapshot); } });
  assert.equal(urls[1], '/history-preview-data/snapshot.json'); assert.match(result.notice, /may be old/);
  assert.equal(validSnapshot({ ...snapshot, current: { ...snapshot.current, letters: 'bad' } }), false);
});
function storeFixture() {
  const rows = new Map(); let revision = 0;
  return { getWithMetadata: async key => rows.get(key), setJSON: async (key, data, options) => {
    const previous = rows.get(key);
    if (options.onlyIfNew && previous || options.onlyIfMatch && previous?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++revision); rows.set(key, { data, etag }); return { modified: true, etag };
  } };
}
const report = { event: 'load-failed', component: 'auxiliary', code: -6, anonymousId: 'BE-ABCD-EFGH', version: '3.2.12.0', platform: 'win32', architecture: 'x64', occurredAt: new Date().toISOString(), reportId: '12345678-1234-4234-8234-123456789abc' };
const request = () => new Request('https://selfserve.r46.me/api/expert-diagnostics', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
test('delivered diagnostic IDs are deduplicated and expired sending leases can recover', async () => {
  let calls = 0, now = 100;
  const delivery = diagnosticDelivery(storeFixture(), () => now);
  const handler = createHandler({ delivery, getWebhook: () => 'https://example.invalid/diagnostics', send: async () => { calls++; return { ok: true }; } });
  assert.equal((await handler(request())).status, 204); assert.equal((await handler(request())).status, 204); assert.equal(calls, 1);
  const lease = diagnosticDelivery(storeFixture(), () => now);
  assert.ok((await lease.claim(report)).key); assert.equal((await lease.claim(report)).busy, true);
  now += 31000; assert.ok((await lease.claim(report)).key);
});
test('preview notifications are disabled and older endpoints have rate limits and JSON checks', async t => {
  const prior = process.env.CONTEXT; process.env.CONTEXT = 'deploy-preview';
  t.after(() => { if (prior === undefined) delete process.env.CONTEXT; else process.env.CONTEXT = prior; });
  const notification = new Request('https://example.test/api/babble-notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'session' }) });
  assert.equal((await notify(notification, {})).status, 204);
  assert.equal((await message(new Request('https://example.test/api/lickety-message', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal(notifyConfig.rateLimit.windowLimit, 60); assert.equal(messageConfig.rateLimit.windowLimit, 5);
});
test('temporary braces mitigation rejects hostile nesting and preserves ordinary glob patterns', () => {
  const braces = require('braces');
  assert.throws(() => braces('{'.repeat(5000) + 'a,b' + '}'.repeat(5000)), /safe depth/);
  assert.deepEqual(braces.expand('file-{one,two}.js'), ['file-one.js', 'file-two.js']);
});

import { createHandler as backupHandler } from '../netlify/functions/backup-status.mjs';
import { authorized } from '../netlify/lib/admin-auth.mjs';
test('backup credentials cannot authorize admin writes; backup health preserves last success', async t => {
  const old = { ...process.env };
  process.env.HISTORY_BACKUP_KEY = 'test-backup-key'; process.env.HISTORY_PREVIEW_ADMIN_KEY = 'test-admin-key';
  t.after(() => { for (const key of ['HISTORY_BACKUP_KEY', 'HISTORY_PREVIEW_ADMIN_KEY']) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]; } });
  let saved, alarms = 0;
  const handler = backupHandler({ openStore: () => ({ get: async () => saved, setJSON: async (_key, data) => { saved = data; } }), alarm: async () => { alarms++; } });
  const req = (key, status) => new Request('https://example.test/history-api/backup-status', { method: 'POST', headers: { 'x-admin-key': key }, body: JSON.stringify({ status }) });
  assert.equal(authorized(req('test-backup-key', 'success')), false);
  assert.equal((await handler(req('test-admin-key', 'success'), { deploy: { context: 'production' } })).status, 403);
  assert.equal((await handler(req('test-backup-key', 'success'), { deploy: { context: 'deploy-preview' } })).status, 403);
  assert.equal((await handler(req('test-backup-key', 'bad'), { deploy: { context: 'production' } })).status, 400);
  assert.equal((await handler(req('test-backup-key', 'success'), { deploy: { context: 'production' } })).status, 204);
  const lastSuccess = saved.lastSuccessAt;
  assert.equal((await handler(req('test-backup-key', 'failed'), { deploy: { context: 'production' } })).status, 204);
  assert.equal(saved.lastSuccessAt, lastSuccess); assert.equal(alarms, 1);
});
