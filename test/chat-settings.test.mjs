import test from 'node:test';
import assert from 'node:assert/strict';
import { chatSettings, saveChatSettings } from '../netlify/lib/history/chat-settings.mjs';
import { sendConfiguredFlipNotice } from '../netlify/lib/history/notifications.mjs';
import handler from '../netlify/functions/history-chat-settings.mjs';

function repository() {
  let value = null, etag = null;
  const claims = new Set();
  return {
    chatSettings: async () => ({ value, etag }),
    async commitChatSettings(next, expected) { assert.equal(expected, etag); value = next; etag = String(Number(etag || 0) + 1); },
    async claimNotification(key) { if (claims.has(key)) return false; claims.add(key); return true; },
    async releaseNotification(key) { claims.delete(key); },
  };
}
test('saved Admin chat setting overrides either legacy fallback and preserves changes', async () => {
  const repo = repository();
  assert.deepEqual(await chatSettings(repo, false), { enabled: false, announcementText: 'Clues are up!', source: 'environment', changedAt: null });
  assert.equal((await chatSettings(repo, true)).enabled, true);
  await saveChatSettings(repo, false); assert.equal((await chatSettings(repo, true)).enabled, false);
  await saveChatSettings(repo, true); assert.equal((await chatSettings(repo, false)).enabled, true);
  assert.equal((await chatSettings(repo)).source, 'admin');
  await assert.rejects(saveChatSettings(repo, 'true'), /Choose/);
  await assert.rejects(saveChatSettings({ ...repo, commitChatSettings: async () => { throw Error('Concurrent change'); } }, false), /Concurrent/);
});

test('custom text persists without enabling announcements and survives toggle-only updates', async () => {
  const repo = repository();
  const result = await saveChatSettings(repo, false, '  Today’s clues are ready — enjoy!  ');
  assert.equal(result.announcementText, 'Today’s clues are ready — enjoy!');
  assert.equal(result.enabled, false);
  await saveChatSettings(repo, true);
  assert.equal((await chatSettings(repo)).announcementText, result.announcementText);
  const legacy = { ...repo, chatSettings: async () => ({ value: { enabled: true }, etag: 'legacy' }) };
  assert.equal((await chatSettings(legacy)).announcementText, 'Clues are up!');
});

test('invalid message text never changes the saved setting', async () => {
  const repo = repository();
  await saveChatSettings(repo, true, 'Ready to play!');
  for (const text of ['', '   ', null, 123, 'a'.repeat(251), 'two\nlines', 'two\rlines', 'hidden\u0000text']) {
    await assert.rejects(saveChatSettings(repo, false, text), /announcement|single line/);
    assert.equal((await chatSettings(repo)).announcementText, 'Ready to play!');
    assert.equal((await chatSettings(repo)).enabled, true);
  }
  await saveChatSettings(repo, true, 'a'.repeat(250));
  assert.equal((await chatSettings(repo)).announcementText.length, 250);
  await assert.rejects(chatSettings({ chatSettings: async () => ({ value: { enabled: true, announcementText: '' } }) }), /announcement/);
});
test('chat settings writes require authentication and production context', async () => {
  const previous = process.env.HISTORY_PREVIEW_ADMIN_KEY; process.env.HISTORY_PREVIEW_ADMIN_KEY = 'test-admin';
  try {
    assert.equal((await handler(new Request('https://example/history-api/chat-settings', { method: 'POST' }), {})).status, 403);
    const response = await handler(new Request('https://example/history-api/chat-settings', { method: 'POST', headers: { 'x-admin-key': 'test-admin' }, body: '{"enabled":true}' }), { deploy: { context: 'deploy-preview' } });
    assert.equal(response.status, 403); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await handler(new Request('https://example/history-api/chat-settings', { method: 'DELETE' }), {})).status, 405);
  } finally { if (previous === undefined) delete process.env.HISTORY_PREVIEW_ADMIN_KEY; else process.env.HISTORY_PREVIEW_ADMIN_KEY = previous; }
});
test('Admin toggle controls actual notification path without posting on save or repeating a puzzle', async () => {
  const saved = Object.fromEntries(['NotifyBabblersOfClues', 'BABBLE_USERNAME', 'BABBLE_PASSWORD'].map(key => [key, process.env[key]]));
  process.env.BABBLE_USERNAME = 'test'; process.env.BABBLE_PASSWORD = 'test';
  const repo = repository(), messages = [];
  const fetchImpl = async (url, options) => {
    if (String(url).includes('/action/add_chat_message')) messages.push(new URLSearchParams(options.body).get('message'));
    return new Response('You are logged in as: test <a href="/8616/10/20/2026#chat_log">chat</a>' + '<img src="/images/a.gif">'.repeat(25));
  };
  const details = { puzzle: 8616, date: '2026-10-20', validation: { status: 'matched' } };
  try {
    process.env.NotifyBabblersOfClues = 'true';
    await saveChatSettings(repo, false); await sendConfiguredFlipNotice('published', details, { repo, fetchImpl }); assert.deepEqual(messages, []);
    process.env.NotifyBabblersOfClues = 'false';
    await saveChatSettings(repo, true); assert.deepEqual(messages, []);
    await sendConfiguredFlipNotice('published', { ...details, validation: { status: 'mismatch' } }, { repo, fetchImpl }); assert.deepEqual(messages, []);
    await sendConfiguredFlipNotice('published', details, { repo, fetchImpl });
    await sendConfiguredFlipNotice('published', details, { repo, fetchImpl }); assert.deepEqual(messages, ['Clues are up!']);
    const custom = 'Clues are ready! Visit r46.me — enjoy & have fun!';
    await saveChatSettings(repo, true, custom);
    await sendConfiguredFlipNotice('published', details, { repo, fetchImpl });
    assert.deepEqual(messages, ['Clues are up!'], 'Editing text must not repeat an already announced puzzle');
    const nextDetails = { puzzle: 8617, date: '2026-10-21', validation: { status: 'matched' } };
    const nextFetch = async (url, options) => {
      if (String(url).includes('/action/add_chat_message')) messages.push(new URLSearchParams(options.body).get('message'));
      return new Response('You are logged in as: test <a href="/8617/10/21/2026#chat_log">chat</a>' + '<img src="/images/a.gif">'.repeat(25));
    };
    await sendConfiguredFlipNotice('published', nextDetails, { repo, fetchImpl: nextFetch });
    await sendConfiguredFlipNotice('published', nextDetails, { repo, fetchImpl: nextFetch });
    assert.deepEqual(messages, ['Clues are up!', custom]);
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
test('unavailable saved setting disables chat and still permits a Discord report', async () => {
  const repo = repository(); repo.chatSettings = async () => { throw Error('Storage unavailable'); };
  const payloads = [];
  const result = await sendConfiguredFlipNotice('published', { puzzle: 8616, date: '2026-10-20', validation: { status: 'matched', message: 'Verified' } }, {
    repo, webhook: 'https://discord.example/webhook', fetchImpl: async (url, options) => { assert.equal(url, 'https://discord.example/webhook'); payloads.push(JSON.parse(options.body)); return new Response('ok'); },
  });
  assert.equal(result.outcome, 'sent'); assert.equal(payloads.length, 1);
  assert.equal(payloads[0].embeds[0].fields.find(row => row.name === 'Babble chat').value, 'Announcement disabled.');
});
