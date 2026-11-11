import { blobRepository } from '../lib/history/repository.mjs';
import { currentSnapshot, importedSnapshot } from '../lib/history/current.mjs';
import { scheduleStartMinute } from '../lib/history/schedule.mjs';
import { env } from '../lib/env.mjs';

export const createHandler = ({ repository = blobRepository, loadImported = importedSnapshot } = {}) => async (request, context) => {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const snapshot = await currentSnapshot(repository(context), loadImported);
    return Response.json({ ...snapshot, deploymentContext: context?.deploy?.context || env('CONTEXT') || 'unknown', schedulingEnabled: env('HISTORY_PREVIEW_SCHEDULE_ENABLED') === 'true', startMinute: scheduleStartMinute() }, { headers: { 'cache-control': 'public, max-age=30', 'netlify-cdn-cache-control': 'public, durable, max-age=60' } });
  } catch (error) {
    console.error('History preview read failed', error);
    return Response.json({ error: 'Preview data unavailable; the imported snapshot is still available.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
};
export default createHandler();
export const config = { path: '/history-api/current' };
