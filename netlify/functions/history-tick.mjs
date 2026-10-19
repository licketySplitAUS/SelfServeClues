import { service } from '../lib/history/runtime.mjs';

export default async () => {
  // Disabled by default. Merely deploying this experiment never starts fetching
  // or publishing puzzles. It cannot touch the live babble-shared-data store.
  if (process.env.HISTORY_PREVIEW_SCHEDULE_ENABLED !== 'true') return;
  const result = await (await service()).check();
  console.log('History preview tick', JSON.stringify(result));
};
export const config = { schedule: '*/5 * * * *' };
