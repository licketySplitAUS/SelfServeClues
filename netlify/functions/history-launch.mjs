import { getStore } from '@netlify/blobs';
import { env } from '../lib/env.mjs';
import { runPublicationLaunch } from '../lib/publication.mjs';

export default async (request, context) => {
  if (context?.deploy?.context !== 'production') return;
  const result = await runPublicationLaunch({
    store: getStore({ name: 'babble-publication', consistency: 'strong' }),
    hook: env('BABBLE_PUBLICATION_BUILD_HOOK'),
  });
  console.log('One-time clues launch', JSON.stringify(result));
};
// 22 October 2026 midnight CDT = 05:00 UTC. Minute retries cover delayed
// invocations; the saved launch is consumed once and expires after one hour.
// The explicit year/date guard in runPublicationLaunch prevents annual repeats.
export const config = { schedule: '* 5-6 22 10 *' };
