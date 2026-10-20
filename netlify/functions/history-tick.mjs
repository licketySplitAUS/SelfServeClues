import { env } from '../lib/history/babble.mjs';
import { scheduledAction } from '../lib/history/schedule.mjs';

export default async (request, context) => {
  if (env('HISTORY_PREVIEW_SCHEDULE_ENABLED') !== 'true') return;
  const now = new Date();
  if (!scheduledAction(now)) return;
  // Rare investigations must not compete with the scheduler's 30-second limit.
  const response = await fetch(new URL('/.netlify/functions/history-process', context?.site?.url || env('URL')), {
    method: 'POST', signal: AbortSignal.timeout(6000),
    headers: { 'content-type': 'application/json', 'x-admin-key': env('HISTORY_PREVIEW_ADMIN_KEY') || '' },
    body: JSON.stringify({ now: now.toISOString() }),
  });
  if (!response.ok) throw new Error(`Could not start flip check: HTTP ${response.status}`);
};
// Cover both Central UTC offsets and configurable starts through 00:59.
// The local-time guard reads no storage and makes no upstream requests except
// on the configured retry minutes and the one-hour notification deadline.
export const config = { schedule: '* 5-7 * * *' };
