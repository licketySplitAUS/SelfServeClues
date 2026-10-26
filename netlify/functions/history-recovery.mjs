import { getStore } from '@netlify/blobs';
import { authorized, service } from '../lib/history/runtime.mjs';
import { gzipSync } from 'node:zlib';
import { sqlExport, emergencyPage } from '../lib/recovery-exports.mjs';
import { loadBaseline } from '../lib/history/baseline.mjs';
import { inventory, readRecord } from '../lib/recovery.mjs';
import { env } from '../lib/env.mjs';
import { BATCH_PROTOCOL, MAX_BATCH_BODY, readBatch } from '../lib/recovery-batch.mjs';

export const createHandler = ({ openStore = name => getStore({ name, consistency: 'strong' }) } = {}) => async (request, context) => {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (!['GET', 'POST'].includes(request.method)) return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  if (!authorized(request) && !authorized(request, env('HISTORY_BACKUP_KEY'))) return Response.json({ error: 'The admin or read-only backup key is required for backups.' }, { status: 403, headers });
  if (context?.deploy?.context !== 'production') return Response.json({ error: 'Use the production Admin page for recovery backups.' }, { status: 403, headers });
  try {
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415, headers });
      if (Number(request.headers.get('content-length')) > MAX_BATCH_BODY) return Response.json({ error: 'Backup batch request is too large.' }, { status: 413, headers });
      const text = await request.text();
      if (Buffer.byteLength(text) > MAX_BATCH_BODY) return Response.json({ error: 'Backup batch request is too large.' }, { status: 413, headers });
      let body;
      try { body = JSON.parse(text); } catch { return Response.json({ error: 'Invalid batch JSON.' }, { status: 400, headers }); }
      return Response.json(await readBatch(openStore, body?.records), { headers });
    }
    const params = new URL(request.url).searchParams;
    if (['sql', 'html'].includes(params.get('format'))) {
      const saved = await (await service(context)).backup();
      if (params.get('format') === 'html') return new Response(emergencyPage(saved.snapshot.current), { headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-disposition': 'attachment; filename="babbleclues.html"' } });
      const games = params.get('scope') === 'delta' ? Object.values(saved.state.puzzles) : [saved.snapshot.current];
      return new Response(gzipSync([...sqlExport(games, saved.state.corrections)].join('')), { headers: { ...headers, 'content-type': 'application/gzip', 'content-disposition': 'attachment; filename="babble-sql-staging.sql.gz"' } });
    }
    if (params.has('store')) return Response.json(await readRecord(openStore, params.get('store'), params.get('key'), params.get('etag')), { headers });
    return Response.json(await inventory(openStore, { siteID: context.site.id, deployID: context.deploy.id, baselineVersion: (await loadBaseline()).sourceVersion, batch: BATCH_PROTOCOL }), { headers });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 409, headers }); }
};
export default createHandler();
export const config = { path: '/history-api/recovery' };
