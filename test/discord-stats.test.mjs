import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredChannels, reportingChannels, testInstallations, reportRange, pageRange, summarizeMessages, createDiscordReader } from '../netlify/lib/discord-stats.mjs';
import { createHandler } from '../netlify/functions/discord-stats.mjs';

const now = Date.parse('2026-10-24T03:00:00Z');
const from = now - 86400000, to = now;
const channel = reportingChannels[0];
const idAt = time => ((BigInt(time) - 1420070400000n) << 22n).toString();
const post = (title, fields = {}, time = now - 1000) => ({ id: idAt(time), timestamp: new Date(time).toISOString(), webhook_id: '123',
  embeds: [{ title, description: 'private contact body', fields: Object.entries(fields).map(([name, value]) => ({ name, value })) }] });
const response = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const request = (params = {}, headers = {}) => new Request('https://selfserve.r46.me/history-api/discord-stats?' + new URLSearchParams(params), { headers });
const env = key => ({ DISCORD_STATS_BOT_TOKEN: 'secret-test-token', DISCORD_STATS_CHANNEL_IDS: channel.id })[key];

test('dates use Sydney calendar boundaries including both daylight-saving transitions', () => {
  assert.equal(reportRange(new URLSearchParams({ period: 'today' }), now).from, '2026-10-23T13:00:00.000Z');
  for (const [day, start, end, hours] of [
    ['2026-10-04', '2026-10-03T14:00:00.000Z', '2026-10-04T13:00:00.000Z', 23],
    ['2026-04-05', '2026-04-04T13:00:00.000Z', '2026-04-05T14:00:00.000Z', 25],
  ]) {
    const range = reportRange(new URLSearchParams({ period: 'custom', start: day, end: day }), now);
    assert.deepEqual([range.from, range.to], [start, end]);
    assert.equal((Date.parse(range.to) - Date.parse(range.from)) / 3600000, hours);
  }
  for (const params of [{ period: 'custom', start: '2026-02-30', end: '2026-03-01' }, { period: 'custom', start: '2026-10-25', end: '2026-10-25' }, { period: 'custom', start: '2026-10-22', end: '2026-10-20' }, { period: 'unknown' }]) {
    assert.throws(() => reportRange(new URLSearchParams(params), now), /Choose/);
  }
  const range = pageRange(new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString(), before: idAt(to + 1000) }), now);
  assert.equal(range.before, idAt(to));
  assert.throws(() => pageRange(new URLSearchParams({ from: 'bad', to: 'bad' }), now), /Invalid/);
});

test('exact installation IDs segregate tests; names, private text and excluded dates do not affect totals', () => {
  const data = summarizeMessages([
    post('Babble Expert session ended', { 'Anonymous user': 'Joshua\nBE-MBQX-QRM7', 'Time in program': '1h 2m 3s', Version: '3.2.12.0', Platform: 'win32 / x64', Country: 'Australia' }),
    post('Babble Expert started', { 'Anonymous user': 'Kevin\nBE-JQ9R-MUWL' }),
    post('Babble Expert started', { 'Anonymous user': 'Joshua\nBE-ABCD-EFGH' }),
    post('Clues completed — reduced-motion celebration', { 'Anonymous browser': 'CV-12345678-1234-4234-8234-123456789abc' }),
    post('A message for lickety', { From: 'private name', Email: 'private@email.example' }),
    { ...post('unrecognised'), content: 'private general message', embeds: [] },
    post('Babble Expert started', {}, from - 1), post('Babble Expert started', {}, to),
  ], from, to);
  const tests = data.groups.find(group => group.cohort === 'test'), regular = data.groups.find(group => group.cohort === 'regular'), other = data.groups.find(group => group.cohort === 'unattributed');
  assert.equal(tests.posts, 2); assert.equal(tests.sessionSeconds, 3723); assert.equal(tests.measuredSessions, 1);
  assert.equal(tests.versions['3.2.12.0'], 1); assert.equal(tests.countries.Australia, 1);
  assert.equal(regular.posts, 1); assert.equal(other.posts, 3); assert.equal(other.reports, 2);
  assert.deepEqual(other.browsers, ['CV-12345678-1234-4234-8234-123456789abc']);
  assert.equal(other.events['Other posts'], 1);
  assert.doesNotMatch(JSON.stringify(data), /private|@email|description|content/);
  assert.deepEqual(testInstallations.map(row => row.id), ['BE-MBQX-QRM7', 'BE-JQ9R-MUWL']);
});

test('diagnostic report and repeated-incident counts are distinct, with readable code meanings', () => {
  const data = summarizeMessages([
    post('Page could not load', { Component: 'clues', 'Error code': '-105', 'Repeated incidents': '4' }),
    post('Page renderer stopped', { Component: 'clues', 'Error code': '-105' }),
    { ...post('unreadable'), embeds: [] },
    post('Babble Expert option used', { Option: 'Colour found words', Country: '__proto__' }),
  ], from, to);
  const row = data.groups[0];
  assert.equal(row.diagnosticIncidents, 5); assert.equal(row.events.Diagnostics, 2);
  assert.match(row.errors['Page could not load · clues · -105'].meaning, /DNS/);
  assert.match(row.errors['Page renderer stopped · clues · -105'].meaning, /process exit code/);
  assert.equal(row.errors['Page could not load · clues · -105'].incidents, 4);
  assert.equal(data.hiddenReports, 1);
  assert.equal(Object.hasOwn(row.countries, '__proto__'), true);
  assert.equal(row.countries.__proto__, 1);
});

