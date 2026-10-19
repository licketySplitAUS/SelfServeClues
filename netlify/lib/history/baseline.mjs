import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Netlify bundles functions into /var/task and copies included_files beside the
// bundle. The module-relative fallback also supports local tools from any cwd.
const moduleDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data/history');
const directory = fs.access(path.join(process.cwd(), 'data/history/baseline.json.gz'))
  .then(() => path.join(process.cwd(), 'data/history')).catch(() => moduleDirectory);
let cached;
export const loadBaseline = () => cached ||= directory.then(folder => fs.readFile(path.join(folder, 'baseline.json.gz'))).then(data => JSON.parse(gunzipSync(data)));
export async function baselineGame(puzzle) {
  const baseline = await loadBaseline();
  const game = baseline.games.find(item => item.puzzle === puzzle);
  if (!game) return null;
  const rows = JSON.parse(gunzipSync(await fs.readFile(path.join(await directory, 'archives', game.date.slice(0, 4) + '.json.gz'))));
  const raw = rows.find(item => item.gameId === game.gameId);
  if (!raw) throw new Error(`Missing archived GameID ${game.gameId}`);
  return { ...game, words: [...new Map(raw.words.map(word => [word.word, word])).values()] };
}
