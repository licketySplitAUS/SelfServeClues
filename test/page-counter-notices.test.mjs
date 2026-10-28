import test from 'node:test';
import assert from 'node:assert/strict';
import { pageCounterField } from '../netlify/lib/page-counter-field.mjs';
import { createHandler as expertHandler } from '../netlify/functions/babble-notify.mjs';
import { createHandler as cluesHandler } from '../netlify/functions/clues-fireworks.mjs';
import { sendFlipNotice } from '../netlify/lib/history/notifications.mjs';

const fieldName = 'Clues page visits (all time)';
const request = data => new Request('https://selfserve.r46.me/api/notice', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
});

test('counter field formats totals and bounds unavailable, invalid and stalled reads', async () => {
  assert.equal((await pageCounterField(async () => 4198765)).value, '4,198,765');
  for (const read of [async () => { throw Error('offline'); }, async () => NaN, async () => -1, () => new Promise(() => {})]) {
    assert.equal((await pageCounterField(read, 5)).value, 'Temporarily unavailable');
  }
});

test('clues-related Expert, browser and publication notices use the server total without client changes', async t => {
  const priorFetch = globalThis.fetch;
  const keys = ['CONTEXT', 'DISCORD_WEBHOOK_URL', 'DISCORD_FIREWORKS_WEBHOOK_URL'];
  const prior = keys.map(key => process.env[key]);
  t.after(() => {
    globalThis.fetch = priorFetch;
    keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; });
  });
  process.env.CONTEXT = 'production';
  process.env.DISCORD_WEBHOOK_URL = process.env.DISCORD_FIREWORKS_WEBHOOK_URL = 'https://example.invalid/hook';
  let sent, reads = 0;
  const send = async (_, options) => { sent = JSON.parse(options.body); return new Response(null, { status: 204 }); };
  globalThis.fetch = send;
  const readCount = async () => { reads++; return 4198765; };
  const assertMetric = () => assert.equal(sent.embeds[0].fields.find(f => f.name === fieldName)?.value, '4,198,765');
  const expert = expertHandler({ send, readCount });
  for (const item of ['Clues: Self Serve Clues', "Clues: Lickety's Clues", 'Self Serve: Grab Grid', 'Create clues', 'Fireworks', 'Fireworks replay']) {
    assert.equal((await expert(request({ event: 'option', item, count: 999 }), {})).status, 204);
    assertMetric();
  }
  await expert(request({ event: 'resource', item: 'Self Serve Clues' }), {}); assertMetric();
  const before = reads;
  for (const data of [{ event: 'startup' }, { event: 'option', item: 'Zoom 100%' }, { event: 'resource', item: 'Dictionary' }]) {
    await expert(request(data), {});
    assert.ok(!sent.embeds[0].fields.some(f => f.name === fieldName));
  }
  assert.equal(reads, before);
  for (const effect of ['fireworks', 'message']) {
    assert.equal((await cluesHandler({ readCount })(request({ source: 'published', puzzle: '8618', words: 155, effect }))).status, 204);
    assertMetric();
  }
  const options = { repo: { claimNotification: async () => true }, webhook: 'https://example.invalid/hook', fetchImpl: send, chatEnabled: false, readCount };
  assert.equal((await sendFlipNotice('published', { date: '2026-10-28', puzzle: 8618, words: 155, score: 1200 }, options)).outcome, 'sent');
  assertMetric();
  const duplicateReads = reads;
  await sendFlipNotice('published', { date: '2026-10-28' }, { ...options, repo: { claimNotification: async () => false } });
  assert.equal(reads, duplicateReads);
  assert.equal((await expertHandler({ send, readCount: async () => { throw Error('offline'); } })(request({ event: 'option', item: 'Fireworks' }), {})).status, 204);
  assert.equal(sent.embeds[0].fields.find(f => f.name === fieldName).value, 'Temporarily unavailable');
});
