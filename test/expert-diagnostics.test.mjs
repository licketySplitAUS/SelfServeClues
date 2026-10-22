import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, diagnosticMessage, config } from '../netlify/functions/expert-diagnostics.mjs';
const report = {
  event: 'load-failed', component: 'clues', code: -105, version: '3.2.11.0', platform: 'win32', architecture: 'x64',
  anonymousId: 'BE-ABCD-EFGH', reportId: '12345678-1234-4234-8234-123456789abc', occurredAt: '2026-10-22T10:00:00.000Z',
  memoryMB: 8192, osRelease: '10.0.26200',
};
const request = (data, headers = {}) => new Request('https://selfserve.r46.me/api/expert-diagnostics', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof data === 'string' ? data : JSON.stringify(data),
});
test('diagnostics go only to dedicated webhook with consistent installation alias and safe fields', async () => {
  const sent = [];
  const handler = createHandler({ getWebhook: () => 'https://discord.example/diagnostics', send: async (url, options) => { sent.push({ url, body: JSON.parse(options.body) }); return { ok: true }; } });
  const response = await handler(request({ ...report, message: 'private message', stack: 'C:\\Users\\Private', url: 'https://private.example/secret' }));
  assert.equal(response.status, 204);
  assert.equal(sent[0].url, 'https://discord.example/diagnostics');
  assert.match(sent[0].body.embeds[0].fields[0].value, /\w+\nBE-ABCD-EFGH/);
  assert.match(JSON.stringify(sent[0].body), /-105/);
  assert.doesNotMatch(JSON.stringify(sent[0].body), /private|secret|Users/);
  assert.deepEqual(sent[0].body.allowed_mentions, { parse: [] });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(config.rateLimit.windowLimit, 30);
});
test('reject invalid reports and unsupported requests before contacting Discord', async () => {
  const handler = createHandler({ send: () => assert.fail('should not send') });
  for (const data of [null, {}, '{', { ...report, event: '__proto__' }, { ...report, component: 'arbitrary' }, { ...report, anonymousId: 'real-name' }, { ...report, version: '@everyone' }, { ...report, reportId: 'bad' }, { ...report, occurredAt: 'yesterday' }]) assert.equal((await handler(request(data))).status, 400);
  assert.equal((await handler(request('x'.repeat(2049)))).status, 413);
  assert.equal((await handler(request(report, { origin: 'https://other.example' }))).status, 403);
  assert.equal((await handler(request(report, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await handler(new Request('https://selfserve.r46.me/api/expert-diagnostics'))).status, 405);
});
test('configuration failures and Discord failures remain bounded and contain no webhook', async () => {
  assert.equal((await createHandler({ getWebhook: () => undefined })(request(report))).status, 503);
  for (const send of [async () => ({ ok: false }), async () => { throw Error('secret webhook'); }]) {
    const response = await createHandler({ getWebhook: () => 'secret webhook', send })(request(report, { origin: 'null' }));
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /secret/);
  }
});
test('diagnostic formatting omits unexpected free text and marks recovery clearly', () => {
  const result = diagnosticMessage({ ...report, event: 'load-recovered', elapsedMs: 42000, reason: '@everyone', code: 'private', targetVersion: '3.2.12' });
  assert.equal(result.embeds[0].title, 'Slow page finished loading');
  assert.match(JSON.stringify(result), /42.0 seconds/);
  assert.doesNotMatch(JSON.stringify(result), /@everyone|private/);
});

test('tour failures are accepted as a distinct diagnostic component', () => {
  const message = diagnosticMessage({ ...report, component: 'tour', reason: 'timeout', elapsedMs: 60000 });
  assert.ok(message);
  assert.equal(message.embeds[0].fields.find(field => field.name === 'Component').value, 'tour');
});
