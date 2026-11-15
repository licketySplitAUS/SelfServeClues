import { getStore } from '@netlify/blobs';
import { env } from '../lib/env.mjs';
import { runMentions } from '../lib/babble-mentions.mjs';

export default async (_request, context) => {
  // Missing context must never opt a local test or preview into real delivery.
  if ((context?.deploy?.context || env('CONTEXT')) !== 'production' || env('BABBLE_MENTIONS_ENABLED') === 'false' || !env('DISCORD_MENTIONS_URL')) return;
  const store = getStore({ name: 'babble-chat-mentions-v1', consistency: 'strong' });
  const summary = await runMentions({ store, webhook: env('DISCORD_MENTIONS_URL') });
  const log = summary.uncertain || /failed|uncertain/.test(summary.outcome) ? console.warn : console.log;
  log('Babble mentions', JSON.stringify(summary));
};
// Every five minutes, UTC, throughout the day (288 invocations/day).
export const config = { schedule: '*/5 * * * *' };
