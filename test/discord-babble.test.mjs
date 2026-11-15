import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { babbleClient } from '../netlify/lib/history/babble.mjs';
import { createDiscordBabbleHandler, discordBabble, deliveryLedger, deliverBabbleReply, editDiscordReply } from '../netlify/lib/discord-babble.mjs';
import handler, { config } from '../netlify/functions/discord-babble.mjs';
import { registerBabbleCommand, registerBabbleOnBuild } from '../tools/discord/register-babble.mjs';
import { replyButton, replyModal, validReplyId, sendReplyButton } from '../netlify/lib/discord-babble-ui.mjs';

const keys = generateKeyPairSync('ed25519');
const settings = { ...discordBabble, publicKey: keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex') };
const now = Date.parse('2026-11-16T02:00:00Z');
const interaction = () => ({ application_id: settings.application, id: '1571425939013894275', type: 2, guild_id: settings.guild, channel_id: settings.channel, member: { user: { id: settings.user } }, token: 'fake-interaction-token', data: { name: 'babble', type: 1, options: [{ name: 'message', type: 3, value: 'Thanks Jacula!' }] } });
function signed(value, { timestamp = String(now / 1000), body = JSON.stringify(value), key = keys.privateKey, headers = {} } = {}) {
  const signature = sign(null, Buffer.from(timestamp + body), key).toString('hex');
  return new Request('https://fixture.invalid/api/discord-babble', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-signature-timestamp': timestamp, 'x-signature-ed25519': signature, ...headers } });
}
const production = { deploy: { context: 'production' } };
function storeFixture(initial = null) {
  let record = initial, revision = 0;
  return { get state() { return structuredClone(record?.data); }, writes: 0, fail: false,
    async getWithMetadata() { return structuredClone(record); },
    async setJSON(key, data, options) {
      if (this.fail) throw Error('private storage detail');
      if ((options.onlyIfNew && record) || (options.onlyIfMatch && options.onlyIfMatch !== record?.etag)) return { modified: false };
      record = { data: structuredClone(data), etag: String(++revision) }; this.writes++;
      return { modified: true, etag: record.etag };
    },
  };
}
const page = (username = settings.username, puzzle = 8642) => `<body>Logged in as: <b>${username}</b> <a href="/${puzzle}/11/15/2026#chat_log">chat</a>${'<img src="/images/a.gif">'.repeat(25)}</body>`;
function deliveryFixture() {
  const store = storeFixture(), ledger = deliveryLedger(store, () => now), notices = [], posts = [];
  let html = page(), current = page(), read = 0, failPost = false, visible = true;
  const client = { login: async () => html, page: async () => current, chat: async (puzzle, message) => { posts.push({ puzzle, message }); if (failPost) throw Error('secret'); } };
  const readChat = async () => ++read === 1 || !visible ? [] : [{ username: settings.username, text: 'Thanks Jacula!' }];
  const options = { ledger, client, readChat, notify: async (_i, content) => notices.push(content), settings, now: () => now };
  return { store, ledger, notices, posts, options, run: () => deliverBabbleReply(interaction(), 'Thanks Jacula!', options),
    html(value) { html = value; }, current(value) { current = value; }, failPost() { failPost = true; }, invisible() { visible = false; } };
}

test('signed production PING works while posting is disabled, with no storage or upstream access', async () => {
  const receive = createDiscordBabbleHandler({ settings, now: () => now, getLedger: () => assert.fail('No storage') });
  assert.deepEqual(await (await receive(signed({ type: 1, application_id: settings.application }), production)).json(), { type: 1 });
  assert.equal(config.path, '/api/discord-babble');
  assert.equal((await handler(new Request('https://fixture.invalid'), production)).status, 405);
});

test('unsigned, altered, stale, wrong-key, oversized, malformed and non-production requests have no effects', async () => {
  const receive = createDiscordBabbleHandler({ settings, now: () => now, enabled: () => assert.fail('No action') });
  const bad = [
    signed(interaction(), { headers: { 'x-signature-ed25519': '0'.repeat(128) } }),
    signed(interaction(), { timestamp: String(now / 1000 - 301) }),
    signed(interaction(), { key: generateKeyPairSync('ed25519').privateKey }),
    signed(interaction(), { body: '{' }),
    signed(interaction(), { body: ' '.repeat(16385) }),
    signed(interaction(), { headers: { 'content-type': 'text/plain' } }),
    signed(interaction(), { headers: { 'x-signature-timestamp': '' } }),
  ];
  for (const request of bad) assert.equal((await receive(request, production)).status, 401);
  for (const context of [{}, { deploy: { context: 'deploy-preview' } }, { deploy: { context: 'dev' } }]) assert.equal((await receive(signed(interaction()), context)).status, 404);
  assert.equal((await receive(signed({ ...interaction(), application_id: '1571425939013894000' }), production)).status, 403);
});

test('only the configured user, server, channel, command and single bounded message can post', async () => {
  const receive = createDiscordBabbleHandler({ settings, now: () => now, enabled: () => assert.fail('Invalid command must not execute') });
  for (const field of ['guild_id', 'channel_id', 'member']) {
    const i = interaction(); i[field] = field === 'member' ? { user: { id: '1571425939013894000' } } : '1571425939013894000';
    assert.match((await (await receive(signed(i), production)).json()).data.content, /only available/);
  }
  const bot = interaction(); bot.member.user.bot = true;
  assert.match((await (await receive(signed(bot), production)).json()).data.content, /only available/);
  for (const value of ['', ' ', 'x'.repeat(251), 'one\ntwo', 'one\u0000two', 42]) {
    const i = interaction(); i.data.options[0].value = value;
    assert.match((await (await receive(signed(i), production)).json()).data.content, /one line/);
  }
  for (const change of [i => { i.data.options.push(i.data.options[0]); }, i => { i.data.options[0].name = 'other'; }]) {
    const i = interaction(); change(i);
    assert.match((await (await receive(signed(i), production)).json()).data.content, /one line/);
  }
  const unknown = interaction(); unknown.data.name = 'other';
  assert.match((await (await receive(signed(unknown), production)).json()).data.content, /Use \/babble/);
});

test('disabled handler and missing waitUntil fail closed; malformed continuation tokens are rejected', async () => {
  for (const enabled of [false, true]) {
    const receive = createDiscordBabbleHandler({ settings, now: () => now, enabled: () => enabled, getLedger: () => assert.fail('No ledger') });
    const response = await receive(signed(interaction()), production);
    assert.match((await response.json()).data.content, /not enabled/);
  }
  const receive = createDiscordBabbleHandler({ settings, now: () => now });
  const i = interaction(); i.token = '../other/path';
  assert.equal((await receive(signed(i), production)).status, 400);
});

test('acknowledgement does not wait for the work; completion runs through waitUntil', async () => {
  let finish, pending, started = false;
  const gate = new Promise(resolve => { finish = resolve; });
  const receive = createDiscordBabbleHandler({ settings, now: () => now, enabled: () => true, getLedger: () => 'ledger', deliver: async (i, message, options) => {
    started = true; assert.equal(i.id, interaction().id); assert.equal(message, 'Thanks Jacula!'); assert.equal(options.ledger, 'ledger'); await gate;
  } });
  const response = await receive(signed(interaction()), { ...production, waitUntil: promise => { pending = promise; } });
  assert.deepEqual(await response.json(), { type: 5, data: { flags: 64 } });
  assert.ok(started); finish(); await pending;
});

test('conditional receipts serialize concurrent sends, prune expired receipts and never store chat/token data', async () => {
  let time = now;
  const store = storeFixture(), ledger = deliveryLedger(store, () => time);
  const id = interaction().id, other = '1571425939013894276';
  assert.deepEqual((await Promise.all([ledger.claim(id), ledger.claim(id)])).sort(), ['claimed', 'duplicate']);
  assert.equal(await ledger.claim(other), 'busy');
  await ledger.update(id, 'sent'); assert.equal(await ledger.claim(id), 'duplicate');
  assert.equal(await ledger.claim(other), 'claimed');
  assert.deepEqual(Object.keys(store.state.entries[0]).sort(), ['at', 'id', 'status']);
  time += 2 * 86400000;
  assert.equal(await ledger.claim('1571425939013894277'), 'claimed'); assert.equal(store.state.entries.length, 1);
  const corrupt = storeFixture({ data: null, etag: 'x' });
  await assert.rejects(deliveryLedger(corrupt).claim(id), /Invalid/); assert.equal(corrupt.writes, 0);
});

test('posts exactly once to a freshly checked grid and confirms the actual new archive entry', async () => {
  const f = deliveryFixture();
  assert.equal(await f.run(), 'sent');
  assert.deepEqual(f.posts, [{ puzzle: 8642, message: 'Thanks Jacula!' }]);
  assert.equal(f.store.state.entries[0].status, 'sent');
  assert.match(f.notices.at(-1), /Posted to Babble/);
  assert.equal(await f.run(), 'duplicate'); assert.equal(f.posts.length, 1); assert.equal(f.notices.length, 2);
});

test('wrong account, changed grid, stale puzzle date, unavailable archive and failed checkpoints never post', async () => {
  for (const change of [
    f => f.html(page('another-account')),
    f => f.current(page(settings.username, 8643)),
    f => f.current(page('another-account')),
    f => { f.options.now = () => now + 86400000; },
    f => { f.options.readChat = async () => { throw Error('secret'); }; },
    f => { f.store.fail = true; },
    f => { f.options.ledger.update = async () => { throw Error('secret'); }; },
    f => { f.options.notify = async () => { throw Error('secret'); }; },
  ]) {
    const f = deliveryFixture(); change(f);
    assert.equal(await f.run(), 'not-sent'); assert.equal(f.posts.length, 0);
    assert.ok(!f.notices.some(text => text.includes('secret')));
  }
});

test('uncertain public POST is read back but never replayed; old identical messages do not confirm a new send', async () => {
  const confirmed = deliveryFixture(); confirmed.failPost();
  assert.equal(await confirmed.run(), 'sent'); assert.equal(confirmed.posts.length, 1);
  const missing = deliveryFixture(); missing.failPost(); missing.invisible();
  assert.equal(await missing.run(), 'uncertain');
  assert.equal(await missing.run(), 'duplicate'); assert.equal(missing.posts.length, 1);
  assert.match(missing.notices.at(-1), /Check Babble chat/);
  const old = deliveryFixture(); old.options.readChat = async () => [{ username: settings.username, text: 'Thanks Jacula!' }];
  assert.equal(await old.run(), 'uncertain');
});

test('Discord feedback failures after a public send cannot cause a second Babble submission', async () => {
  const f = deliveryFixture(); let notices = 0;
  f.options.notify = async () => { if (++notices > 1) throw Error('private interaction token'); };
  assert.equal(await f.run(), 'sent'); assert.equal(await f.run(), 'duplicate'); assert.equal(f.posts.length, 1);
  const busy = deliveryFixture(); await busy.ledger.claim('1571425939013894279');
  assert.equal(await busy.run(), 'busy'); assert.equal(busy.posts.length, 0); assert.match(busy.notices[0], /not sent/);
});

test('Discord feedback uses the same response, disables pings and never follows redirects', async () => {
  let call;
  await editDiscordReply(interaction(), 'Done @everyone', async (url, options) => { call = { url, ...options }; return new Response(null, { status: 204 }); });
  assert.match(call.url, /\/messages\/@original$/); assert.equal(call.method, 'PATCH'); assert.equal(call.redirect, 'error');
  assert.deepEqual(JSON.parse(call.body).allowed_mentions, { parse: [] });
});

test('registration checks the app identity and upserts only /babble in the configured server', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    return Response.json(options.method === 'GET' ? { id: settings.application } : { id: interaction().id, application_id: settings.application, name: 'babble' });
  };
  assert.equal((await registerBabbleCommand({ token: 'fake-bot-token', fetchImpl })).name, 'babble');
  assert.equal(calls[1].method, 'POST'); assert.match(calls[1].url, new RegExp(`/guilds/${settings.guild}/commands$`));
  assert.equal(JSON.parse(calls[1].body).options[0].max_length, 250);
  await assert.rejects(registerBabbleCommand({ token: 'fake', fetchImpl: async () => Response.json({ id: 'wrong-app' }) }), /another Discord/);
  await assert.rejects(registerBabbleCommand({ token: 'fake', fetchImpl: async () => { throw Error('secret-token'); } }), error => !error.message.includes('secret-token'));
});

