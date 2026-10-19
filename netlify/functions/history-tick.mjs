import { service } from '../lib/history/runtime.mjs';
import { runScheduled } from '../lib/history/schedule.mjs';
import { notifyFlip } from '../lib/history/notifications.mjs';

export default async () => {
  // Disabled by default. Merely deploying this experiment never starts fetching
  // or publishing puzzles. It cannot touch the live babble-shared-data store.
  if (process.env.HISTORY_PREVIEW_SCHEDULE_ENABLED !== 'true') return;
  const result = await runScheduled({ createService: service, notify: notifyFlip });
  console.log('History preview tick', JSON.stringify(result));
};
// Midnight Central is 05:00 UTC in summer and 06:00 UTC in winter. The
// America/Chicago guard selects the correct hour without seasonal redeploys.
export const config = { schedule: '0-10,15,20,25,30,40,50 5,6 * * *' };
