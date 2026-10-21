import { getStore, getDeployStore } from '@netlify/blobs';
import { authorized } from '../lib/history/runtime.mjs';
import { env } from '../lib/history/babble.mjs';
import { publicationStatus, setPublication, configureLaunch } from '../lib/publication.mjs';

export default async (request, context) => {
  const headers = { 'cache-control': 'no-store' };
  const production = context?.deploy?.context === 'production';
  if (!['GET', 'POST'].includes(request.method)) return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  if (request.method === 'POST' && !authorized(request)) return Response.json({ error: 'The admin key is required to change the public clues page.' }, { status: 403, headers });
  if (request.method === 'POST' && !production) return Response.json({ error: 'Publication changes are only available on the production Admin page.' }, { status: 403, headers });
  try {
    const options = { name: 'babble-publication', consistency: 'strong' };
    const store = production ? getStore(options) : getDeployStore(options);
    if (request.method === 'GET') return Response.json(await publicationStatus({ store, configOnly: new URL(request.url).searchParams.get('config') === '1' }), { headers });
    const text = await request.text();
    if (text.length > 256) throw new Error('Publication request is too large.');
    const body = JSON.parse(text);
    const publicationOptions = { store, hook: env('BABBLE_PUBLICATION_BUILD_HOOK') };
    const result = body.action ? await configureLaunch(body.action, publicationOptions) : await setPublication(body.enabled, publicationOptions);
    return Response.json(result, { headers });
  } catch (error) { return Response.json({ error: error.message }, { status: 400, headers }); }
};
export const config = { path: '/history-api/publication' };
