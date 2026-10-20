import { getStore } from '@netlify/blobs';
import { makePageCounter } from '../lib/page-counter.mjs';

export default async (request, context) => {
  if (context?.deploy?.context !== 'production') return;
  await makePageCounter({ store: getStore({ name: 'babble-page-views', consistency: 'strong' }) }).seal();
};
export const config = { schedule: '0 4 * * *' };
