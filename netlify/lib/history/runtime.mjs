import { timingSafeEqual, createHash } from 'node:crypto';
import { loadBaseline, baselineGame } from './baseline.mjs';
import { blobRepository } from './repository.mjs';
import { makeService } from './service.mjs';

export const service = async () => makeService({ repo: blobRepository(), baseline: await loadBaseline(), archivedGame: baselineGame });
export function authorized(request, expected = process.env.HISTORY_PREVIEW_ADMIN_KEY) {
  if (!expected) return false; // Fail closed: a missing secret never enables writes.
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(request.headers.get('x-admin-key') || ''), digest(expected));
}
