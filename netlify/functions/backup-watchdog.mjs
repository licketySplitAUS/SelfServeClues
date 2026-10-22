import { getStore } from '@netlify/blobs';
import { backupAlarm } from '../lib/backup-health.mjs';
export default async (_request, context) => {
  if (context?.deploy?.context !== 'production') return;
  const store = getStore({ name: 'babble-backup-health', consistency: 'strong' });
  const status = await store.get('status', { type: 'json' });
  if (status?.lastSuccessAt && Date.now() - Date.parse(status.lastSuccessAt) < 36 * 3600000) return;
  const key = 'alerts/' + new Date().toISOString().slice(0, 10);
  if (!(await store.setJSON(key, {}, { onlyIfNew: true })).modified) return;
  try { await backupAlarm('No successful private backup has been recorded in the last 36 hours. Check the BabbleBackups Actions schedule and credentials.'); }
  catch (error) { await store.delete(key); throw error; }
};
export const config = { schedule: '17 9 * * *' };
