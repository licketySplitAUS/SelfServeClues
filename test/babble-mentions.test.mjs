import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveURL, puzzleLink, chatInstant, parseChat, isMention, localTime, mentionGroups, discordAlert, sendAlert, webhookURL, runMentions } from '../netlify/lib/babble-mentions.mjs';
import handler, { config } from '../netlify/functions/babble-mentions.mjs';

const hook = 'https://discord.com/api/webhooks/123/fake-test-token';
const day = { date: '2026-11-14', puzzle: 8641 };
const now = new Date('2026-11-15T03:00:00Z');
const page = (rows, date = day.date) => `<h2>${new Date(date + 'T12:00:00Z').toUTCString().slice(0, 16)}</h2><h2 id="chat_log">ENTIRE CHAT LOG</h2><div class="log">${rows.map((text, index) => `<div class="post"><span class="time">8:${String(index).padStart(2, '0')} pm</span><div class="name">Player ${index}</div><div class="message">${text}</div></div>`).join('')}</div>`;
const link = value => `<a href="/${value.puzzle}/${value.date.slice(5, 7)}/${value.date.slice(8)}/${value.date.slice(0, 4)}#chat_log">Chat</a>`;
function memoryStore() {
  let row = null, revision = 0, writes = 0;
  return { get writes() { return writes; }, get state() { return structuredClone(row?.data); },
    async getWithMetadata() { return structuredClone(row); },
    async setJSON(key, data, options) {
      if ((options.onlyIfNew && row) || (options.onlyIfMatch && options.onlyIfMatch !== row?.etag)) return { modified: false };
      row = { data: structuredClone(data), etag: String(++revision) }; writes++; return { modified: true, etag: row.etag };
    },
  };
}
function monitorFixture() {
  const store = memoryStore(), calls = [], posts = [], edits = [];
  let rows = ['Before', 'Thanks Lickety'], current = day, clock = now;
  const datedRows = new Map(), archiveHTML = new Map();
  let discordFailure = null, babbleFailure = false;
  const fetchImpl = async (url, options) => {
    url = String(url); calls.push(url);
    if (url.startsWith('https://discord.com/')) {
      if (discordFailure) return discordFailure();
      const payload = JSON.parse(options.body); (options.method === 'PATCH' ? edits : posts).push(payload);
      return Response.json({ id: '123456789012345678' });
    }
    if (babbleFailure) throw Error('Private URL must not reach logs');
    const match = new URL(url).pathname.match(/^\/(\d+)\/(\d\d)\/(\d\d)\/(\d{4})$/);
    const date = match && `${match[4]}-${match[2]}-${match[3]}`;
    return new Response(url.endsWith('.com/') ? link(current) : archiveHTML.get(date) || page(datedRows.get(date) || rows, date));
  };
  return { store, calls, posts, edits, run: (options = {}) => runMentions({ store, webhook: hook, now: clock, fetchImpl, ...options }),
    rows(value, date) { if (date) datedRows.set(date, value); else rows = value; }, day(value) { current = value; }, now(value) { clock = new Date(value); },
    html(value, date = day.date) { archiveHTML.set(date, value); },
    discordFailure(value) { discordFailure = value; }, babbleFailure(value) { babbleFailure = value; } };
}

