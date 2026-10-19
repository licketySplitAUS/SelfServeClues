import { service } from '../lib/history/runtime.mjs';
import { finishFlipWindow } from '../lib/history/schedule.mjs';
import { notifyFlip } from '../lib/history/notifications.mjs';

export default async () => {
  if (process.env.HISTORY_PREVIEW_SCHEDULE_ENABLED !== 'true') return;
  // No upstream fetch here: at the deadline only send an unresolved-flip alert.
  const result = await finishFlipWindow({ createService: service, notify: notifyFlip });
  console.log('History preview flip deadline', JSON.stringify(result));
};
export const config = { schedule: '0 6,7 * * *' };
