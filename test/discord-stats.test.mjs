import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredChannels, reportingChannels, testInstallations, reportRange, pageRange, summarizeMessages, createDiscordReader } from '../netlify/lib/discord-stats.mjs';
import { createHandler } from '../netlify/functions/discord-stats.mjs';
import { diagnosticErrorMeaning } from '../netlify/lib/diagnostic-errors.mjs';

const now = Date.parse('2026-10-24T03:00:00Z');
const from = now - 86400000, to = now;
const channel = reportingChannels[0];
const idAt = time => ((BigInt(time) - 1420070400000n) << 22n).toString();
const post = (title, fields = {}, time = now - 1000) => ({ id: idAt(time), timestamp: new Date(time).toISOString(), webhook_id: '123',
  embeds: [{ title, description: 'private contact body', fields: Object.entries(fields).map(([name, value]) => ({ name, value })) }] });
const response = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const request = (params = {}, headers = {}) => new Request('https://selfserve.r46.me/history-api/discord-stats?' + new URLSearchParams(params), { headers });
const env = key => ({ DISCORD_STATS_BOT_TOKEN: 'secret-test-token', DISCORD_STATS_CHANNEL_IDS: channel.id })[key];

test('new celebration notifications retain the existing Expert celebration totals', () => {
  const data = summarizeMessages([post('Babble Expert celebration triggered'), post('Babble Expert fireworks triggered')], from, to);
  assert.equal(data.groups.find(group => group.cohort === 'unattributed').events['Expert fireworks'], 2);
  const starts = summarizeMessages([
    post('Babble Expert celebration triggered', { 'Started by': 'Finished puzzle automatically' }),
    post('Babble Expert celebration triggered', { 'Started by': 'Opened celebration preview' }),
    post('Babble Expert celebration triggered', { 'Started by': 'Clicked replay or Play' }),
    post('Babble Expert celebration triggered', { 'Started by': 'Reloaded celebration page' }),
    post('Babble Expert fireworks triggered', { Option: 'Fireworks replay' }),
    post('Babble Expert fireworks triggered', { Option: 'Fireworks', 'Started by': 'private text' }),
  ], from, to).groups[0];
  assert.deepEqual(starts.celebrationTriggers, { 'Finished puzzle automatically': 1, 'Opened celebration preview': 1, 'Clicked replay or Play': 1,
    'Reloaded celebration page': 1, 'Replay (older Expert)': 1, 'Not recorded by this Expert version': 1 });
  assert.equal(starts.events['Expert fireworks'], 6);
});

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
  assert.equal(tests.versions['3.2.12'], 1); assert.equal(tests.countries.Australia, 1);
  assert.equal(regular.posts, 1); assert.equal(other.posts, 3); assert.equal(other.reports, 2);
  assert.deepEqual(other.browsers, ['CV-12345678-1234-4234-8234-123456789abc']);
  assert.equal(other.events['Other posts'], 1);
  assert.doesNotMatch(JSON.stringify(data), /private|@email|description|content/);
  assert.deepEqual(testInstallations.map(row => row.id), ['BE-MBQX-QRM7', 'BE-JQ9R-MUWL', 'BE-TEST-TEST', 'BE-TEST-2ABC']);
});

test('equivalent versions and platforms combine, while delayed diagnostics do not downgrade the latest version', () => {
  const user = { 'Anonymous user': 'Alias\nBE-ABCD-EFGH' };
  const messages = [
    post('Babble Expert started', { ...user, Version: '3.3.0.0', Platform: 'win32 / x64' }, now - 5000),
    post('Page could not load', { ...user, Version: '3.2.11.0', Platform: 'Windows · x64', Component: 'clues', 'Occurred (UTC)': new Date(now - 20000).toISOString() }, now - 1000),
    post('Page could not load', { ...user, Version: '3.2.11.0', Platform: 'Windows · x64', Component: 'clues', 'Occurred (Sydney)': `Sydney date\n<t:${Math.floor((now - 20000) / 1000)}:R>` }, now - 500),
    post('Babble Expert session ended', { ...user, Version: '3.2.11', Platform: 'win32 · x64', 'Time in program': '1h 0m 0s' }, now - 10000),
    post('Babble Expert started', { ...user, Version: '3.3.0.1', Platform: 'darwin / arm64' }, now - 30000),
  ];
  for (const input of [messages, [...messages].reverse()]) {
    const row = summarizeMessages(input, from, to).groups[0];
    assert.deepEqual(row.versions, { '3.3.0': 1, '3.2.11': 3, '3.3.0.1': 1 });
    assert.equal(row.platforms['Windows / x64'], 4);
    assert.equal(row.platforms['macOS / arm64'], 1);
    assert.equal(row.installations['BE-ABCD-EFGH'].latestVersion, '3.3.0');
    assert.equal(row.installations['BE-ABCD-EFGH'].versionAt, new Date(now - 5000).toISOString());
    assert.equal(row.installations['BE-ABCD-EFGH'].lastSeenAt, new Date(now - 5000).toISOString());
    assert.equal(row.installations['BE-ABCD-EFGH'].sessions, 1);
    assert.equal(row.installations['BE-ABCD-EFGH'].sessionSeconds, 3600);
  }
});

