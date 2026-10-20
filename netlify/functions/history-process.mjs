import { authorized, service } from '../lib/history/runtime.mjs';
import { env } from '../lib/history/babble.mjs';
import { runScheduled, finishFlipWindow } from '../lib/history/schedule.mjs';
import { notifyFlip } from '../lib/history/notifications.mjs';

export default async (request, context) => {
  if (request.method !== 'POST' || !authorized(request) || env('HISTORY_PREVIEW_SCHEDULE_ENABLED') !== 'true') return;
  const payload = await request.json();
  const now = new Date(payload.now);
  if (!Number.isFinite(+now) || Math.abs(Date.now() - +now) > 300000) return;
  const options = { now, createService: () => service(context), notify: (event, details) => notifyFlip(event, details, context) };
  const result = await runScheduled(options);
  const summary = result.outcome === 'outside-window' ? await finishFlipWindow(options) : result;
  console.log('History preview check', JSON.stringify(summary));
};
export const config = { background: true };
