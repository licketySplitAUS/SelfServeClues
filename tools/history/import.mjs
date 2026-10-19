import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readReport } from './report.mjs';
import { adjust, emptyAggregate, meta, snapshotFor, summarize } from '../../netlify/lib/history/stats.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = process.argv[2];
if (!input) throw new Error('Usage: node tools/history/import.mjs <SQL report directory>');
const output = path.join(root, 'data/history');
const publicOutput = path.join(root, 'public/history-preview-data');
await fs.mkdir(path.join(output, 'archives'), { recursive: true });
await fs.mkdir(publicOutput, { recursive: true });
const games = new Map(), dictionary = [], rejected = [];
const audit = { importedAt: new Date().toISOString(), sourceRows: {}, sourceHashes: {}, customGames: [], duplicatePuzzles: [], duplicateWords: [], mismatchedTotals: [], invalidGrids: [], missingPuzzles: [], dictionaryConflicts: [] };
const integer = (row, key) => { const value = Number(row[key]); if (!Number.isSafeInteger(value) || row[key] === '') throw new Error(`Invalid integer ${key}: ${row[key]}`); return value; };
for (const name of ['tblBabbleGame', 'tblBabbleGameWords', 'tblFullList']) {
  const file = path.join(input, name + '.rpt');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  audit.sourceHashes[name] = hash.digest('hex');
  audit.sourceRows[name] = await readReport(file, row => {
    if (name === 'tblBabbleGame') {
      const game = { gameId: integer(row, 'GameID'), puzzle: integer(row, 'BabbleGameNo'), name: row.Name, date: row.StartDateTime.slice(0, 10), letters: row.Grid.toUpperCase(), totalWords: integer(row, 'TotalWords'), totalScore: integer(row, 'TotalScore'), words: [] };
      if (games.has(game.gameId)) throw new Error(`Duplicate GameID ${game.gameId}`);
      games.set(game.gameId, game);
    } else if (name === 'tblBabbleGameWords') {
      const game = games.get(integer(row, 'GameID'));
      if (!game) throw new Error(`Orphan word record for GameID ${row.GameID}`);
      if (!/^[a-z]{4,50}$/i.test(row.word) || row.word.length !== integer(row, 'wordSize')) throw new Error(`Invalid word record: ${row.word}`);
      game.words.push({ word: row.word.toLowerCase(), score: integer(row, 'wordScore'), startRow: integer(row, 'startRow'), startCol: integer(row, 'startCol') });
    } else {
      const word = row.word.toLowerCase();
      if (!/^[a-z]{4,50}$/.test(word)) throw new Error(`Invalid dictionary word: ${word}`);
      (row.NotInBabble === 'NULL' ? dictionary : rejected).push(word);
    }
  });
}
const canonical = new Map(), legacy = emptyAggregate();
for (const game of games.values()) {
  if (game.puzzle < 1) { audit.customGames.push(meta(game)); continue; }
  if (!/^[A-Z]{25}$/.test(game.letters)) audit.invalidGrids.push(meta(game));
  const seen = new Set();
  for (const row of game.words) {
    if (seen.has(row.word)) audit.duplicateWords.push({ gameId: game.gameId, word: row.word });
    seen.add(row.word);
  }
  const score = game.words.reduce((n, row) => n + row.score, 0);
  if (game.words.length !== game.totalWords || score !== game.totalScore) audit.mismatchedTotals.push({ gameId: game.gameId, puzzle: game.puzzle, storedWords: game.totalWords, actualWords: game.words.length, storedScore: game.totalScore, actualScore: score });
  adjust(legacy, game);
  const prior = canonical.get(game.puzzle);
  if (prior) audit.duplicatePuzzles.push({ puzzle: game.puzzle, gameIds: [prior.gameId, game.gameId], selectedGameId: Math.max(prior.gameId, game.gameId) });
  if (!prior || game.gameId > prior.gameId) canonical.set(game.puzzle, game);
}
const ordered = [...canonical.values()].sort((a, b) => a.puzzle - b.puzzle);
const aggregate = emptyAggregate();
for (const game of ordered) {
  // Canonical records keep source metadata, but use each word once and derive
  // totals from the preserved historical scores. Raw reports remain in archives.
  const unique = new Map(game.words.map(row => [row.word, row]));
  const next = { ...game, words: [...unique.values()].sort((a, b) => a.word.localeCompare(b.word)) };
  next.totalWords = next.words.length; next.totalScore = next.words.reduce((n, row) => n + row.score, 0);
  canonical.set(game.puzzle, next); adjust(aggregate, next);
}
for (let i = 1; i < ordered.length; i++) for (let puzzle = ordered[i - 1].puzzle + 1; puzzle < ordered[i].puzzle; puzzle++) audit.missingPuzzles.push(puzzle);
const active = [...new Set(dictionary)].sort();
audit.dictionaryConflicts = [...new Set(rejected)].filter(word => active.includes(word));
if (audit.dictionaryConflicts.length) throw new Error('Conflicting accepted/rejected dictionary entries; review source.');
const current = canonical.get(ordered.at(-1).puzzle);
const sourceVersion = createHash('sha256').update(JSON.stringify(audit.sourceHashes)).digest('hex').slice(0, 16);
const baseline = { schemaVersion: 1, sourceVersion, importedAt: audit.importedAt, aggregate, games: [...canonical.values()].map(meta), dictionary: active, rejected: [...new Set(rejected)].sort(), current };
const years = new Map();
for (const game of games.values()) { const year = game.date.slice(0, 4); if (!years.has(year)) years.set(year, []); years.get(year).push(game); }
for (const [year, rows] of years) await fs.writeFile(path.join(output, 'archives', year + '.json.gz'), gzipSync(JSON.stringify(rows), { level: 9 }));
await fs.writeFile(path.join(output, 'baseline.json.gz'), gzipSync(JSON.stringify(baseline), { level: 9 }));
const legacyHistory = structuredClone(legacy);
for (const game of games.values()) if (game.puzzle === current.puzzle) adjust(legacyHistory, game, -1);
audit.legacySummary = summarize(legacyHistory, [...games.values()].filter(game => game.puzzle > 0 && game.puzzle !== current.puzzle).map(meta), active);
const snapshot = snapshotFor(aggregate, baseline.games, current, active, { source: 'import', sourceVersion, updatedAt: audit.importedAt, status: 'Imported database snapshot; automatic publishing is disabled.' });
audit.canonicalSummary = snapshot.history;
await fs.writeFile(path.join(output, 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
await fs.writeFile(path.join(publicOutput, 'audit.json'), JSON.stringify(audit) + '\n');
await fs.writeFile(path.join(publicOutput, 'snapshot.json'), JSON.stringify(snapshot) + '\n');
console.log(JSON.stringify({ sourceRows: audit.sourceRows, canonicalGames: canonical.size, historicalGames: snapshot.history.gameCount, latestPuzzle: current.puzzle, latestWords: current.totalWords, acceptedDictionary: active.length, rejectedDictionary: rejected.length, duplicatePuzzles: audit.duplicatePuzzles.length, mismatchedTotals: audit.mismatchedTotals.length, missingPuzzles: audit.missingPuzzles.length, invalidGrids: audit.invalidGrids.length, output }, null, 2));
