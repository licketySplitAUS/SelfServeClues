import test from 'node:test';
import assert from 'node:assert/strict';
import { createAliasRegistry } from '../netlify/lib/alias-registry.mjs';
import { createHandler as notifyHandler } from '../netlify/functions/babble-notify.mjs';
import { createHandler as diagnosticsHandler } from '../netlify/functions/expert-diagnostics.mjs';
import { createHandler as statisticsHandler } from '../netlify/functions/discord-stats.mjs';
import { reportingChannels } from '../netlify/lib/discord-stats.mjs';

const post = (path, data) => new Request(`https://selfserve.r46.me/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const diagnostic = {
  event: 'load-failed', component: 'clues', version: '3.3.0', platform: 'win32', architecture: 'x64',
  anonymousId: 'BE-9D3P-CWUT', reportId: '12345678-1234-4234-8234-123456789abc', occurredAt: '2026-10-26T00:00:00.000Z',
};

test('notifications, diagnostics and cached historical statistics share first-name-only assignments', async t => {
  const prior = { webhook: process.env.DISCORD_WEBHOOK_URL, context: process.env.CONTEXT };
  process.env.DISCORD_WEBHOOK_URL = 'https://example.invalid/notify'; process.env.CONTEXT = 'production';
  t.after(() => {
    for (const [key, value] of [['DISCORD_WEBHOOK_URL', prior.webhook], ['CONTEXT', prior.context]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const rows = new Map();
  const resolveAlias = createAliasRegistry({
    async get(key) { return rows.get(key) || null; },
    async setJSON(key, value) { if (rows.has(key)) return { modified: false }; rows.set(key, value); return { modified: true }; },
  });
  const sent = [];
  const send = async (_, options) => { sent.push(JSON.parse(options.body)); return new Response(null, { status: 204 }); };
  const notify = notifyHandler({ resolveAlias, send });
  for (const anonymousId of ['BE-9D3P-CWUT', 'BE-MBQX-QRM7']) {
    assert.equal((await notify(post('api/babble-notify', { event: 'startup', anonymousId }), {})).status, 204);
  }
  const name = sent[0].embeds[0].fields[0].value.split('\n')[0];
  assert.match(name, /^[A-Z][a-z]+$/); assert.notEqual(name, 'Joshua');
  assert.equal(sent[1].embeds[0].fields[0].value, 'Joshua\nBE-MBQX-QRM7');
  const diagnostics = diagnosticsHandler({ resolveAlias, send, getWebhook: () => 'https://example.invalid/diagnostics' });
  assert.equal((await diagnostics(post('api/expert-diagnostics', diagnostic))).status, 204);
  assert.equal(sent[2].embeds[0].fields[0].value, `${name}\nBE-9D3P-CWUT`);

  const now = Date.parse('2026-10-26T01:00:00Z'), from = new Date(now - 86400000).toISOString(), to = new Date(now).toISOString();
  let fetches = 0;
  const history = ['BE-9D3P-CWUT', 'BE-MBQX-QRM7'].map((id, index) => ({
    id: (((BigInt(now - 1000) - 1420070400000n) << 22n) + BigInt(index)).toString(), timestamp: new Date(now - 1000).toISOString(),
    embeds: [{ title: 'Babble Expert started', fields: [{ name: 'Anonymous user', value: `Joshua\n${id}` }] }],
  }));
  const statistics = statisticsHandler({ resolveAlias, authorize: () => true, getEnv: key => key === 'DISCORD_STATS_BOT_TOKEN' ? 'test-token' : undefined,
    now: () => now, fetchImpl: async () => { fetches++; return Response.json(history); } });
  const url = `https://selfserve.r46.me/history-api/discord-stats?action=page&channel=${reportingChannels[0].id}&from=${from}&to=${to}`;
  for (let i = 0; i < 2; i++) {
    const result = await (await statistics(new Request(url))).json();
    assert.equal(result.groups.find(group => group.cohort === 'regular').installations['BE-9D3P-CWUT'].name, name);
    assert.equal(result.groups.find(group => group.cohort === 'test').installations['BE-MBQX-QRM7'].name, 'Joshua');
  }
  assert.equal(fetches, 1, 'Cached summaries are also relabelled through the registry');
});

test('an alias storage error never sends a guessed or duplicate name', async t => {
  const prior = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_WEBHOOK_URL = 'https://example.invalid/notify';
  t.after(() => { if (prior === undefined) delete process.env.DISCORD_WEBHOOK_URL; else process.env.DISCORD_WEBHOOK_URL = prior; });
  const options = { resolveAlias: async () => { throw Error('private storage failure'); }, send: () => assert.fail('must not send an unreserved alias') };
  const response = await notifyHandler(options)(post('api/babble-notify', { event: 'startup', anonymousId: diagnostic.anonymousId }), {});
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private/);
  assert.equal((await diagnosticsHandler({ ...options, getWebhook: () => 'https://example.invalid/diagnostics' })(post('api/expert-diagnostics', diagnostic))).status, 502);
});