test('delivery uses the existing authenticated Babble adapter with mocked network, never submitting words', async () => {
  const f = deliveryFixture(), calls = [];
  f.options.client = babbleClient({ username: 'test@example.invalid', password: 'fixture', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), ...options }); return new Response(page());
  } });
  assert.equal(await f.run(), 'sent');
  const post = calls.find(call => call.url.endsWith('/action/add_chat_message'));
  assert.equal(new URLSearchParams(post.body).get('puzzleid'), '8642');
  assert.equal(new URLSearchParams(post.body).get('message'), 'Thanks Jacula!');
  assert.equal(calls.some(call => call.url.includes('/action/add_word')), false);
});

test('build registration reads secrets only with explicit opt-in in production', async () => {
  for (const [context, enabled] of [['production', undefined], ['production', 'false'], ['deploy-preview', 'true'], [undefined, 'true'], ['dev', 'true']]) {
    const readEnv = key => {
      assert.notEqual(key, 'DISCORD_BABBLE_BOT_TOKEN', 'Disabled/preview builds do not read the bot token');
      return key === 'CONTEXT' ? context : enabled;
    };
    assert.equal(await registerBabbleOnBuild({ readEnv, register: () => assert.fail('No registration') }), null);
  }
  let registrations = 0;
  const values = { CONTEXT: 'production', DISCORD_BABBLE_REGISTER_ON_BUILD: 'true', DISCORD_BABBLE_BOT_TOKEN: 'fake' };
  await registerBabbleOnBuild({ readEnv: key => values[key], register: async ({ token }) => { registrations++; assert.equal(token, 'fake'); return { name: 'babble' }; } });
  assert.equal(registrations, 1);
});

