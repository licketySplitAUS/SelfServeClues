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

test('occurrence dates use Sydney daylight saving and standard time with an unambiguous instant', () => {
  const fields = occurredAt => diagnosticMessage({ ...report, occurredAt }).embeds[0].fields;
  const summer = fields('2026-10-31T00:20:18.158Z').find(f => f.name === 'Occurred (Sydney)').value;
  assert.match(summer, /31 Oct 2026/); assert.match(summer, /11:20:18 am AEDT/);
  assert.match(summer, new RegExp(`<t:${Math.floor(Date.parse('2026-10-31T00:20:18.158Z') / 1000)}:R>`));
  const winter = fields('2026-06-01T00:20:18.000Z').find(f => f.name === 'Occurred (Sydney)').value;
  assert.match(winter, /10:20:18 am AEST/);
});

test('known local windows and connection errors have useful explanations without arbitrary labels', () => {
  const fields = diagnosticMessage({ ...report, code: -15, window: 'highlights' }).embeds[0].fields;
  assert.match(fields.find(f => f.name === 'What it means').value, /ERR_SOCKET_NOT_CONNECTED/);
  assert.equal(fields.find(f => f.name === 'Window').value, "What's new");
  assert.ok(!diagnosticMessage({ ...report, window: 'private path' }).embeds[0].fields.some(f => f.name === 'Window'));
  assert.match(JSON.stringify(diagnosticMessage({ ...report, code: 'ERR_AUXILIARY_TIMEOUT' })), /Expert window did not finish/);
});

test('tour failures are accepted as a distinct diagnostic component', () => {
  const message = diagnosticMessage({ ...report, component: 'tour', reason: 'timeout', elapsedMs: 60000 });
  assert.ok(message);
  assert.equal(message.embeds[0].fields.find(field => field.name === 'Component').value, 'tour');
});

test('Discord explains DNS failures while retaining the original code', () => {
  const fields = diagnosticMessage(report).embeds[0].fields;
  assert.equal(fields.find(field => field.name === 'Error code').value, '-105');
  assert.equal(fields.find(field => field.name === 'What it means').value,
    'The website address could not be found (DNS lookup failed).\nERR_NAME_NOT_RESOLVED');
});

test('numeric and named page errors have the same meaning', () => {
  for (const [code, name, meaning] of [
    [-106, 'ERR_INTERNET_DISCONNECTED', /no internet connection/],
    [-118, 'ERR_CONNECTION_TIMED_OUT', /timed out/],
    [-201, 'ERR_CERT_DATE_INVALID', /certificate.*valid dates/],
  ]) {
    const explanation = value => diagnosticMessage({ ...report, code: value }).embeds[0].fields.find(field => field.name === 'What it means').value;
    assert.equal(explanation(code), explanation(name));
    assert.match(explanation(code), meaning);
  }
});

test('system errors, process exit codes and unknown codes are distinguished', () => {
  const explanation = data => diagnosticMessage({ ...report, ...data }).embeds[0].fields.find(field => field.name === 'What it means')?.value;
  assert.match(explanation({ event: 'update-failed', code: 'ENOSPC' }), /no space left/);
  assert.match(explanation({ event: 'renderer-crashed', code: -105 }), /process exit code/);
  assert.doesNotMatch(explanation({ event: 'renderer-crashed', code: -105 }), /DNS/);
  assert.match(explanation({ event: 'process-failed', code: -105 }), /No plain-English explanation/);
  assert.match(explanation({ code: -99999 }), /No plain-English explanation/);
  assert.match(explanation({ code: 'ERR_UNKNOWN_FUTURE_ERROR' }), /No plain-English explanation/);
  assert.equal(explanation({ code: 'private text' }), undefined);
  assert.equal(explanation({ code: undefined }), undefined);
});