test('reader paginates exclusively, caches summaries, and expires the cache', async () => {
  let clock = now, calls = 0;
  const messages = Array.from({ length: 101 }, (_, index) => post('Babble Expert started', { 'Anonymous user': 'Joshua\nBE-MBQX-QRM7' }, now - 1000 * (index + 1)));
  const reader = createDiscordReader({ token: 'secret-test-token', now: () => clock, fetchImpl: async (url, options) => {
    calls++; assert.equal(options.headers.Authorization, 'Bot secret-test-token');
    const before = BigInt(new URL(url).searchParams.get('before'));
    return response(messages.filter(message => BigInt(message.id) < before).slice(0, 100));
  } });
  const firstRange = { from, to, before: idAt(to) };
  const first = await reader.page(channel, firstRange);
  assert.equal(first.done, false); assert.equal(first.groups[0].posts, 100);
  assert.equal((await reader.page(channel, firstRange)).cached, true); assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(first), /private contact body/);
  const last = await reader.page(channel, { ...firstRange, before: first.nextBefore });
  assert.equal(last.done, true); assert.equal(last.groups[0].posts, 1);
  assert.equal(first.groups[0].posts + last.groups[0].posts, 101);
  clock += 300001; await reader.page(channel, firstRange); assert.equal(calls, 3);
});

test('reader stops at date boundary and rejects a stuck cursor or malformed response', async () => {
  const range = { from, to, before: idAt(to) };
  const messages = Array.from({ length: 100 }, (_, index) => post('Babble Expert started', {}, from + 1000 - index * 100));
  const reader = createDiscordReader({ token: 'x', fetchImpl: async () => response(messages) });
  const result = await reader.page(channel, range);
  assert.equal(result.done, true); assert.equal(result.groups[0].posts, 11);
  for (const data of [[post('Babble Expert started', {}, to)], [{ id: 'invalid', timestamp: 'invalid' }], {}]) {
    await assert.rejects(createDiscordReader({ token: 'x', fetchImpl: async () => response(data) }).page(channel, range), /advance|unreadable/);
  }
});

test('rate limits pause requests without sleeping and honor retry/reset times', async () => {
  let clock = now, calls = 0;
  const range = { from, to, before: idAt(to) };
  const reader = createDiscordReader({ token: 'x', now: () => clock, fetchImpl: async () => ++calls === 1 ? response({ retry_after: 2, global: true }, 429) : response([], 200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '1' }) });
  await assert.rejects(reader.page(channel, range), error => error.status === 429 && error.retryAfter === 2);
  await assert.rejects(reader.page(reportingChannels[1], range), error => error.status === 429); assert.equal(calls, 1);
  clock += 2001; assert.equal((await reader.page(channel, range)).done, true);
  await assert.rejects(reader.page(channel, { ...range, before: idAt(to - 1000) }), error => error.status === 429 && error.retryAfter === 1);
});

test('connection check identifies hidden content and handles per-channel permissions', async () => {
  const reader = createDiscordReader({ token: 'x', fetchImpl: async url => {
    if (url.endsWith('/users/@me')) return response({ username: 'Lickety Statistics' });
    if (url.includes(channel.id)) return response([{ webhook_id: 'x', content: '', embeds: [] }]);
    return response({ message: 'private diagnostic' }, 403);
  } });
  const result = await reader.connection(reportingChannels.slice(0, 2));
  assert.equal(result.bot, 'Lickety Statistics');
  assert.equal(result.channels[0].state, 'content-hidden'); assert.equal(result.channels[1].readable, false);
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

test('handler authenticates before requests and cache access, and restricts channel IDs', async () => {
  let calls = 0;
  const handler = createHandler({ getEnv: env, now: () => now, authorize: req => req.headers.get('x-admin-key') === 'test', fetchImpl: async () => { calls++; return response([]); } });
  assert.equal((await handler(request())).status, 403); assert.equal(calls, 0);
  const headers = { 'x-admin-key': 'test' };
  const start = await handler(request({}, headers));
  assert.equal(start.headers.get('cache-control'), 'private, no-store'); assert.equal(start.headers.get('netlify-cdn-cache-control'), 'no-store');
  assert.equal((await start.json()).channels.length, 1); assert.equal(calls, 0);
  const params = { action: 'page', channel: channel.id, from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  assert.equal((await handler(request({ ...params, channel: reportingChannels[1].id }, headers))).status, 400);
  assert.equal((await handler(request(params, headers))).status, 200); assert.equal(calls, 1);
  assert.equal((await handler(request(params))).status, 403); assert.equal(calls, 1);
  assert.equal((await (await handler(request(params, headers))).json()).cached, true);
  assert.equal((await handler(new Request('https://example.test', { method: 'POST' }))).status, 405);
});

test('handler returns actionable errors without leaking token or Discord response contents', async () => {
  const params = { action: 'page', channel: channel.id, from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  for (const [status, expected] of [[401, 503], [403, 403], [404, 404], [500, 502], [429, 429]]) {
    const handler = createHandler({ getEnv: env, now: () => now, authorize: () => true, fetchImpl: async () => response({ message: 'private body', retry_after: 3 }, status) });
    const result = await handler(request(params)), body = await result.json();
    assert.equal(result.status, expected); assert.equal(body.channelError, [403, 404].includes(status));
    assert.doesNotMatch(JSON.stringify(body), /secret-test-token|private body/);
    if (status === 429) assert.equal(result.headers.get('retry-after'), '3');
  }
  assert.equal((await createHandler({ getEnv: () => '', authorize: () => true })(request())).status, 503);
  const broken = createHandler({ getEnv: env, authorize: () => true, fetchImpl: async () => { throw Error('secret-test-token'); } });
  assert.doesNotMatch(await (await broken(request(params))).text(), /secret-test-token/);
  assert.equal(configuredChannels(channel.id + ', ' + channel.id).length, 1);
  assert.throws(() => configuredChannels('bad'), /DISCORD_STATS_CHANNEL_IDS/);
});