const buttonKey = 'fixture-bot-token';
const mentionChannel = '1571425939013894888';
function buttonClick() {
  return { ...interaction(), type: 3, channel_id: mentionChannel, message: { author: { id: settings.application } },
    data: { component_type: 2, custom_id: replyButton(mentionChannel, buttonKey)[0].components[0].custom_id } };
}
function modalSubmit() {
  return { ...interaction(), type: 5, channel_id: mentionChannel, data: {
    custom_id: replyModal(mentionChannel, '2026-11-15', buttonKey).data.custom_id,
    components: [{ type: 18, component: { type: 4, custom_id: 'message', value: 'Thanks Jacula!' } }],
  } };
}

test('owner button click opens the bounded form without sending or accessing delivery storage', async () => {
  const receive = createDiscordBabbleHandler({ settings, now: () => now, enabled: () => true, buttonKey: () => buttonKey,
    getLedger: () => assert.fail('No storage for opening a form'), deliver: () => assert.fail('Opening a form cannot send') });
  const result = await (await receive(signed(buttonClick()), production)).json();
  assert.equal(result.type, 9); assert.equal(result.data.title, 'Reply to Babble');
  assert.equal(result.data.components[0].component.max_length, 250);
  assert.equal(result.data.components[0].component.style, 1);
  assert.ok(result.data.custom_id.length <= 100);
});