test('archive identity and parser keep full text, duplicate posts, emoji and Central chronological order', () => {
  assert.equal(puzzleLink(link(day)).date, day.date);
  assert.equal(archiveURL(day), 'https://www.playbabble.com/8641/11/14/2026');
  assert.throws(() => archiveURL({ ...day, date: '2026-02-31' }), /identity/);
  assert.throws(() => puzzleLink('<a href="https://evil.test/8641/11/14/2026#chat_log">chat</a>'), /identify/);
  const rows = parseChat(page(['Before', 'Thanks &amp; LICKETY<br>line two 🤣']), day);
  assert.equal(rows[1].text, 'Thanks & LICKETY\nline two 🤣');
  assert.equal(rows[1].username, 'Player 1');
  assert.equal(rows[1].at, '2026-11-15T02:01:00.000Z');
  assert.equal(rows[1].mention, true);
  assert.throws(() => parseChat(page(['Word'], '2026-11-13'), day), /date or structure/);
  assert.throws(() => parseChat('<h2>14 Nov 2026</h2>', day), /structure/);
  const duplicates = page(['same', 'same']).replace('8:01 pm', '8:00 pm').replace('Player 1', 'Player 0');
  const parsed = parseChat(duplicates, day);
  assert.notEqual(parsed[0].id, parsed[1].id, 'Identical consecutive posts remain separate messages');
  assert.deepEqual(parseChat(duplicates, day), parsed, 'IDs are stable on the next poll');
});

test('matching ignores usernames and accepts phrase case, whitespace, possessives and nickname', () => {
  for (const text of ['LICKETY', "lickety’s clues", 'Thanks LicketySplitAUS', 'licketys clues', 'BABBLE\nExpert']) assert.ok(isMention(text), text);
  for (const text of ['expert', 'babble', 'slickety', 'babble expertise']) assert.equal(isMention(text), false);
  assert.equal(parseChat(page(['ordinary post']).replace('Player 0', 'licketySplitAUS'), day)[0].mention, false);
});

test('Sydney timestamps follow both countries daylight saving and retain the correct date', () => {
  assert.equal(chatInstant('2026-11-14', '8:12 pm'), '2026-11-15T02:12:00.000Z');
  assert.match(localTime('2026-11-15T02:12:00Z'), /15 Nov 2026, 1:12 pm AEDT/);
  assert.match(localTime(chatInstant('2026-07-14', '8:12 pm')), /15 July 2026, 11:12 am AEST/);
  assert.equal(chatInstant('2026-11-01', '1:10 am', Date.parse('2026-11-01T06:59:00Z')), '2026-11-01T07:10:00.000Z');
  assert.throws(() => chatInstant('2026-03-08', '2:10 am'), /chronological/);
  assert.throws(() => chatInstant('2026-11-14', '13:00 pm'), /Invalid/);
});

test('groups include one prior message and three after the last nearby mention', () => {
  const rows = parseChat(page(['unused', 'Before', 'lickety', 'Reply', 'babble expert', 'One', 'Two', 'Three', 'Unused', 'Before 2', 'lickety', 'After']), day);
  const groups = mentionGroups(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].messages.map(row => row.text), ['Before', 'lickety', 'Reply', 'babble expert', 'One', 'Two', 'Three']);
  assert.equal(groups[0].replies, 3);
  assert.deepEqual(groups[1].messages.map(row => row.text), ['Before 2', 'lickety', 'After']);
  assert.equal(groups[1].replies, 1);
  assert.equal(mentionGroups(rows.slice(2, 3))[0].messages.length, 1, 'First message of a log needs no invented predecessor');
});

test('archive tail can cross midnight during the flip without accepting other backwards clocks', () => {
  const html = page(['Late mention Lickety', 'At midnight', 'Just after midnight'])
    .replace('8:00 pm', '11:50 pm').replace('8:01 pm', '12:00 am').replace('8:02 pm', '12:01 am');
  const rows = parseChat(html, day);
  assert.deepEqual(rows.map(row => row.at), ['2026-11-15T05:50:00.000Z', '2026-11-15T06:00:00.000Z', '2026-11-15T06:01:00.000Z']);
  assert.equal(rows[1].date, day.date, 'Archive identity stays with its source day');
  assert.deepEqual(parseChat(html, day), rows, 'Rollover IDs stay stable');
  assert.throws(() => parseChat(html.replace('12:01 am', '11:49 pm'), day), /chronological/);
  assert.throws(() => parseChat(html.replace('12:01 am', '12:00 am').replace('12:00 am', '12:02 am'), day), /chronological/);
  assert.throws(() => chatInstant(day.date, '12:00 am', Date.parse('2026-11-15T02:00:00Z')), /chronological/);
  assert.equal(chatInstant('2026-12-31', '12:00 am', Date.parse('2027-01-01T05:59:00Z')), '2027-01-01T06:00:00.000Z');
});

