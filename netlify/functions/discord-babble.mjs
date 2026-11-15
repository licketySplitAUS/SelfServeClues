import { getStore } from '@netlify/blobs';
import { env } from '../lib/env.mjs';
import { createDiscordBabbleHandler, deliveryLedger, deliverBabbleReply } from '../lib/discord-babble.mjs';

export default createDiscordBabbleHandler({
  enabled: () => env('DISCORD_BABBLE_ENABLED') === 'true',
  buttonKey: () => env('DISCORD_BABBLE_BOT_TOKEN') || '',
  getLedger: () => deliveryLedger(getStore({ name: 'babble-discord-replies-v1', consistency: 'strong' })),
  deliver: async (...args) => {
    const outcome = await deliverBabbleReply(...args);
    console.log('Babble Discord reply', outcome);
    return outcome;
  },
});
export const config = { path: '/api/discord-babble' };
