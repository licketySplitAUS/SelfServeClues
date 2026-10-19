import { authorized, service } from '../lib/history/runtime.mjs';
import { gzipSync } from 'node:zlib';
import { notifyFlip } from '../lib/history/notifications.mjs';
import { scheduleStartMinute, puzzleNoticeDetails } from '../lib/history/schedule.mjs';

export default async request => {
  const headers = { 'cache-control': 'no-store' };
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  if (!authorized(request)) return Response.json({ error: 'Preview admin key is required. Configure HISTORY_PREVIEW_ADMIN_KEY to enable admin actions.' }, { status: 403, headers });
  try {
    const text = await request.text();
    if (text.length > 4096) return Response.json({ error: 'Request too large' }, { status: 413, headers });
    const body = JSON.parse(text), worker = await service();
    let result;
    if (body.action === 'check') result = await worker.check({ accept: body.accept === true });
    else if (body.action === 'rebuild') result = await worker.check({ rebuild: true });
    else if (body.action === 'manual') result = await worker.check({ manualGrid: body.grid });
    else if (body.action === 'word') result = await worker.check({ correction: body.correction });
    else if (body.action === 'rollback') result = await worker.rollback();
    else if (body.action === 'notify-test') {
      result = await notifyFlip('test', { ...puzzleNoticeDetails(await worker.current()), startMinute: scheduleStartMinute() });
      if (result.outcome !== 'sent') return Response.json({ error: result.outcome === 'not-configured' ? 'The Discord webhook is not configured.' : 'The Discord test could not be delivered.' }, { status: 503, headers });
      result.message = 'Discord test notification sent.';
    }
    else if (body.action === 'export') return new Response(gzipSync(JSON.stringify(await worker.backup())), { headers: { ...headers, 'content-type': 'application/gzip', 'content-disposition': 'attachment; filename="babble-history-preview-backup.json.gz"' } });
    else return Response.json({ error: 'Unknown admin action' }, { status: 400, headers });
    return Response.json({ ...result, snapshot: await worker.current() }, { headers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers });
  }
};
export const config = { path: '/history-api/admin' };
