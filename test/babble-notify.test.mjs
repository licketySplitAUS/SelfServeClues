import test from "node:test";
import assert from "node:assert/strict";
import { createHandler, upgradeDelivery } from "../netlify/functions/babble-notify.mjs";
const notify = createHandler();

test('upgrade receipts suppress repeat launches, allow a later version and retry failed delivery', async t => {
  const prior = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_WEBHOOK_URL = 'https://example.invalid/mock';
  t.after(() => { if (prior === undefined) delete process.env.DISCORD_WEBHOOK_URL; else process.env.DISCORD_WEBHOOK_URL = prior; });
  const rows = new Map(); let etag = 0, sends = 0, ok = true;
  const store = {
    getWithMetadata: async key => rows.get(key),
    setJSON: async (key, data, options) => {
      const row = rows.get(key);
      if ((options.onlyIfNew && row) || (options.onlyIfMatch && row?.etag !== options.onlyIfMatch)) return { modified: false };
      const next = { data, etag: String(++etag) }; rows.set(key, next); return { modified: true, etag: next.etag };
    }
  };
  const handler = createHandler({ delivery: upgradeDelivery(store), send: async () => { sends++; return { ok }; } });
  const request = version => new Request('https://example.test/api/babble-notify', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'upgrade', anonymousId: 'BE-ABCD-EFGH', previousVersion: '3.3.0.0', version }) });
  assert.equal((await handler(request('3.4.0.0'), {})).status, 204);
  assert.equal((await handler(request('3.4.0'), {})).status, 204);
  assert.equal(sends, 1);
  ok = false; assert.equal((await handler(request('3.5.0.0'), {})).status, 502);
  ok = true; assert.equal((await handler(request('3.5.0.0'), {})).status, 204);
  assert.equal(sends, 3);
  const busy = await upgradeDelivery(store).claim({ anonymousId: 'BE-ABCD-EFGH', version: '3.6.0' });
  assert.ok(busy.key);
  assert.equal((await handler(request('3.6.0'), {})).status, 503);
  assert.equal(sends, 3);
});

test("Babble notification sends only the approved fields to Discord", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWebhook = process.env.DISCORD_WEBHOOK_URL;
  let sent;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalWebhook === undefined) delete process.env.DISCORD_WEBHOOK_URL;
    else process.env.DISCORD_WEBHOOK_URL = originalWebhook;
  });

  process.env.DISCORD_WEBHOOK_URL = "https://example.invalid/private-webhook";
  globalThis.fetch = async (url, options) => {
    sent = { url, body: JSON.parse(options.body) };
    return new Response(null, { status: 204 });
  };

  const request = new Request("https://example.test/api/babble-notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "install",
      version: "3.1.2",
      platform: "Windows",
      architecture: "x64",
      anonymousId: "BE-ABCD-EFGH",
      ignored: "must not be forwarded",
    }),
  });
  const response = await notify(request, {
    geo: { city: "Sydney", latitude: -33.8, longitude: 151.2, postalCode: "2000", country: { name: "Australia", code: "AU" } },
    ip: "192.0.2.1",
  });

  assert.equal(response.status, 204);
  assert.equal(sent.url, process.env.DISCORD_WEBHOOK_URL);
  assert.equal(sent.body.embeds[0].title, "New Babble Expert user");
  assert.equal(sent.body.embeds[0].footer, undefined);
  assert.ok(sent.body.embeds[0].timestamp);
  assert.doesNotMatch(JSON.stringify(sent.body), /Sydney|151.2|2000/);
  assert.deepEqual(
    sent.body.embeds[0].fields.map(({ name, value }) => [name, value]),
    [
      ["Anonymous user", "Katherine\nBE-ABCD-EFGH"],
      ["Version", "3.1.2"],
      ["Platform", "Windows / x64"],
      ["Country", "Australia"],
    ],
  );
  assert.doesNotMatch(JSON.stringify(sent.body), /192\.0\.2\.1|must not be forwarded/);

  const resourceRequest = new Request("https://example.test/api/babble-notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "resource",
      version: "3.1.2",
      platform: "Windows",
      architecture: "x64",
      anonymousId: "BE-ABCD-EFGH",
      item: "Lickety Info <@everyone>",
      locationConsentVersion: 3,
    }),
  });
  const resourceResponse = await notify(resourceRequest, {
    geo: { city: "Sydney", country: { name: "Australia", code: "AU" } },
  });

  assert.equal(resourceResponse.status, 204);
  assert.equal(sent.body.embeds[0].title, "Babble Expert resource opened");
  assert.deepEqual(sent.body.embeds[0].fields.at(-1), { name: "Approx. city", value: "Sydney", inline: true });
  assert.deepEqual(sent.body.embeds[0].fields[0], {
    name: "Resource",
    value: "Lickety Info everyone",
    inline: false,
  });

  const sessionResponse = await notify(new Request("https://example.test/api/babble-notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "session", version: "3.1.2", platform: "Windows", architecture: "x64", anonymousId: "BE-ABCD-EFGH", durationSeconds: 3725 }),
  }), { geo: { country: { name: "Australia" } } });
  assert.equal(sessionResponse.status, 204);
  assert.equal(sent.body.embeds[0].title, "Babble Expert session ended");
  assert.deepEqual(sent.body.embeds[0].fields[0], { name: "Time in program", value: "1h 2m 5s", inline: false });

  await notify(new Request("https://example.test/api/babble-notify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "upgrade", version: "3.2.0", previousVersion: "3.1.2", platform: "Windows", architecture: "x64", anonymousId: "BE-ABCD-EFGH" }),
  }), { geo: { country: { name: "Australia" } } });
  assert.deepEqual(sent.body.embeds[0].fields[0], { name: "Version update", value: "3.1.2 -> 3.2.0", inline: false });
});

