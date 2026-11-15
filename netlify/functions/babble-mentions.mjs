import { getStore } from '@netlify/blobs';
import { env } from '../lib/env.mjs';
import { runMentions, webhookURL } from '../lib/babble-mentions.mjs';
import { sendReplyButton } from '../lib/discord-babble-ui.mjs';

export default async (_request, context) => {
  // Missing context must never opt a local test or preview into real delivery.
  if ((context?.deploy?.context || env('CONTEXT')) !== 'production' || env('BABBLE_MENTIONS_ENABLED') === 'false' || !env('DISCORD_MENTIONS_URL')) return;
  const store = getStore({ name: 'babble-chat-mentions-v1', consistency: 'strong' });
  const webhook = env('DISCORD_MENTIONS_URL');
  const buttonToken = env('DISCORD_BABBLE_ENABLED') === 'true' ? env('DISCORD_BABBLE_BOT_TOKEN') : null;
  const sendButton = buttonToken ? (sourceId, options) => sendReplyButton(webhookURL(webhook), buttonToken, sourceId, { ...options, guild: '1560784970560053318' }) : undefined;
  const summary = await runMentions({ store, webhook, sendButton });
  const log = summary.uncertain || summary.buttonFailures || /failed|uncertain/.test(summary.outcome) ? console.warn : console.log;
  log('Babble mentions', JSON.stringify(summary));
};
// Every five minutes, UTC, throughout the day (288 invocations/day).
export const config = { schedule: '*/5 * * * *' };
