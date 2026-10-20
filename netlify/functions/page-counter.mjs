import { getStore, getDeployStore } from '@netlify/blobs';
import { makePageCounter, validVisitId } from '../lib/page-counter.mjs';

export default async (request, context) => {
  const headers = { 'cache-control': 'no-store' };
  if (!['GET', 'POST'].includes(request.method)) return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  let visitId = null;
  if (request.method === 'POST') {
    try {
      const text = await request.text();
      if (text.length > 128) throw new Error('Too large');
      visitId = JSON.parse(text).visitId;
      if (!validVisitId(visitId)) throw new Error('Invalid ID');
    } catch { return Response.json({ error: 'A valid page visit ID is required.' }, { status: 400, headers }); }
  }
  try {
    const options = { name: 'babble-page-views', consistency: 'strong' };
    const store = context?.deploy?.context === 'production' ? getStore(options) : getDeployStore(options);
    const counter = makePageCounter({ store });
    const count = visitId === null ? await counter.read() : await counter.record(visitId);
    return Response.json({ count }, { headers });
  } catch (error) {
    console.error('Page counter storage unavailable', error.code || 'unknown');
    return Response.json({ error: 'The visit counter is temporarily unavailable.' }, { status: 503, headers });
  }
};
export const config = { path: '/api/page-counter' };