test('diagnostics separate versions and stages, deduplicate affected IDs, and preserve event and delivery dates', () => {
  const fields = { 'Anonymous user': 'Alias\nBE-ABCD-EFGH', Component: 'updater', Version: '3.3.0.0', 'Stage / reason': 'download', 'Error code': 'ERR_HTTP_503' };
  const messages = [
    post('Expert update failed', { ...fields, 'Occurred (UTC)': new Date(now - 30000).toISOString(), 'Repeated incidents': '2', Elapsed: '60.0 seconds', 'Total RAM': '8192 MB', 'OS build': '10.0.19045' }, now - 3000),
    post('Expert update failed', { ...fields, 'Anonymous user': 'Other\nBE-BCDE-FGHJ', 'Occurred (UTC)': new Date(now - 20000).toISOString(), Elapsed: '999999 seconds', 'Total RAM': '-4 MB', 'OS build': 'private/path' }, now - 2000),
    post('Expert update failed', { ...fields, 'Occurred (UTC)': new Date(now - 10000).toISOString(), Elapsed: '10.5 seconds', 'Total RAM': '4096 MB', 'OS build': '10.0.22631' }, now - 1000),
    post('Expert update failed', { ...fields, Version: '3.2.12', 'Stage / reason': 'check' }),
    post('Expert update failed', { ...fields, 'Stage / reason': 'install' }),
    post('Expert update failed', { ...fields, 'Stage / reason': 'private exception contents' }),
  ];
  for (const input of [messages, [...messages].reverse()]) {
    const row = summarizeMessages(input, from, to).groups[0];
    const error = row.errors['Expert update failed · updater · v3.3.0 · download · ERR_HTTP_503'];
    assert.equal(Object.keys(row.errors).length, 4);
    assert.deepEqual([error.count, error.incidents, error.installations.length], [3, 4, 2]);
    assert.equal(error.firstOccurredAt, new Date(now - 30000).toISOString());
    assert.equal(error.lastOccurredAt, new Date(now - 10000).toISOString());
    assert.equal(error.lastReceivedAt, new Date(now - 1000).toISOString());
    assert.match(error.meaning, /temporarily unavailable/);
    const detail = error.byInstallation['BE-ABCD-EFGH'];
    assert.deepEqual([detail.count, detail.incidents, detail.timedReports, detail.totalElapsedMs, detail.maxElapsedMs], [2, 3, 2, 70500, 60000]);
    assert.deepEqual(detail.system, { occurredAt: new Date(now - 10000).toISOString(), memoryMB: 4096, osRelease: '10.0.22631' });
    assert.equal(error.byInstallation['BE-BCDE-FGHJ'].count, 1);
    assert.equal(error.byInstallation['BE-BCDE-FGHJ'].timedReports, 0);
    assert.equal(error.byInstallation['BE-BCDE-FGHJ'].system, undefined);
    assert.doesNotMatch(JSON.stringify(row), /private exception/);
  }
});

test('updater and startup error explanations support the next client release without confusing renderer exit codes', () => {
  assert.match(diagnosticErrorMeaning('update-failed', 'ERR_HTTP_429'), /rate limiting/);
  assert.match(diagnosticErrorMeaning('update-failed', 'ERR_HTTP_502'), /HTTP 502/);
  assert.match(diagnosticErrorMeaning('update-failed', 'ERR_NAME_NOT_RESOLVED'), /DNS/);
  assert.match(diagnosticErrorMeaning('startup-failed', 'ERR_STARTUP_TIMEOUT'), /startup deadline/);
  assert.match(diagnosticErrorMeaning('update-failed', 'ERR_UPDATE_UNKNOWN'), /recognizable technical error/);
  assert.match(diagnosticErrorMeaning('renderer-crashed', -105), /process exit code/);
  const data = summarizeMessages([
    post('Page loading unusually slowly', { Component: 'main' }),
    post('Slow page finished loading', { Component: 'main' }),
    post('Expert update failed', { Component: 'updater', 'Error code': 'ERR_UPDATER_INVALID_RELEASE_FEED' }),
  ], from, to);
  const meanings = Object.values(data.groups[0].errors).map(row => row.meaning);
  assert.ok(meanings.some(value => value.includes('delay warning, not a confirmed crash')));
  assert.ok(meanings.some(value => value.includes('recovery notice, not another failure')));
  assert.ok(meanings.some(value => value.includes('could not determine whether an update is available')));
});

