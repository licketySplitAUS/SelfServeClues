import { getStore } from '@netlify/blobs';
import { authorized } from '../lib/admin-auth.mjs';
import { env } from '../lib/env.mjs';
import { backupAlarm } from '../lib/backup-health.mjs';
export function createHandler({ openStore = () => getStore({ name: 'babble-backup-health', consistency: 'strong' }), alarm = backupAlarm } = {}) { return async (request, context) => {
  const headers = { 'cache-control': 'no-store' };
  const backupAuthorized = authorized(request, env('HISTORY_BACKUP_KEY'));
  if (!backupAuthorized && !(request.method === 'GET' && authorized(request))) return Response.json({ error: 'Backup authorization required.' }, { status: 403, headers });
  if (context?.deploy?.context !== 'production') return Response.json({ error: 'Production only.' }, { status: 403, headers });
  const store = openStore();
  if (request.method === 'GET') return Response.json(await store.get('status', { type: 'json' }) || { outcome: 'not-recorded' }, { headers });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers });
  const raw = await request.text();
  if (raw.length > 512) return new Response(null, { status: 413, headers });
  let data; try { data = JSON.parse(raw); } catch { return new Response(null, { status: 400, headers }); }
  if (!['success', 'failed'].includes(data?.status)) return new Response(null, { status: 400, headers });
  const prior = await store.get('status', { type: 'json' });
  const run = /^https:\/\/github\.com\/licketySplitAUS\/BabbleBackups\/actions\/runs\/\d+$/.test(data.runURL || '') ? data.runURL : undefined;
  const at = new Date().toISOString();
  await store.setJSON('status', { outcome: data.status, at, lastSuccessAt: data.status === 'success' ? at : prior?.lastSuccessAt || null, runURL: run });
  if (data.status === 'failed') await alarm('The scheduled private backup job failed.' + (run ? `\n[Open the backup run](${run})` : ''));
  return new Response(null, { status: 204, headers });
};
}
export default createHandler();
export const config = { path: '/history-api/backup-status', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 10, windowSize: 60 } };
