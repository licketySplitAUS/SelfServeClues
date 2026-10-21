import { timingSafeEqual, createHash } from 'node:crypto';
import { loadBaseline, baselineGame } from './baseline.mjs';
import { blobRepository } from './repository.mjs';
import { makeService } from './service.mjs';
import { validateSolution, env } from './babble.mjs';

export const service = async context => makeService({ repo: blobRepository(context), baseline: await loadBaseline(), archivedGame: baselineGame,
  validate: (grid, words, previous) => validateSolution(grid, words, { previous }) });
export function authorized(request, expected = env('HISTORY_PREVIEW_ADMIN_KEY')) {
  if (!expected) return false; // Fail closed: a missing secret never enables writes.
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(request.headers.get('x-admin-key') || ''), digest(expected));
}
