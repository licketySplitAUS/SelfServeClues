import test from "node:test";
import assert from "node:assert/strict";
import notify from "../netlify/functions/babble-notify.mjs";

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
    geo: { country: { name: "Australia", code: "AU" } },
    ip: "192.0.2.1",
  });

  assert.equal(response.status, 204);
  assert.equal(sent.url, process.env.DISCORD_WEBHOOK_URL);
  assert.equal(sent.body.embeds[0].title, "New Babble Expert user");
  assert.deepEqual(
    sent.body.embeds[0].fields.map(({ name, value }) => [name, value]),
    [
      ["Anonymous user", "BE-ABCD-EFGH"],
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
    }),
  });
  const resourceResponse = await notify(resourceRequest, {
    geo: { country: { name: "Australia", code: "AU" } },
  });

  assert.equal(resourceResponse.status, 204);
  assert.equal(sent.body.embeds[0].title, "Babble Expert resource opened");
  assert.deepEqual(sent.body.embeds[0].fields[0], {
    name: "Resource",
    value: "Lickety Info everyone",
    inline: false,
  });

  const sessionResponse = await notify(new Request("https://example.test/api/babble-notify", {
    method: "POST",
    body: JSON.stringify({ event: "session", version: "3.1.2", platform: "Windows", architecture: "x64", anonymousId: "BE-ABCD-EFGH", durationSeconds: 3725 }),
  }), { geo: { country: { name: "Australia" } } });
  assert.equal(sessionResponse.status, 204);
  assert.equal(sent.body.embeds[0].title, "Babble Expert session ended");
  assert.deepEqual(sent.body.embeds[0].fields[0], { name: "Time in program", value: "1h 2m 5s", inline: false });

  await notify(new Request("https://example.test/api/babble-notify", {
    method: "POST",
    body: JSON.stringify({ event: "upgrade", version: "3.2.0", previousVersion: "3.1.2", platform: "Windows", architecture: "x64", anonymousId: "BE-ABCD-EFGH" }),
  }), { geo: { country: { name: "Australia" } } });
  assert.deepEqual(sent.body.embeds[0].fields[0], { name: "Version update", value: "3.1.2 -> 3.2.0", inline: false });
});
