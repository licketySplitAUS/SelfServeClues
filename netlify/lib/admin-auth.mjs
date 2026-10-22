import { timingSafeEqual, createHash } from 'node:crypto';
import { env } from './env.mjs';
export function authorized(request, expected = env('HISTORY_PREVIEW_ADMIN_KEY')) {
  if (!expected) return false;
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(request.headers.get('x-admin-key') || ''), digest(expected));
}
