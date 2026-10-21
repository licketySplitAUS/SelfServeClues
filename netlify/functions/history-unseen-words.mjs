import { service } from '../lib/history/runtime.mjs';

export default async (request, context) => {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    return Response.json(await (await service(context)).unseenWords(), {
      headers: { 'cache-control': 'public, max-age=30', 'netlify-cdn-cache-control': 'public, durable, max-age=60' },
    });
  } catch (error) {
    console.error('Unseen word history could not be loaded', error);
    return Response.json({ error: 'The recorded word history is temporarily unavailable. Please try again.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
};
export const config = { path: '/history-api/unseen-four-letter-words' };
