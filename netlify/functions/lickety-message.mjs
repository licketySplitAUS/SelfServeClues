const response = (body, status) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export default async request => {
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const raw = await request.text();
  if (raw.length > 4096) return response({ error: 'Message is too large' }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return response({ error: 'Invalid message' }, 400); }
  if (typeof data?.message !== 'string' || !data.message.trim() || data.message.length > 500) {
    return response({ error: 'Enter a message of 1–500 characters.' }, 400);
  }
  const webhook = process.env.DISCORD_MESSAGE_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return response({ error: 'Messages are temporarily unavailable. Please try again later.' }, 503);
  const version = String(data.version || 'Unknown').replace(/[^0-9.a-z-]/gi, '').slice(0, 24) || 'Unknown';
  try {
    const sent = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ username: 'Babble Expert', allowed_mentions: { parse: [] }, embeds: [{
        title: 'A message for lickety', description: data.message.trim(), color: 0xffc857,
        fields: [{ name: 'Babble Expert version', value: version }], timestamp: new Date().toISOString(),
      }] }),
    });
    if (!sent.ok) return response({ error: 'Your message could not be delivered. Please try again.' }, 502);
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch { return response({ error: 'Your message could not be delivered. Please try again.' }, 502); }
};
export const config = { path: '/api/lickety-message' };
