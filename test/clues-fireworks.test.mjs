import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { config } from '../netlify/functions/clues-fireworks.mjs';
const valid = { source: 'published', puzzle: '8618', words: 155, effect: 'fireworks' };
const request = (data = valid, headers = {}) => new Request('https://r46.me/api/clues-fireworks', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://r46.me', ...headers }, body: typeof data === 'string' ? data : JSON.stringify(data) });
test('browser completion sends only public puzzle totals and source, never visitor details or entered words', async t => {
  const priorFetch = globalThis.fetch, priorHook = process.env.DISCORD_FIREWORKS_WEBHOOK_URL;
  t.after(() => { globalThis.fetch = priorFetch; if (priorHook === undefined) delete process.env.DISCORD_FIREWORKS_WEBHOOK_URL; else process.env.DISCORD_FIREWORKS_WEBHOOK_URL = priorHook; });
  process.env.DISCORD_FIREWORKS_WEBHOOK_URL = 'https://example.invalid/private-fireworks';
  let sent;
  globalThis.fetch = async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return new Response(null, { status: 204 }); };
  const result = await handler(request({ ...valid, foundWords: ['secretword'], name: 'person-name', message: '@everyone' }), { ip: '192.0.2.1', geo: { city: 'Sydney' } });
  assert.equal(result.status, 204); assert.equal(sent.url, process.env.DISCORD_FIREWORKS_WEBHOOK_URL);
  assert.equal(sent.body.embeds[0].title, 'Clues completed — fireworks triggered');
  assert.deepEqual(sent.body.allowed_mentions, { parse: [] });
  assert.doesNotMatch(JSON.stringify(sent.body), /secretword|person-name|192\.0\.2\.1|Sydney|@everyone/);
  assert.equal(sent.body.embeds[0].fields[0].value, 'New clues page');
  await handler(request({ ...valid, source: 'self-serve', puzzle: null, effect: 'message' }));
  assert.match(sent.body.embeds[0].title, /reduced-motion/); assert.equal(sent.body.embeds[0].fields[1].value, 'Custom grid');
});
test('malformed and cross-site requests never contact Discord', async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = () => assert.fail('Rejected requests must not contact Discord');
  for (const input of [null, {}, { ...valid, source: '__proto__' }, { ...valid, source: {} }, { ...valid, words: 0 }, { ...valid, words: 99999 }, { ...valid, puzzle: '@everyone' }, { ...valid, effect: 'arbitrary' }, '{']) assert.equal((await handler(request(input))).status, 400);
  assert.equal((await handler(request(valid, { origin: 'https://unrelated.example' }))).status, 403);
  assert.equal((await handler(request(valid, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await handler(new Request('https://example.test/api/clues-fireworks'))).status, 405);
  assert.equal((await handler(request('x'.repeat(513)))).status, 413);
  assert.equal(config.rateLimit.windowLimit, 10);
});
test('missing configuration, Discord rejection and unavailable network have bounded failures', async t => {
  const priorFetch = globalThis.fetch, priorHook = process.env.DISCORD_FIREWORKS_WEBHOOK_URL;
  t.after(() => { globalThis.fetch = priorFetch; if (priorHook === undefined) delete process.env.DISCORD_FIREWORKS_WEBHOOK_URL; else process.env.DISCORD_FIREWORKS_WEBHOOK_URL = priorHook; });
  delete process.env.DISCORD_FIREWORKS_WEBHOOK_URL;
  assert.equal((await handler(request())).status, 503);
  process.env.DISCORD_FIREWORKS_WEBHOOK_URL = 'https://example.invalid/private-fireworks';
  globalThis.fetch = async () => new Response(null, { status: 429 }); assert.equal((await handler(request())).status, 502);
  globalThis.fetch = async () => { throw Error('offline'); }; assert.equal((await handler(request())).status, 502);
});
