export { authorized } from '../admin-auth.mjs';
import { loadBaseline, baselineGame } from './baseline.mjs';
import { blobRepository } from './repository.mjs';
import { makeService } from './service.mjs';
import { validateSolution, env } from './babble.mjs';

export const service = async context => makeService({ repo: blobRepository(context), baseline: await loadBaseline(), archivedGame: baselineGame,
  validate: (grid, words, previous) => validateSolution(grid, words, { previous }) });