test('Discord rendering escapes chat markup, disables pings and attaches oversized conversations in full', () => {
  const group = mentionGroups(parseChat(page(['Before', 'lickety @everyone &lt;@123&gt; **spoiler**']), day))[0];
  const alert = discordAlert(group);
  assert.deepEqual(alert.payload.allowed_mentions, { parse: [] });
  assert.match(alert.payload.embeds[0].description, /\\\*\\\*spoiler\\\*\\\*/);
  assert.match(alert.payload.embeds[0].footer.text, /Waiting for 3/);
  const long = ('lickety ' + 'complete words '.repeat(600)).trimEnd();
  const overflow = discordAlert(mentionGroups(parseChat(page(['Before', long]), day))[0]);
  assert.ok(overflow.attachment.includes(long));
  assert.ok(overflow.payload.embeds[0].description.length < 3900);
});

test('webhook client creates with wait=true, edits the same post, and uploads a full transcript when needed', async () => {
  assert.throws(() => webhookURL('https://evil.test/api/webhooks/123/token'), /Discord webhook/);
  assert.throws(() => webhookURL('http://discord.com/api/webhooks/123/token'), /Discord webhook/);
  const alert = discordAlert(mentionGroups(parseChat(page(['lickety']), day))[0]);
  let call;
  const fetchImpl = async (url, options) => { call = { url: String(url), ...options }; return Response.json({ id: '123' }); };
  assert.equal(await sendAlert(hook, alert, { fetchImpl }), '123');
  assert.match(call.url, /\?wait=true$/); assert.equal(call.method, 'POST');
  await sendAlert(hook, { ...alert, attachment: 'Complete text 🤣' }, { fetchImpl, messageId: '123' });
  assert.match(call.url, /\/messages\/123$/); assert.equal(call.method, 'PATCH');
  assert.equal(await call.body.get('files[0]').text(), 'Complete text 🤣');
  assert.deepEqual(JSON.parse(call.body.get('payload_json')).allowed_mentions, { parse: [] });
  await assert.rejects(sendAlert(hook, alert, { fetchImpl: async () => { throw Error('secret URL'); } }), error => error.ambiguous === true && !error.message.includes('secret'));
  await assert.rejects(sendAlert(hook, alert, { fetchImpl: async () => new Response('', { status: 429, headers: { 'retry-after': '600' } }) }), error => error.retryAfter === 600000 && !error.ambiguous);
});

test('monitor sends promptly, updates replies/nearby mentions in place and makes no duplicate sends on unchanged polls', async () => {
  const f = monitorFixture();
  assert.equal((await f.run()).sent, 1); assert.equal(f.posts.length, 1);
  assert.equal(f.calls.filter(url => url.endsWith('.com/')).length, 1);
  await f.run(); assert.equal(f.posts.length, 1); assert.equal(f.edits.length, 0);
  assert.equal(f.calls.filter(url => url.endsWith('.com/')).length, 1, 'Discover puzzle only once per Central day');
  f.rows(['Before', 'Thanks Lickety', 'One']);
  assert.equal((await f.run()).updated, 1);
  f.rows(['Before', 'Thanks Lickety', 'One', 'Babble Expert', 'Two', 'Three', 'Four']);
  assert.equal((await f.run()).updated, 1);
  assert.match(f.edits.at(-1).embeds[0].footer.text, /Includes three/);
  await f.run(); assert.equal(f.edits.length, 2); assert.equal(f.posts.length, 1);
  assert.equal(f.store.state.lease, undefined);
});

