import { anonymousAlias } from "../lib/anonymous-alias.mjs";

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store" },
});

const clean = (value, maximum = 40) => String(value || "Unknown")
  .replace(/[^\p{L}\p{N} .()+_-]/gu, "")
  .slice(0, maximum) || "Unknown";

const anonymousId = (value) => /^BE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(String(value || ""))
  ? String(value)
  : "Unknown";

const duration = (value) => {
  const seconds = Math.max(0, Math.min(60 * 60 * 24 * 31, Math.round(Number(value) || 0)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours ? `${hours}h` : "", minutes || hours ? `${minutes}m` : "", `${remainder}s`].filter(Boolean).join(" ");
};

export default async (request, context) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const raw = await request.text();
  if (raw.length > 2048) return json({ error: "Request is too large" }, 413);

  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!data || !["install", "upgrade", "resource", "option", "session"].includes(data.event)) {
    return json({ error: "Invalid event" }, 400);
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return json({ error: "Notification service is not configured" }, 503);

  const country = clean(context.geo?.country?.name || context.geo?.country?.code || "Unknown", 60);
  const titles = {
    install: "New Babble Expert user",
    upgrade: "Babble Expert upgraded",
    resource: "Babble Expert resource opened",
    option: "Babble Expert option used",
    session: "Babble Expert session ended",
  };
  const colors = { install: 0x69e8c3, upgrade: 0xffc857, resource: 0x69c8ff, option: 0xb58cff, session: 0xff78b8 };
  const fields = [
    { name: "Anonymous user", value: anonymousAlias(data.anonymousId) + "\n" + anonymousId(data.anonymousId), inline: true },
    { name: "Version", value: clean(data.version), inline: true },
    { name: "Platform", value: `${clean(data.platform)} / ${clean(data.architecture)}`, inline: true },
    { name: "Country", value: country, inline: true },
  ];
  // Older clients consented to country only. Never enrich those reports with city.
  if (data.locationConsentVersion === 3 && context.geo?.city) {
    fields.push({ name: "Approx. city", value: clean(context.geo.city, 80), inline: true });
  }
  if (["resource", "option"].includes(data.event)) {
    fields.unshift({ name: data.event === "resource" ? "Resource" : "Option", value: clean(data.item, 80), inline: false });
  }
  if (data.event === "upgrade") {
    fields.unshift({ name: "Version update", value: `${clean(data.previousVersion, 24)} -> ${clean(data.version, 24)}`, inline: false });
  }
  if (data.event === "session") {
    fields.unshift({ name: "Time in program", value: duration(data.durationSeconds), inline: false });
  }

  const message = {
    username: "Babble Expert",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: titles[data.event],
      color: colors[data.event],
      fields,
      timestamp: new Date().toISOString(),
    }],
  };

  let discordResponse;
  try {
    discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch {
    return json({ error: "Notification service is unavailable" }, 502);
  }
  if (!discordResponse.ok) return json({ error: "Notification was rejected" }, 502);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/babble-notify" };
