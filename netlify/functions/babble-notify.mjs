const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store" },
});

const clean = (value, maximum = 40) => String(value || "Unknown")
  .replace(/[^\p{L}\p{N} .()+_-]/gu, "")
  .slice(0, maximum) || "Unknown";

export default async (request, context) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const raw = await request.text();
  if (raw.length > 2048) {
    return json({ error: "Request is too large" }, 413);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!data || !["install", "upgrade"].includes(data.event)) {
    return json({ error: "Invalid event" }, 400);
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return json({ error: "Notification service is not configured" }, 503);
  }

  const country = clean(
    context.geo?.country?.name || context.geo?.country?.code || "Unknown",
    60,
  );
  const isUpgrade = data.event === "upgrade";
  const message = {
    username: "Babble Expert",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: isUpgrade ? "Babble Expert upgraded" : "New Babble Expert user",
      color: isUpgrade ? 0xffc857 : 0x69e8c3,
      fields: [
        { name: "Version", value: clean(data.version), inline: true },
        {
          name: "Platform",
          value: `${clean(data.platform)} · ${clean(data.architecture)}`,
          inline: true,
        },
        { name: "Country", value: country, inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: "Anonymous opt-in notification" },
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

  if (!discordResponse.ok) {
    return json({ error: "Notification was rejected" }, 502);
  }

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
};

export const config = { path: "/api/babble-notify" };