// Routing keeps all unspecified events on the original webhook.
test('installs, upgrades, startups and session endings use dedicated channels with a fallback', async t => {
  const originalFetch = globalThis.fetch;
  const keys = ['DISCORD_WEBHOOK_URL','DISCORD_UPGRADE_WEBHOOK_URL','DISCORD_NEW_USER_WEBHOOK_URL','DISCORD_SESSION_WEBHOOK_URL','DISCORD_STARTUP_WEBHOOK_URL'];
  const previous = Object.fromEntries(keys.map(key=>[key,process.env[key]]));const sent=[];
  t.after(()=>{globalThis.fetch=originalFetch;for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
  process.env.DISCORD_WEBHOOK_URL='https://example.invalid/default';process.env.DISCORD_UPGRADE_WEBHOOK_URL='https://example.invalid/upgrades';process.env.DISCORD_NEW_USER_WEBHOOK_URL='https://example.invalid/new-users';
  process.env.DISCORD_SESSION_WEBHOOK_URL='https://example.invalid/sessions';process.env.DISCORD_STARTUP_WEBHOOK_URL='https://example.invalid/startups';
  globalThis.fetch=async(url, options)=>{sent.push(url);const message=JSON.parse(options.body);if(url==='https://example.invalid/startups'){assert.equal(message.embeds[0].title,'Babble Expert started');assert.ok(message.embeds[0].fields.some(field=>field.name==='Anonymous user'&&field.value.includes('BE-ABCD-EFGH')));}return new Response(null,{status:204});};
  for(const event of ['install','upgrade','resource','option','startup','session']) await notify(new Request('https://example.test/api/babble-notify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event,anonymousId:'BE-ABCD-EFGH'})}),{});
  assert.deepEqual(sent,['https://example.invalid/new-users','https://example.invalid/upgrades','https://example.invalid/default','https://example.invalid/default','https://example.invalid/startups','https://example.invalid/sessions']);
  delete process.env.DISCORD_SESSION_WEBHOOK_URL;
  await notify(new Request('https://example.test/api/babble-notify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'session'})}),{});
  assert.equal(sent.at(-1),'https://example.invalid/default');
});


test('existing Expert fireworks starts and replays use the dedicated webhook while other options stay unchanged', async t => {
  const originalFetch = globalThis.fetch;
  const keys = ['DISCORD_WEBHOOK_URL', 'DISCORD_FIREWORKS_WEBHOOK_URL'];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { globalThis.fetch = originalFetch; for (const key of keys) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; } });
  process.env.DISCORD_WEBHOOK_URL = 'https://example.invalid/default';
  process.env.DISCORD_FIREWORKS_WEBHOOK_URL = 'https://example.invalid/fireworks';
  const sent = [];
  globalThis.fetch = async (url, options) => { sent.push({ url, body: JSON.parse(options.body) }); return new Response(null, { status: 204 }); };
  for (const [event, item] of [['option', 'Fireworks'], ['option', 'Fireworks replay'], ['resource', 'Fireworks'], ['option', 'Zoom 100%']]) {
    assert.equal((await notify(new Request('https://example.test/api/babble-notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, item, anonymousId: 'BE-ABCD-EFGH' }) }), {})).status, 204);
  }
  assert.deepEqual(sent.map(s => s.url), ['https://example.invalid/fireworks', 'https://example.invalid/fireworks', 'https://example.invalid/fireworks', 'https://example.invalid/default']);
  assert.equal(sent[0].body.embeds[0].title, 'Babble Expert fireworks triggered');
  delete process.env.DISCORD_FIREWORKS_WEBHOOK_URL;
  await notify(new Request('https://example.test/api/babble-notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'option', item: 'Fireworks' }) }), {});
  assert.equal(sent.at(-1).url, 'https://example.invalid/default');
});
