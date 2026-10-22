import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { browserAlias, browserField, validBrowserId } from '../netlify/lib/browser-alias.mjs';
import guideHandler from '../netlify/functions/expert-guide-visit.mjs';
import fireworksHandler from '../netlify/functions/clues-fireworks.mjs';
const context = { module: { exports: {} }, URLSearchParams, Uint8Array };
vm.runInNewContext(fs.readFileSync(new URL('../public/browser-identity.js', import.meta.url), 'utf8'), context);
const { installBrowserIdentity } = context.module.exports;
const known = 'CV-12345678-1234-4234-8234-123456789abc';
function fixture({ jar = {}, storage = new Map(), hostname = 'r46.me', guide = false, from = false, blocked = false, electron = false } = {}) {
  const notices = [], writes = [];
  const doc = {};
  Object.defineProperty(doc, 'cookie', { get() { if (blocked) throw Error('blocked'); return jar.value || ''; }, set(value) { if (blocked) throw Error('blocked'); writes.push(value); jar.value = value.split(';')[0]; } });
  const win = { document: doc, navigator: { userAgent: electron ? 'Chrome Electron/44' : 'Chrome' }, crypto: { randomUUID },
    location: { hostname, protocol: 'https:', pathname: guide ? '/babble-expert.html' : '/babbleclues', search: from ? '?from=rainbow-button' : '' },
    localStorage: { getItem(key) { if (blocked) throw Error('blocked'); return storage.get(key); }, setItem(key,value) { if (blocked) throw Error('blocked'); storage.set(key,value); } },
    fetch(url, options) { notices.push({ url, data: JSON.parse(options.body) }); return Promise.resolve({ ok: true }); },
  };
  return { win, notices, writes, jar, storage };
}
test('browser ID persists across reloads and the main/subdomain cookie reconciles separate browser storage', () => {
  const main = fixture(); const first = installBrowserIdentity(main.win).getId(); assert.ok(validBrowserId(first));
  assert.match(main.writes[0], /Domain=r46.me/); assert.match(main.writes[0], /Max-Age=31536000/); assert.match(main.writes[0], /Secure/);
  const reload = fixture({ jar: main.jar, storage: main.storage }); assert.equal(installBrowserIdentity(reload.win).getId(), first);
  const sibling = fixture({ jar: main.jar, hostname: 'selfserve.r46.me' }); assert.equal(installBrowserIdentity(sibling.win).getId(), first);
  const other = fixture(); assert.notEqual(installBrowserIdentity(other.win).getId(), first);
  const alias = browserAlias(first); assert.equal(browserAlias(first), alias); assert.ok(browserField(first).value.includes(first));
});
test('storage fallback, blocked storage and malformed values are handled without breaking the page', () => {
  const f = fixture({ storage: new Map([['lickety_browser_id', known]]) }); assert.equal(installBrowserIdentity(f.win).getId(), known);
  const blocked = fixture({ blocked: true }); const api = installBrowserIdentity(blocked.win); const id = api.getId(); assert.ok(validBrowserId(id)); assert.equal(api.getId(), id);
  const bad = fixture({ jar: { value: 'lickety_browser_id=bad' } }); assert.ok(validBrowserId(installBrowserIdentity(bad.win).getId()));
  const aliasHost = fixture({ hostname: 'selfserveclues.netlify.app' }); installBrowserIdentity(aliasHost.win); assert.doesNotMatch(aliasHost.writes[0], /Domain=/);
  assert.equal(browserAlias(known), 'Jade Robin'); assert.equal(browserAlias('bad'), 'Unidentified browser'); assert.equal(validBrowserId('BE-ABCD-EFGH'), false);
});
test('guide sends one visit per document with the shared ID and link source; clues and Expert send no guide visits', () => {
  const f = fixture({ guide: true, from: true }); const id = installBrowserIdentity(f.win).getId(); installBrowserIdentity(f.win);
  assert.deepEqual(f.notices, [{ url: '/api/expert-guide-visit', data: { browserId: id, source: 'rainbow-button' } }]);
  const next = fixture({ guide: true, jar: f.jar }); installBrowserIdentity(next.win); assert.equal(next.notices[0].data.browserId, id); assert.equal(next.notices[0].data.source, 'direct');
  const clues = fixture(); installBrowserIdentity(clues.win); assert.equal(clues.notices.length, 0);
  const expert = fixture({ guide: true, electron: true }); assert.equal(installBrowserIdentity(expert.win).getId(), undefined); assert.equal(expert.notices.length, 0);
});
test('same browser alias appears in guide and fireworks reports, and no personal data is forwarded', async t => {
  const previousFetch = globalThis.fetch; const keys = ['DISCORD_EXPERT_GUIDE_WEBHOOK_URL', 'DISCORD_FIREWORKS_WEBHOOK_URL']; const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  t.after(() => { globalThis.fetch = previousFetch; for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  process.env.DISCORD_EXPERT_GUIDE_WEBHOOK_URL = 'https://example.invalid/guide'; process.env.DISCORD_FIREWORKS_WEBHOOK_URL = 'https://example.invalid/fireworks';
  const sent = []; globalThis.fetch = async (url, options) => { sent.push({ url, body: JSON.parse(options.body) }); return new Response(null, { status: 204 }); };
  const request = (path, body) => new Request('https://r46.me/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://r46.me' }, body: JSON.stringify(body) });
  assert.equal((await guideHandler(request('expert-guide-visit', { browserId: known, source: 'rainbow-button', name: 'private-name', words: ['secretword'] }))).status, 204);
  assert.equal((await fireworksHandler(request('clues-fireworks', { browserId: known, source: 'published', puzzle: '8618', words: 155, effect: 'fireworks' }))).status, 204);
  assert.deepEqual(sent.map(s => s.url), ['https://example.invalid/guide', 'https://example.invalid/fireworks']);
  assert.deepEqual(sent[0].body.embeds[0].fields[0], sent[1].body.embeds[0].fields[0]);
  assert.equal(sent[0].body.embeds[0].fields[1].value, 'Babble Expert rainbow button');
  assert.doesNotMatch(JSON.stringify(sent), /private-name|secretword/); assert.deepEqual(sent[0].body.allowed_mentions, { parse: [] });
  await fireworksHandler(request('clues-fireworks', { source: 'legacy', puzzle: '8618', words: 155, effect: 'fireworks' }));
  assert.match(sent.at(-1).body.embeds[0].fields[0].value, /older page/);
});
test('invalid guide reports never contact Discord, and missing configuration/failures stay bounded', async t => {
  const previousFetch = globalThis.fetch, previousHook = process.env.DISCORD_EXPERT_GUIDE_WEBHOOK_URL;
  t.after(() => { globalThis.fetch = previousFetch; if (previousHook === undefined) delete process.env.DISCORD_EXPERT_GUIDE_WEBHOOK_URL; else process.env.DISCORD_EXPERT_GUIDE_WEBHOOK_URL = previousHook; });
  globalThis.fetch = () => assert.fail('Invalid report must not send');
  const request = (body, headers = {}) => new Request('https://r46.me/api/expert-guide-visit', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  for (const body of [null, {}, { browserId: 'bad', source: 'direct' }, { browserId: known, source: 'free text' }, '{']) assert.equal((await guideHandler(request(body))).status, 400);
  assert.equal((await guideHandler(request({ browserId: known, source: 'direct' }, { origin: 'https://unrelated.example' }))).status, 403);
  assert.equal((await guideHandler(request('x'.repeat(513)))).status, 413);
  delete process.env.DISCORD_EXPERT_GUIDE_WEBHOOK_URL;
  assert.equal((await guideHandler(request({ browserId: known, source: 'direct' }))).status, 503);
  process.env.DISCORD_EXPERT_GUIDE_WEBHOOK_URL = 'https://example.invalid/guide';
  globalThis.fetch = async () => new Response(null, { status: 429 }); assert.equal((await guideHandler(request({ browserId: known, source: 'direct' }))).status, 502);
});
