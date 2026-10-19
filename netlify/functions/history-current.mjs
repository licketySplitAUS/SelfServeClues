import { service } from '../lib/history/runtime.mjs';

export default async request => {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const snapshot = await (await service()).current();
    return Response.json({ ...snapshot, schedulingEnabled: process.env.HISTORY_PREVIEW_SCHEDULE_ENABLED === 'true' }, { headers: { 'cache-control': 'public, max-age=30', 'netlify-cdn-cache-control': 'public, durable, max-age=60' } });
  } catch (error) {
    console.error('History preview read failed', error);
    return Response.json({ error: 'Preview data unavailable; the imported snapshot is still available.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
};
export const config = { path: '/history-api/current' };
