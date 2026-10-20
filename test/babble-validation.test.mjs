import test from 'node:test';
import assert from 'node:assert/strict';
import { readOfficial, validateSolution, babbleClient } from '../netlify/lib/history/babble.mjs';

const grid = { puzzle: 8616, date: '2026-10-20', letters: 'A'.repeat(25) };
const page = (done = 0) => `<a href="/8616/10/20/2026#chat_log">chat</a>${'<img src="/images/a.gif">'.repeat(25)}<div id="tile_stats">1 words total</div><span id="stats_word_4">${done}</span>/<span id="stats_word_total_4">1</span><div id="a1">A <span id="stats_a1">${done}</span>/<span id="stats_total_a1">1</span></div>`;
test('official totals stay fixed as accepted words change progress', () => {
  assert.deepEqual(readOfficial(page(0), grid), readOfficial(page(1), grid));
  assert.deepEqual(readOfficial(page(), grid), { total: 1, lengths: { 4: 1 }, starts: { a: 1 }, prefixes: {} });
  assert.throws(() => readOfficial(page(), { ...grid, puzzle: 8617 }), /changed/);
});
test('matching totals do not submit any words', async () => {
  const result = await validateSolution(grid, [{ word: 'aaaa' }], { client: { login: async () => page(), submit: () => assert.fail('No submission necessary') } });
  assert.equal(result.status, 'matched'); assert.equal(result.tested, 0);
});
test('extra word is removed only after explicit rejection; accepted words can change progress', async () => {
  const client = { login: async () => page(), submit: async word => word === 'aaab' ? 'rejected' : 'accepted', page: async () => page(1) };
  const result = await validateSolution(grid, [{ word: 'aaaa' }, { word: 'aaab' }], { client });
  assert.equal(result.status, 'corrected'); assert.deepEqual(result.rejected, ['aaab']); assert.equal(result.differences.total, 0);
});
test('connection or identity failure never blacklists a word', async () => {
  const client = { login: async () => page(), submit: async () => { throw new Error('timeout'); } };
  const result = await validateSolution(grid, [{ word: 'aaaa' }, { word: 'aaab' }], { client });
  assert.equal(result.status, 'unavailable'); assert.deepEqual(result.rejected, []);
});
test('resumes candidate tests after an invocation budget without retesting accepted words', async () => {
  const result = await validateSolution(grid, [{ word: 'aaaa' }, { word: 'aaab' }], {
    previous: { verified: ['aaaa'] }, client: { login: async () => page(1), submit: async word => { assert.equal(word, 'aaab'); return 'rejected'; }, page: async () => page(1) },
  });
  assert.equal(result.status, 'corrected'); assert.equal(result.tested, 1);
});
test('word adapter accepts only dictionary rejection and confirmed accepted/duplicate responses', async () => {
  for (const [data, expected] of [[{ word: 'aaaa', error: 'not_valid' }, 'rejected'], [{ word: 'aaaa', error: 'duplicate' }, 'accepted'], [{ word: 'aaaa', letters: 4, points: 4 }, 'accepted']]) {
    const client = babbleClient({ fetchImpl: async () => Response.json(data) });
    assert.equal(await client.submit('aaaa', 8616), expected);
  }
  const client = babbleClient({ fetchImpl: async () => Response.json({ word: 'aaaa', error: 'dne' }) });
  await assert.rejects(client.submit('aaaa', 8616), /did not confirm/);
});

test('public chat stays off by default and sends the exact message once when enabled and validated', async () => {
  const { sendFlipNotice } = await import('../netlify/lib/history/notifications.mjs');
  const previous = process.env.NotifyBabblersOfClues;
  const claims = new Set(), posts = [];
  const repo = { claimNotification: async key => { if (claims.has(key)) return false; claims.add(key); return true; }, releaseNotification: async key => claims.delete(key) };
  const fetchImpl = async (url, options) => {
    if (String(url).includes('/action/add_chat_message')) posts.push(new URLSearchParams(options.body).get('message'));
    return new Response(`You are logged in as: test ${page()}`);
  };
  const details = { puzzle: 8616, date: '2026-10-20', validation: { status: 'matched', message: 'Verified' } };
  const originalUser = process.env.BABBLE_USERNAME, originalPassword = process.env.BABBLE_PASSWORD;
  process.env.BABBLE_USERNAME = 'test'; process.env.BABBLE_PASSWORD = 'test';
  try {
    process.env.NotifyBabblersOfClues = 'false';
    await sendFlipNotice('published', details, { repo, fetchImpl }); assert.deepEqual(posts, []);
    process.env.NotifyBabblersOfClues = 'true';
    await sendFlipNotice('published', { ...details, validation: { status: 'mismatch' } }, { repo, fetchImpl }); assert.deepEqual(posts, []);
    await sendFlipNotice('published', details, { repo, fetchImpl });
    await sendFlipNotice('published', details, { repo, fetchImpl });
    assert.deepEqual(posts, ['Clues are up!']);
  } finally {
    for (const [key, value] of Object.entries({ NotifyBabblersOfClues: previous, BABBLE_USERNAME: originalUser, BABBLE_PASSWORD: originalPassword })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