test('button and form authorization binds owner, server, channel, app author and current puzzle date', async () => {
  const receive = createDiscordBabbleHandler({ settings, now: () => now, enabled: () => true, buttonKey: () => buttonKey,
    getLedger: () => assert.fail('Invalid form must not run') });
  for (const change of [
    i => { i.member.user.id = '1571425939013894889'; },
    i => { i.guild_id = '1571425939013894889'; },
    i => { i.channel_id = settings.channel; },
    i => { i.message.author.id = '1571425939013894889'; },
    i => { i.data.custom_id += 'a'; },
    i => { i.data.custom_id = '😀'.repeat(40); },
  ]) {
    const i = buttonClick(); change(i);
    assert.equal((await (await receive(signed(i), production)).json()).type, 4);
  }
  for (const change of [
    i => { i.data.custom_id = replyModal(mentionChannel, '2026-11-14', buttonKey).data.custom_id; },
    i => { i.channel_id = settings.channel; },
    i => { i.data.custom_id = replyModal(mentionChannel, '2026-11-15', 'rotated-token').data.custom_id; },
    i => { i.data.components[0].component.value = 'one\ntwo'; },
    i => { i.data.components.push(i.data.components[0]); },
  ]) {
    const i = modalSubmit(); change(i);
    assert.equal((await (await receive(signed(i), production)).json()).type, 4);
  }
});

