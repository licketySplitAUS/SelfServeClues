import { env } from '../lib/history/babble.mjs';
import { validBrowserId, browserField } from '../lib/browser-alias.mjs';
const json = (body, status) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const origins = new Set(['https://r46.me', 'https://selfserve.r46.me', 'https://selfserveclues.netlify.app']);
export default async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const origin = request.headers.get('origin');
  if (origin && !origins.has(origin)) return json({ error: 'Unsupported origin' }, 403);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'JSON required' }, 415);
  const raw = await request.text();
  if (raw.length > 512) return json({ error: 'Request is too large' }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!validBrowserId(data?.browserId) || !['rainbow-button', 'direct'].includes(data?.source)) return json({ error: 'Invalid visit notice' }, 400);
  if (data.client !== undefined && !['expert', 'browser'].includes(data.client)) return json({ error: 'Invalid visit client' }, 400);
  const webhook = env('DISCORD_EXPERT_GUIDE_WEBHOOK_URL');
  if (!webhook) return json({ error: 'Notification service is not configured' }, 503);
  try {
    const sent = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ username: 'Lickety Clues', allowed_mentions: { parse: [] }, embeds: [{
        title: 'Babble Expert information page visited', color: 0xffc857,
        fields: [browserField(data.browserId), { name: 'Opened from', value: data.source === 'rainbow-button' ? 'Babble Expert rainbow button' : 'Direct link or bookmark', inline: true }, { name: 'Opened in', value: data.client === 'expert' ? 'Babble Expert' : 'Web browser', inline: true }],
        timestamp: new Date().toISOString(),
      }] }),
    });
    if (!sent.ok) return json({ error: 'Notification was rejected' }, 502);
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch { return json({ error: 'Notification service is unavailable' }, 502); }
};
export const config = { path: '/api/expert-guide-visit', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 20, windowSize: 60 } };
