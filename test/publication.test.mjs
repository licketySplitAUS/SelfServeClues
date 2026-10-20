import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationStatus, setPublication } from '../netlify/lib/publication.mjs';
import handler from '../netlify/functions/history-publication.mjs';

const fixture = () => {
  let data = null, version = 0;
  return { get: async () => structuredClone(data), getWithMetadata: async () => data ? { data: structuredClone(data), etag: String(version) } : null,
    setJSON: async (key, next, condition) => {
      if (condition?.onlyIfNew && data || condition?.onlyIfMatch && condition.onlyIfMatch !== String(version)) return { modified: false };
      data = structuredClone(next); return { modified: true, etag: String(++version) };
    } };
};
const hook = 'https://api.netlify.com/build_hooks/123abc';

test('publication defaults to legacy and config reads do not call the public site', async () => {
  const result = await publicationStatus({ store: fixture(), configOnly: true, fetchImpl: () => assert.fail('No network needed') });
  assert.equal(result.enabled, false);
});
test('Admin saves the selected mode before requesting deployment and verifies the applied operation', async () => {
  const store = fixture();
  let live = { enabled: false, operationId: 'initial' };
  const result = await setPublication(true, { store, hook, fetchImpl: async (url, request) => {
    const body = JSON.parse(request.body), saved = await store.get();
    assert.equal(saved.enabled, true); assert.equal(body.operationId, saved.operationId);
    assert.equal(body.useNewBabbleClues, true); assert.equal(url, hook);
    return Response.json({});
  } });
  const status = () => publicationStatus({ store, fetchImpl: async () => Response.json(live) });
  assert.equal((await status()).phase, 'deploying');
  live = { enabled: true, operationId: result.operationId };
  assert.equal((await status()).phase, 'live');
  const rollback = await setPublication(false, { store, hook, fetchImpl: async () => Response.json({}) });
  live = { enabled: false, operationId: rollback.operationId };
  assert.equal((await status()).liveEnabled, false);
});
test('failed build hook remains retryable and missing acknowledgement is not called live', async () => {
  const store = fixture();
  assert.equal((await setPublication(true, { store, hook, fetchImpl: async () => new Response(null, { status: 503 }) })).phase, 'failed');
  assert.equal((await publicationStatus({ store, fetchImpl: async () => Response.json({ enabled: false, operationId: 'initial' }) })).phase, 'failed');
  await setPublication(false, { store, hook, fetchImpl: async () => { throw new Error('timeout'); } });
  assert.equal((await publicationStatus({ store, fetchImpl: async () => Response.json({ enabled: false, operationId: 'old' }) })).phase, 'deploying');
});
test('invalid input and unauthenticated requests never trigger publication', async () => {
  await assert.rejects(setPublication('true', { store: fixture(), hook }), /Choose either/);
  await assert.rejects(setPublication(true, { store: fixture(), hook: '' }), /not been configured/);
  assert.equal((await handler(new Request('https://example.test/history-api/publication', { method: 'POST', body: '{}' }))).status, 403);
});
