import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBaseline, baselineGame } from '../../netlify/lib/history/baseline.mjs';
import { solveGrid } from '../../netlify/lib/history/solver.mjs';
import { snapshotFor } from '../../netlify/lib/history/stats.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = await loadBaseline();
const current = baseline.current;
const snapshot = snapshotFor(baseline.aggregate, baseline.games, current, baseline.dictionary);
const saved = JSON.parse(await fs.readFile(path.join(root, 'public/history-preview-data/snapshot.json')));
assert.deepEqual(snapshot.history, saved.history, 'Public preview statistics match the imported aggregate');
assert.deepEqual(await baselineGame(current.puzzle), current, 'Archived current puzzle is complete and reproducible');
assert.equal(current.words.length, current.totalWords);
assert.equal(current.words.reduce((n, row) => n + row.score, 0), current.totalScore);
const start = performance.now();
const solved = solveGrid(current.letters, baseline.dictionary);
const solveMs = Math.round(performance.now() - start);
const actual = new Set(current.words.map(row => row.word)), generated = new Set(solved.map(row => row.word));
const added = solved.filter(row => !actual.has(row.word)).map(row => row.word);
const missing = current.words.filter(row => !generated.has(row.word)).map(row => row.word);
const scoreDifferences = solved.filter(row => current.words.some(prior => prior.word === row.word && prior.score !== row.score));
assert.equal(scoreDifferences.length, 0, 'New scoring agrees with stored scores for matching words');
const audit = JSON.parse(await fs.readFile(path.join(root, 'data/history/audit.json')));
console.log(JSON.stringify({ currentPuzzle: current.puzzle, importedWords: current.totalWords, solvedWords: solved.length, solveMs, added, missing,
  historicalGames: snapshot.history.gameCount, legacyHistoricalGames: audit.legacySummary.gameCount,
  uniqueWords: snapshot.history.uniqueWords, legacyUniqueWords: audit.legacySummary.uniqueWords,
  publicSnapshotBytes: (await fs.stat(path.join(root, 'public/history-preview-data/snapshot.json'))).size,
  baselineGzipBytes: (await fs.stat(path.join(root, 'data/history/baseline.json.gz'))).size,
}, null, 2));
if (missing.length || added.length) console.warn('The preview remains experimental: review solver differences before enabling automatic publishing.');