test('valid modal submission uses the same deferred delivery with a pinned puzzle date', async () => {
  let pending, received;
  const receive = createDiscordBabbleHandler({ settings, now: () => now, enabled: () => true, buttonKey: () => buttonKey,
    getLedger: () => 'receipt', deliver: async (i, message, options) => { received = { i, message, options }; } });
  const response = await receive(signed(modalSubmit()), { ...production, waitUntil: job => { pending = job; } });
  assert.equal((await response.json()).type, 5); await pending;
  assert.equal(received.message, 'Thanks Jacula!'); assert.equal(received.options.expectedDate, '2026-11-15');
  const f = deliveryFixture(); f.options.expectedDate = '2026-11-14';
  assert.equal(await f.run(), 'not-sent'); assert.equal(f.posts.length, 0);
});

test('bot adds a referenced button in the checked mention channel with no pings or webhook migration', async () => {
  const calls = [];
  const id = await sendReplyButton('https://discord.com/api/webhooks/123/fixture', buttonKey, interaction().id, {
    guild: settings.guild, fetchImpl: async (url, options) => {
      calls.push({ url: String(url), ...options });
      return Response.json(options.method === 'POST' ? { id: '1571425939013894999' } : { guild_id: settings.guild, channel_id: mentionChannel });
    },
  });
  assert.equal(id, '1571425939013894999'); assert.equal(calls.length, 2);
  assert.match(calls[1].url, new RegExp(`/channels/${mentionChannel}/messages$`));
  const payload = JSON.parse(calls[1].body);
  assert.equal(payload.message_reference.message_id, interaction().id);
  assert.deepEqual(payload.allowed_mentions, { parse: [], replied_user: false });
  assert.ok(validReplyId(payload.components[0].components[0].custom_id, 'babble-reply', mentionChannel, null, buttonKey));
  assert.equal(calls[1].redirect, 'error');
});

test('bot button client distinguishes permission errors from ambiguous sends and rejects foreign guilds', async () => {
  for (const [mode, ambiguous] of [['foreign', false], ['permission', false], ['lost', true], ['no-id', true]]) {
    let posts = 0;
    await assert.rejects(sendReplyButton('https://discord.com/api/webhooks/123/fixture', buttonKey, interaction().id, {
      guild: settings.guild, fetchImpl: async (_url, options) => {
        if (options.method !== 'POST') return Response.json({ guild_id: mode === 'foreign' ? 'wrong' : settings.guild, channel_id: mentionChannel });
        posts++;
        if (mode === 'lost') throw Error('secret-token');
        if (mode === 'permission') return new Response(null, { status: 403 });
        return Response.json({});
      },
    }), error => error.ambiguous === ambiguous && !error.message.includes('secret-token'));
    assert.equal(posts, mode === 'foreign' ? 0 : 1);
  }
});
