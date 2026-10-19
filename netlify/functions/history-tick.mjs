import { service } from '../lib/history/runtime.mjs';
import { runScheduled, finishFlipWindow } from '../lib/history/schedule.mjs';
import { notifyFlip } from '../lib/history/notifications.mjs';

export default async () => {
  // Disabled by default. Merely deploying this experiment never starts fetching
  // or publishing puzzles. It cannot touch the live babble-shared-data store.
  if (process.env.HISTORY_PREVIEW_SCHEDULE_ENABLED !== 'true') return;
  const result = await runScheduled({ createService: service, notify: notifyFlip });
  const summary = result.outcome === 'outside-window' ? await finishFlipWindow({ createService: service, notify: notifyFlip }) : result;
  if (summary.outcome !== 'outside-window') console.log('History preview tick', JSON.stringify(summary));
};
// Cover both Central UTC offsets and configurable starts through 00:59.
// The local-time guard reads no storage and makes no upstream requests except
// on the configured retry minutes and the one-hour notification deadline.
export const config = { schedule: '* 5-7 * * *' };
