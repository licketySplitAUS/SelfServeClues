import { getStore, getDeployStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
export async function versionResponse(request, repo) {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    // The small publication pointer changes only after a complete snapshot is saved.
    // This endpoint never loads the dictionary, archive, solver or full snapshot.
    const { value } = await repo.control();
    const generation = value?.generation || null;
    const body = JSON.stringify({ generation });
    const etag = '"' + createHash('sha256').update(body).digest('hex').slice(0,24) + '"';
    const headers = { etag, 'cache-control': 'public, max-age=30', 'netlify-cdn-cache-control': 'public, durable, max-age=60' };
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    return new Response(body, { headers: { ...headers, 'content-type': 'application/json' } });
  } catch { return Response.json({ error: 'Publication version unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } }); }
}
export default (request, context) => {
  const production = (context?.deploy?.context || globalThis.Netlify?.env?.get('CONTEXT') || process.env.CONTEXT) === 'production';
  const options = { name: 'babble-history-preview-v1', consistency: 'strong' };
  const store = production ? getStore(options) : getDeployStore(options);
  return versionResponse(request, { control: async () => ({ value: await store.get('control', { type: 'json' }) }) });
};
export const config = { path: '/history-api/version' };
