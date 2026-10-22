import { getStore } from '@netlify/blobs';
import { diagnosticDelivery } from '../lib/diagnostic-delivery.mjs';
export default async (_request, context) => {
  if (context?.deploy?.context !== 'production') return;
  await diagnosticDelivery(getStore({ name: 'expert-diagnostic-delivery', consistency: 'strong' })).cleanup();
};
export const config = { schedule: '31 8 * * *' };