test('a rate limit defers the webhook as a whole; ambiguous creates are retained without automatic resend', async () => {
  const f = monitorFixture();
  f.discordFailure(() => new Response('', { status: 429, headers: { 'retry-after': '600' } }));
  await f.run(); const calls = f.calls.length;
  f.now('2026-11-15T03:05:00Z'); await f.run(); assert.equal(f.calls.length, calls);
  f.now('2026-11-15T03:10:00Z'); f.discordFailure(null); assert.equal((await f.run()).sent, 1);
  const ambiguous = monitorFixture(); ambiguous.discordFailure(() => { throw Error('lost response'); });
  assert.equal((await ambiguous.run()).uncertain, 1);
  ambiguous.now('2026-11-15T03:05:00Z'); ambiguous.discordFailure(null);
  const summary = await ambiguous.run(); assert.equal(summary.sent, 0); assert.equal(summary.uncertain, 1);
  assert.equal(ambiguous.posts.length, 0, 'Unknown acceptance is not blindly posted a second time');
});

test('failed updates retry the saved message ID; malformed/failed upstream polls preserve data and back off', async () => {
  const f = monitorFixture(); await f.run(); f.rows(['Before', 'Thanks Lickety', 'Reply']);
  f.discordFailure(() => { throw Error('lost PATCH response'); }); await f.run();
  assert.equal(Object.values(f.store.state.alerts)[0].status, 'retry');
  f.now('2026-11-15T03:05:00Z'); f.discordFailure(null); await f.run();
  assert.equal(f.posts.length, 1); assert.equal(f.edits.length, 1);
  f.babbleFailure(true); await f.run(); const prior = f.store.state.days[0].messages;
  const calls = f.calls.length; await f.run(); assert.equal(f.calls.length, calls);
  f.now('2026-11-15T03:10:00Z'); f.babbleFailure(false); f.rows(['Before']);
  assert.equal((await f.run()).outcome, 'chat-check-failed');
  assert.deepEqual(f.store.state.days[0].messages, prior);
});

test('midnight finalizes the previous archive once and carries context into the new day', async () => {
  const f = monitorFixture(); await f.run();
  f.rows(['Before', 'Thanks Lickety', 'Late reply before midnight'], '2026-11-14');
  f.rows(['First reply after midnight', 'Second reply after midnight'], '2026-11-15');
  f.day({ puzzle: 8642, date: '2026-11-15' }); f.now('2026-11-15T06:05:00Z');
  await f.run(); assert.equal(f.store.state.days[0].closed, true);
  const oldURL = archiveURL(day), count = f.calls.filter(url => url === oldURL).length;
  await f.run(); assert.equal(f.calls.filter(url => url === oldURL).length, count);
  assert.equal(f.posts.length, 1); assert.equal(f.edits.length, 1);
  assert.match(f.edits[0].embeds[0].description, /Late reply before midnight/);
  assert.match(f.edits[0].embeds[0].description, /Second reply after midnight/);
  assert.match(f.edits[0].embeds[0].footer.text, /Includes three/);
});

test('midnight post left on yesterday archive does not block the new grid mentions', async () => {
  const f = monitorFixture();
  f.now('2026-11-15T05:55:00Z');
  f.html(page(['Last message']).replace('8:00 pm', '11:50 pm'));
  await f.run();
  f.html(page(['Last message', 'Flip message']).replace('8:00 pm', '11:50 pm').replace('8:01 pm', '12:00 am'));
  f.rows(['Clues are up', 'TY Lickety', 'Thanks lICKetY and Yea re what you said.'], '2026-11-15');
  f.day({ puzzle: 8642, date: '2026-11-15' }); f.now('2026-11-15T06:25:00Z');
  const result = await f.run();
  assert.equal(result.outcome, 'checked'); assert.equal(result.sent, 1);
  assert.equal(f.store.state.days[0].closed, true);
  assert.equal(f.store.state.days[1].messages.length, 3);
  assert.match(f.posts[0].embeds[0].description, /TY Lickety/);
  assert.match(f.posts[0].embeds[0].description, /Thanks lICKetY/);
  await f.run(); assert.equal(f.posts.length, 1); assert.equal(f.edits.length, 0);
});

