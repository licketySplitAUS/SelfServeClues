import { validBrowserId, browserField } from '../lib/browser-alias.mjs';
import { env } from '../lib/history/babble.mjs';
const json = (body, status) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const sources = { legacy: 'Original clues page', published: 'New clues page', 'self-serve': 'Self Serve clues page' };
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
  if (!data || typeof data.source !== 'string' || !Object.hasOwn(sources, data.source) || !Number.isInteger(data.words) || data.words < 1 || data.words > 2000 ||
      !['fireworks', 'message'].includes(data.effect) || (data.puzzle !== null && (typeof data.puzzle !== 'string' || !/^\d{1,8}$/.test(data.puzzle)))) return json({ error: 'Invalid completion notice' }, 400);
  if (data.browserId !== undefined && !validBrowserId(data.browserId)) return json({ error: 'Invalid browser ID' }, 400);
  const webhook = env('DISCORD_FIREWORKS_WEBHOOK_URL');
  if (!webhook) return json({ error: 'Notification service is not configured' }, 503);
  try {
    const sent = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ username: 'Lickety Clues', allowed_mentions: { parse: [] }, embeds: [{
        title: data.effect === 'message' ? 'Clues completed — reduced-motion celebration' : 'Clues completed — fireworks triggered', color: 0xffc857,
        fields: [browserField(data.browserId),
          { name: 'Source', value: sources[data.source], inline: true },
          { name: 'Puzzle', value: data.puzzle === null ? 'Custom grid' : String(data.puzzle), inline: true },
          { name: 'Words found', value: String(data.words), inline: true },
          { name: 'Celebration', value: data.effect === 'message' ? 'Congratulations message (reduced motion)' : 'Browser fireworks', inline: true },
        ], timestamp: new Date().toISOString(),
      }] }),
    });
    if (!sent.ok) return json({ error: 'Notification was rejected' }, 502);
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch { return json({ error: 'Notification service is unavailable' }, 502); }
};
export const config = { path: '/api/clues-fireworks', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 10, windowSize: 60 } };