test('synthetic reports are tests without filtering a real installation just because its alias is Joshua', () => {
  const data = summarizeMessages([
    post('Babble Expert started', { 'Anonymous user': 'Hannah\nBE-TEST-TEST' }),
    post('Babble Expert started', { 'Anonymous user': 'Charles\nBE-TEST-2ABC' }),
    post('Diagnostics connection test (not a user failure)', { Component: 'main' }),
    post('Babble Expert option used', { Option: 'Babble Expert client option test' }),
    post('Babble Expert resource opened', { Resource: 'Resources menu test' }),
    post('Babble Expert started', { 'Anonymous user': 'Joshua\nBE-9D3P-CWUT' }),
  ], from, to);
  assert.equal(data.groups.find(row => row.cohort === 'test').posts, 5);
  assert.equal(data.groups.find(row => row.cohort === 'regular').posts, 1);
  assert.equal(data.groups.find(row => row.cohort === 'regular').installations['BE-9D3P-CWUT'].name, 'Joshua');
  assert.equal(testInstallations.find(row => row.id === 'BE-MBQX-QRM7').name, 'Joshua');
});

test('diagnostics label recoveries and connection tests separately from problem reports', () => {
  const data = summarizeMessages([
    post('Page stopped responding', { Component: 'clues' }),
    post('Page responding again', { Component: 'clues' }),
    post('Slow page finished loading', { Component: 'resources' }),
    post('Diagnostics connection test (not a user failure)', { Component: 'main' }),
  ], from, to);
  const errors = data.groups.flatMap(row => Object.values(row.errors));
  assert.equal(errors.filter(row => row.kind === 'problem').length, 1);
  assert.equal(errors.filter(row => row.kind === 'recovery').length, 2);
  assert.equal(errors.filter(row => row.kind === 'test').length, 1);
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


test('upgrade milestones stay out of failure totals and interrupted problems pair by technical ID', () => {
  const installation = 'BE-ABCD-EFGH', incident = '12345678-1234-4234-8234-123456789abc';
  const common = { 'Anonymous user': 'Alias\n' + installation, Version: '4.0.0.0', Component: 'babble', 'Incident ID': incident };
  const data = summarizeMessages([
    post('Babble Expert update journey', { ...common, 'Upgrade step': 'User chose Later', 'Update target': '4.1.0', 'Report ID': incident }),
    post('Page stopped responding', { ...common, Timing: 'Continuous measurement' }, now - 3000),
    post('Page responding again', { ...common, Timing: 'Interrupted by sleep, suspension or delayed execution; elapsed time excluded', Elapsed: '73032.1 seconds' }),
    post('Babble Expert celebration triggered', { ...common, 'Effects source': 'cached', 'Effects revision': 'abcdef123456' })
  ], from, to).groups.find(group => group.cohort === 'regular');
  assert.equal(data.diagnosticIncidents, 2); assert.equal(data.events['Upgrade journey'], 1);
  assert.equal(data.upgradeJourney[incident].targetVersion, '4.1.0');
  assert.ok(data.technicalIncidents[installation + ':' + incident].problemAt);
  assert.ok(data.technicalIncidents[installation + ':' + incident].recoveredAt);
  assert.equal(data.technicalIncidents[installation + ':' + incident].interrupted, true);
  const recovery = Object.values(data.errors).find(error => error.kind === 'recovery').byInstallation[installation];
  assert.equal(recovery.timedReports, 0); assert.equal(recovery.interruptedReports, 1);
  assert.equal(data.celebrationPacks['cached / abcdef123456'], 1);
});


test('incident exports retain resource measurements and fixed GitHub service categories',()=>{
  const id='BE-ABCD-EFGH';const data=summarizeMessages([
    post('Page stopped responding',{'Anonymous user':id,Component:'clues','Expert working set (sum)':'900','Expert private memory':'650','System free RAM':'180','Expert CPU (% of machine)':'12.5','CPU sample window (seconds)':'30','Resource sample age (seconds)':'2'}),
    post('Expert update failed',{'Anonymous user':id,Component:'updater','Update service':'github-api'})
  ],from,to).groups.find(group=>group.cohort==='regular');
  const error=Object.values(data.errors).find(error=>error.byInstallation[id].performance);
  assert.equal(error.byInstallation[id].performance.appWorkingSetMB,900);assert.equal(error.byInstallation[id].performance.appCpuPercent,12.5);
  assert.equal(Object.values(data.errors).find(error=>error.services).services['github-api'],1);
});