test('conditional lease excludes overlapping runs and unknown state is never overwritten', async () => {
  const store = memoryStore();
  await store.setJSON('monitor', { version: 1, lease: { until: now.getTime() + 60000 } }, { onlyIfNew: true });
  const result = await runMentions({ store, webhook: hook, now, fetchImpl: () => { throw Error('must not fetch'); } });
  assert.equal(result.outcome, 'busy-or-backoff'); assert.equal(store.writes, 1);
  const unknown = memoryStore(); await unknown.setJSON('monitor', { version: 9 }, { onlyIfNew: true });
  await assert.rejects(runMentions({ store: unknown, webhook: hook, now }), /Unknown/);
  assert.equal(unknown.writes, 1);
});

test('missed dates are caught up within the two-day recovery window and old cached days are pruned', async () => {
  const f = monitorFixture(); await f.run();
  f.day({ puzzle: 8643, date: '2026-11-16' }); f.now('2026-11-16T23:00:00Z'); await f.run();
  assert.deepEqual(f.store.state.days.map(day => day.date), ['2026-11-14', '2026-11-15', '2026-11-16']);
  assert.ok(f.calls.includes('https://www.playbabble.com/8642/11/15/2026'));
  f.day({ puzzle: 8644, date: '2026-11-17' }); f.now('2026-11-17T23:00:00Z'); await f.run();
  assert.deepEqual(f.store.state.days.map(day => day.date), ['2026-11-15', '2026-11-16', '2026-11-17']);
  assert.equal(f.posts.length, 1, 'A long conversation reuses its receipt as its first day ages out');
});

test('initial backlogs are limited to three Discord mutations per scheduled run', async () => {
  const f = monitorFixture();
  f.rows(Array.from({ length: 24 }, (_, index) => index % 6 === 0 ? 'lickety' : 'ordinary reply'));
  assert.equal((await f.run()).sent, 3); assert.equal(f.posts.length, 3);
  assert.equal((await f.run()).sent, 1); assert.equal(f.posts.length, 4);
  await f.run(); assert.equal(f.posts.length, 4);
});

test('one app reply button is added beneath an alert, without changing its webhook or duplicating updates', async () => {
  const f = monitorFixture(), buttons = [];
  const sendButton = async id => { buttons.push(id); return '1571425939013894999'; };
  const first = await f.run({ sendButton });
  assert.equal(first.sent, 1); assert.equal(first.buttons, 1);
  assert.deepEqual(buttons, ['123456789012345678']);
  await f.run({ sendButton }); assert.equal(buttons.length, 1);
  f.rows(['Before', 'Thanks Lickety', 'A new reply']);
  assert.equal((await f.run({ sendButton })).updated, 1);
  assert.equal(buttons.length, 1); assert.equal(f.posts.length, 1);
  assert.equal(Object.values(f.store.state.alerts)[0].replyButton.status, 'sent');
});

test('uncertain button creation is not replayed and cannot stop the existing mention alert updating', async () => {
  const f = monitorFixture(); let attempts = 0;
  const sendButton = async () => { attempts++; throw Object.assign(Error('lost response'), { ambiguous: true }); };
  assert.equal((await f.run({ sendButton })).uncertain, 1);
  f.rows(['Before', 'Thanks Lickety', 'Another reply']);
  const next = await f.run({ sendButton });
  assert.equal(next.updated, 1); assert.equal(next.uncertain, 1); assert.equal(attempts, 1);
  assert.equal(f.posts.length, 1);
});

