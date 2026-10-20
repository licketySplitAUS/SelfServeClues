import { authorized } from '../lib/history/runtime.mjs';
import { blobRepository } from '../lib/history/repository.mjs';
import { chatSettings, saveChatSettings } from '../lib/history/chat-settings.mjs';

export default async (request, context) => {
  const headers = { 'cache-control': 'no-store' };
  if (!['GET', 'POST'].includes(request.method)) return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  if (request.method === 'POST' && !authorized(request)) return Response.json({ error: 'The admin key is required to change chat announcements.' }, { status: 403, headers });
  if (request.method === 'POST' && context?.deploy?.context !== 'production') return Response.json({ error: 'Change chat announcements on the production Admin page.' }, { status: 403, headers });
  try {
    const repo = blobRepository(context);
    if (request.method === 'GET') return Response.json(await chatSettings(repo), { headers });
    const text = await request.text();
    if (text.length > 128) throw new Error('Request is too large.');
    return Response.json(await saveChatSettings(repo, JSON.parse(text).enabled), { headers });
  } catch (error) { return Response.json({ error: error.message }, { status: 400, headers }); }
};
export const config = { path: '/history-api/chat-settings' };
