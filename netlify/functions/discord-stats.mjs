import { authorized } from '../lib/admin-auth.mjs';
import { env } from '../lib/env.mjs';
import { configuredChannels, testInstallations, reportRange, pageRange, createDiscordReader, DiscordError } from '../lib/discord-stats.mjs';
import { resolveInstallationAlias } from '../lib/alias-registry.mjs';

export function createHandler({ getEnv = env, fetchImpl = fetch, now = Date.now, authorize = authorized, resolveAlias } = {}) {
  let reader, currentToken;
  return async request => {
    const headers = { 'cache-control': 'private, no-store', 'netlify-cdn-cache-control': 'no-store' };
    const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { ...headers, ...extra } });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (!authorize(request)) return json({ error: 'Enter the admin key to read Discord statistics.' }, 403);
    try {
      const token = getEnv('DISCORD_STATS_BOT_TOKEN')?.trim();
      if (!token) return json({ error: 'DISCORD_STATS_BOT_TOKEN is not configured for this deployment’s Functions scope.' }, 503);
      const channels = configuredChannels(getEnv('DISCORD_STATS_CHANNEL_IDS'));
      if (token !== currentToken) { currentToken = token; reader = createDiscordReader({ token, fetchImpl, now }); }
      const params = new URL(request.url).searchParams;
      const action = params.get('action') || 'start';
      if (action === 'connection') return json(await reader.connection(channels));
      if (action === 'start') {
        const range = reportRange(params, now());
        const tests = resolveAlias ? await Promise.all(testInstallations.map(async row => ({ ...row, name: row.name === 'Synthetic' ? row.name : await resolveAlias(row.id) }))) : testInstallations;
        return json({ channels, testInstallations: tests, range, generatedAt: new Date(now()).toISOString() });
      }
      if (action !== 'page') return json({ error: 'Unknown statistics action' }, 400);
      const channel = channels.find(channel => channel.id === params.get('channel'));
      if (!channel) return json({ error: 'This channel is not configured for statistics.' }, 400);
      const result = structuredClone(await reader.page(channel, pageRange(params, now())));
      if (resolveAlias) for (const group of result.groups) for (const [id, actor] of Object.entries(group.installations)) {
        const synthetic = testInstallations.find(row => row.id === id && row.name === 'Synthetic');
        actor.name = synthetic ? synthetic.name : await resolveAlias(id);
      }
      return json(result);
    } catch (error) {
      if (error instanceof DiscordError) return json({ error: error.message, channelError: [403, 404].includes(error.status), retryAfter: error.retryAfter || undefined }, error.status, error.retryAfter ? { 'retry-after': String(error.retryAfter) } : {});
      // Configuration/validation errors are ours; never forward HTTP response
      // bodies, credentials, message contents or arbitrary exception messages.
      if (/^(?:DISCORD_STATS_CHANNEL_IDS|Choose |Invalid report|Invalid Discord)/.test(error.message || '')) return json({ error: error.message }, 400);
      return json({ error: 'Discord statistics could not be generated. Please try again.' }, 502);
    }
  };
}
export default createHandler({ resolveAlias: resolveInstallationAlias });
export const config = { path: '/history-api/discord-stats', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 300, windowSize: 60 } };