test('token rotation refreshes an existing button ID in place, with safe retries after a lost PATCH', async () => {
  const f = monitorFixture(), calls = [];
  let fail = false;
  const sendButton = async (sourceId, options) => {
    calls.push({ sourceId, messageId: options.messageId });
    if (fail) throw Object.assign(Error('lost PATCH'), { ambiguous: false });
    return '1571425939013894999';
  };
  await f.run({ sendButton, buttonRevision: 'old' });
  assert.equal(calls[0].messageId, undefined);
  fail = true;
  await f.run({ sendButton, buttonRevision: 'new' });
  assert.equal(calls[1].messageId, '1571425939013894999');
  assert.equal(Object.values(f.store.state.alerts)[0].replyButton.messageId, '1571425939013894999');
  fail = false; f.now('2026-11-15T03:05:00Z');
  assert.equal((await f.run({ sendButton, buttonRevision: 'new' })).buttons, 1);
  assert.equal(calls[2].messageId, '1571425939013894999');
  await f.run({ sendButton, buttonRevision: 'new' }); assert.equal(calls.length, 3);
  assert.equal(f.posts.length, 1); assert.equal(f.edits.length, 0);
  assert.equal(Object.values(f.store.state.alerts)[0].replyButton.revision, 'new');
});

test('button permissions can be retried without reposting alerts and all mutations share the run budget', async () => {
  const f = monitorFixture(); let attempts = 0;
  const sendButton = async () => { attempts++; throw Object.assign(Error('permission'), { ambiguous: false }); };
  assert.equal((await f.run({ sendButton })).buttonFailures, 1);
  await f.run({ sendButton }); assert.equal(attempts, 1);
  f.now('2026-11-15T03:05:00Z');
  await f.run({ sendButton }); assert.equal(attempts, 2); assert.equal(f.posts.length, 1);
  const backlog = monitorFixture();
  backlog.rows(Array.from({ length: 24 }, (_, index) => index % 6 === 0 ? 'lickety' : 'reply'));
  let cards = 0;
  for (let poll = 0; poll < 4; poll++) {
    const result = await backlog.run({ sendButton: async () => String(1571425939013894000n + BigInt(++cards)) });
    assert.ok(result.sent + result.updated + result.buttons <= 3);
  }
  assert.equal(cards, 4); assert.equal(backlog.posts.length, 4);
});

test('archive bounds and changed chronology fail instead of silently dropping or reordering messages', async () => {
  assert.throws(() => parseChat(page(Array(2001).fill('word')), day), /post limit/);
  assert.throws(() => parseChat(page(['x'.repeat(20001)]), day), /oversized/);
  assert.throws(() => parseChat(page(['first', 'second']).replace('8:01 pm', '7:00 pm'), day), /chronological/);
  const f = monitorFixture(); await f.run(); f.rows(['changed', 'Thanks Lickety']);
  const previous = f.store.state.days[0].messages;
  assert.equal((await f.run()).outcome, 'chat-check-failed');
  assert.deepEqual(f.store.state.days[0].messages, previous);
  assert.equal(f.posts.length, 1);
});

test('scheduled wrapper fails closed for previews, missing context, disabled or absent webhook', async t => {
  assert.equal(config.schedule, '*/5 * * * *');
  const keys = ['CONTEXT', 'DISCORD_MENTIONS_URL', 'BABBLE_MENTIONS_ENABLED'];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; } });
  delete process.env.CONTEXT; process.env.DISCORD_MENTIONS_URL = hook;
  await handler(null, {}); await handler(null, { deploy: { context: 'deploy-preview' } });
  process.env.BABBLE_MENTIONS_ENABLED = 'false'; await handler(null, { deploy: { context: 'production' } });
  delete process.env.BABBLE_MENTIONS_ENABLED; delete process.env.DISCORD_MENTIONS_URL;
  await handler(null, { deploy: { context: 'production' } });
});
