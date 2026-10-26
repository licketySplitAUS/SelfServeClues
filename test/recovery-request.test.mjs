import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryRequest } from '../shared/recovery-request.mjs';

test('recovery requests survive connection timeouts and temporary HTTP failures', async () => {
  const original = globalThis.fetch, delays = [], signals = [];
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    signals.push(options.signal);
    assert.equal(options.headers['x-admin-key'], 'test');
    if (++calls === 1) throw new TypeError('fetch failed', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
    if (calls === 2) return new Response('unavailable', { status: 503 });
    return Response.json({ ok: true });
  };
  try {
    assert.deepEqual(await recoveryRequest('https://example', { headers: { 'x-admin-key': 'test' } }, { wait: async ms => delays.push(ms) }), { ok: true });
    assert.deepEqual(delays, [1000, 2000]);
    assert.equal(new Set(signals).size, 3);
  } finally { globalThis.fetch = original; }
});

test('recovery requests bound retries and never retry authentication or changed-data errors', async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [403, 409, 429, 502]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json({ error: `failure ${status}` }, { status }); };
      await assert.rejects(recoveryRequest('https://example', {}, { wait: async () => {} }), new RegExp(`failure ${status}`));
      assert.equal(calls, [403, 409].includes(status) ? 1 : 4);
    }
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
    await assert.rejects(recoveryRequest('https://example', {}, { wait: async () => {} }), /fetch failed/);
    assert.equal(calls, 4);
  } finally { globalThis.fetch = original; }
});

test('status reporting accepts an empty successful response', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try { assert.equal(await recoveryRequest('https://example', { method: 'POST' }), null); }
  finally { globalThis.fetch = original; }
});
