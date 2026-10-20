// Dependency-free so a GitHub backup job needs Node only, without npm install.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function verifyCheckpoint(checkpoint) {
  const { sha256, ...body } = checkpoint || {};
  if (body.schemaVersion !== 1 || body.kind !== 'validated-puzzle' || !/^[a-f0-9]{16}$/.test(body.baselineVersion || '') || sha256 !== hash(body)) throw new Error('Invalid puzzle checkpoint or checksum.');
  const game = body.game;
  if (!Number.isSafeInteger(game?.puzzle) || game.puzzle < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(game.date || '') || !/^[A-Z]{25}$/.test(game.letters || '') || !['matched', 'corrected'].includes(game.validation?.status) || !Array.isArray(game.words) || !game.words.length) throw new Error('A checkpoint requires a complete validated puzzle.');
  if (new Date(game.date + 'T00:00:00Z').toISOString().slice(0, 10) !== game.date) throw new Error('Invalid puzzle date.');
  const unique = new Set(); let score = 0;
  for (const row of game.words) {
    if (!/^[a-z]{4,50}$/.test(row.word || '') || unique.has(row.word) || !Number.isSafeInteger(row.score) || row.score < 0) throw new Error('Invalid checkpoint word.');
    unique.add(row.word); score += row.score;
  }
  if (game.totalWords !== unique.size || game.totalScore !== score || (game.validation.official?.total != null && game.validation.official.total !== unique.size)) throw new Error('Checkpoint totals disagree.');
  if (!body.corrections || typeof body.corrections !== 'object' || Array.isArray(body.corrections)) throw new Error('Invalid correction map.');
  for (const [word, row] of Object.entries(body.corrections)) if (!/^[a-z]{4,50}$/.test(word) || !['include', 'exclude'].includes(row?.action)) throw new Error('Invalid dictionary correction.');
  return { count: 1, state: { corrections: body.corrections, puzzles: { [game.puzzle]: game } }, snapshot: { current: game } };
}
export function createCheckpoint(snapshot, expectedDate) {
  if (snapshot?.current?.date !== expectedDate) throw new Error(`No validated puzzle for ${expectedDate}; refusing a stale backup.`);
  const body = { schemaVersion: 1, kind: 'validated-puzzle', baselineVersion: snapshot.sourceVersion, game: snapshot.current, corrections: snapshot.corrections || {} };
  const checkpoint = { ...canonical(body), sha256: hash(body) };
  verifyCheckpoint(checkpoint); return checkpoint;
}
export async function saveCheckpoint(checkpoint, folder) {
  verifyCheckpoint(checkpoint);
  const filename = `${checkpoint.game.date}-puzzle-${checkpoint.game.puzzle}-${checkpoint.sha256.slice(0, 16)}.json.gz`;
  await fs.mkdir(folder, { recursive: true });
  const destination = path.join(folder, filename);
  const data = gzipSync(JSON.stringify(checkpoint), { level: 9 });
  try { await fs.writeFile(destination, data, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = JSON.parse(gunzipSync(await fs.readFile(destination))); verifyCheckpoint(existing);
    if (existing.sha256 !== checkpoint.sha256) throw new Error('Checkpoint filename conflict.');
    return { outcome: 'unchanged', filename, bytes: data.length };
  }
  return { outcome: 'saved', filename, bytes: data.length };
}
async function main() {
  const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
  const origin = option('origin', 'https://selfserve.r46.me');
  if (!origin.startsWith('https://')) throw new Error('Use an HTTPS origin.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const expectedDate = option('date', `${parts.year}-${parts.month}-${parts.day}`);
  const response = await fetch(`${origin.replace(/\/$/, '')}/history-api/current?checkpoint=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Saved puzzle unavailable (HTTP ${response.status}).`);
  const text = await response.text();
  if (text.length > 4_000_000) throw new Error('Unexpectedly large puzzle response.');
  console.log(JSON.stringify(await saveCheckpoint(createCheckpoint(JSON.parse(text), expectedDate), option('out', 'recovery-backups/puzzles'))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
