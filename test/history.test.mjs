import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readReport } from '../tools/history/report.mjs';
import { solveGrid, scoreWord, parseGrid } from '../netlify/lib/history/solver.mjs';
import { adjust, emptyAggregate, meta, snapshotFor } from '../netlify/lib/history/stats.mjs';
import { makeService } from '../netlify/lib/history/service.mjs';
import { authorized } from '../netlify/lib/history/runtime.mjs';
import adminHandler from '../netlify/functions/history-admin.mjs';

test('SQL fixed-width reports preserve spaces, NULL flags and declared row counts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'history-report-'));
  const file = path.join(dir, 'rows.rpt');
  try {
    await fs.writeFile(file, 'ID  Name                Flag\n--- ------------------- ----\n1   A name with spaces  NULL\n\n(1 row(s) affected)\n');
    const result = [];
    assert.equal(await readReport(file, row => result.push(row)), 1);
    assert.deepEqual(result, [{ ID: '1', Name: 'A name with spaces', Flag: 'NULL' }]);
    await fs.appendFile(file, 'unexpected trailing data\n');
    await assert.rejects(readReport(file, () => {}), /data after/);
    await fs.writeFile(file, 'ID\n---\n1\n(2 row(s) affected)\n');
    await assert.rejects(readReport(file, () => {}), /declares 2/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('solver respects adjacent cells, no tile reuse, distinct words and Qu scoring', () => {
  const words = solveGrid('QIT' + 'S'.repeat(22), ['quit', 'quits', 'quit', 'quitt', 'quui', 'qits']);
  assert.deepEqual(words.map(row => row.word), ['quit', 'quits']);
  assert.equal(scoreWord('quit'), 7); assert.equal(scoreWord('quits'), 16);
  assert.equal(scoreWord('exam'), 10); assert.equal(scoreWord('jazz'), 19);
  assert.throws(() => solveGrid('ABC', []), /25 letters/);
});

test('upstream parser requires identity, real date and 25 tiles', () => {
  const html = '<a href="/8608/10/19/2026#chat_log">chat</a>' + 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('').map(letter => `<img src="/images/${letter.toLowerCase()}.gif">`).join('');
  assert.deepEqual(parseGrid(html), { puzzle: 8608, date: '2026-10-19', letters: 'ABCDEFGHIJKLMNOPQRSTUVWXY' });
  assert.throws(() => parseGrid(html.replace('/10/19/', '/02/31/')), /valid puzzle/);
  assert.throws(() => parseGrid('<img src="/images/a.gif">'), /valid puzzle/);
});

function fixture() {
  const first = { puzzle: 1, gameId: 1, date: '2026-10-17', letters: 'A'.repeat(25), totalWords: 1, totalScore: 4, words: [{ word: 'aaaa', score: 4 }] };
  const current = { ...first, puzzle: 2, gameId: 2, date: '2026-10-18' };
  const aggregate = emptyAggregate(); adjust(aggregate, first); adjust(aggregate, current);
  const baseline = { sourceVersion: 'test', importedAt: '2026-10-18T12:00:00Z', aggregate, games: [meta(first), meta(current)], current, dictionary: ['aaaa', 'aaaaa'] };
  let control = null, etag = null, version = 0, now = new Date('2026-10-19T12:00:00Z'), html = '', fetches = 0;
  const blobs = new Map();
  const repo = {
    control: async () => ({ value: structuredClone(control), etag }),
    commit: async (next, expected) => { if (expected !== etag) throw new Error('Another update won the race'); control = structuredClone(next); etag = String(++version); },
    read: async key => { assert.ok(blobs.has(key)); return structuredClone(blobs.get(key)); },
    write: async (key, value) => { assert.ok(!blobs.has(key)); blobs.set(key, structuredClone(value)); },
  };
  const worker = makeService({ repo, baseline, archivedGame: async puzzle => structuredClone([first, current].find(game => game.puzzle === puzzle) || null),
    clock: () => now, fetchImpl: async () => { fetches++; return new Response(html); } });
  const upstream = (puzzle = 3, date = '10/19/2026') => { html = `<a href="/${puzzle}/${date}#chat_log">chat</a>` + '<img src="/images/a.gif">'.repeat(25); };
  return { worker, baseline, repo, upstream, blobs, get control() { return control; }, advance: () => { now = new Date(+now + 300000); }, fetches: () => fetches };
}

test('statistics exclude today, retain frequencies, repeated leaderboards and long word lengths', () => {
  const { baseline } = fixture();
  const snapshot = snapshotFor(baseline.aggregate, baseline.games, baseline.current, baseline.dictionary);
  assert.equal(snapshot.history.gameCount, 1);
  assert.equal(snapshot.history.uniqueWords, 1);
  assert.equal(snapshot.history.frequent.length, 0, 'Single occurrence is not a frequent winner');
  assert.equal(snapshot.history.dictionaryCount, 2);
  assert.equal(snapshot.history.recent[0].puzzle, 1);
});

test('new grids need two observations; repeat checks do not duplicate history or solve', async () => {
  const f = fixture(); f.upstream();
  assert.equal((await f.worker.check()).outcome, 'candidate');
  assert.equal((await f.worker.current()).current.puzzle, 2);
  f.advance();
  assert.equal((await f.worker.check()).outcome, 'published');
  const snapshot = await f.worker.current();
  assert.equal(snapshot.current.totalWords, 2); assert.equal(snapshot.history.gameCount, 2);
  const count = f.blobs.size;
  assert.equal((await f.worker.check()).outcome, 'unchanged');
  assert.equal(f.blobs.size, count);
  assert.equal((await f.worker.current()).history.gameCount, 2);
});

test('corrections replace a puzzle contribution, retain earlier history, and can be restored', async () => {
  const f = fixture();
  await f.worker.check({ correction: { word: 'aaaaa', action: 'exclude', reason: 'Rejected by Babble' } });
  let snapshot = await f.worker.current();
  assert.equal(snapshot.current.totalWords, 1); assert.equal(snapshot.history.gameCount, 1);
  assert.equal(snapshot.history.uniqueWords, 1); assert.equal(f.fetches(), 0);
  await f.worker.check({ correction: { word: 'aaaaa', action: 'restore', reason: 'Undo test' } });
  snapshot = await f.worker.current();
  assert.equal(snapshot.current.totalWords, 2); assert.equal(snapshot.history.gameCount, 1);
  assert.deepEqual(snapshot.corrections, {});
  await assert.rejects(f.worker.check({ correction: { word: 'oops', action: 'exclude', reason: '' } }), /reason/);
});

test('stale or malformed upstream never overwrites a good result; manual input is validated', async () => {
  const f = fixture(); f.upstream(1, '10/17/2026');
  assert.equal((await f.worker.check({ accept: true })).outcome, 'waiting');
  assert.equal((await f.worker.current()).current.puzzle, 2);
  assert.equal((await f.worker.check({ manualGrid: { puzzle: 3, date: '2026-10-19', letters: 'X', reason: 'test' } })).outcome, 'waiting');
  assert.equal((await f.worker.current()).current.puzzle, 2);
  await f.worker.check({ manualGrid: { puzzle: 3, date: '2026-10-19', letters: 'A'.repeat(25), reason: 'Verified by admin' } });
  assert.equal((await f.worker.current()).current.puzzle, 3);
});

test('same puzzle with a changed grid is quarantined; manual acceptance replaces it once', async () => {
  const f = fixture(); f.upstream(2, '10/18/2026');
  // Same letters/identity correctly takes the cheap unchanged path.
  assert.equal((await f.worker.check()).outcome, 'unchanged');
  await f.worker.check({ manualGrid: { puzzle: 2, date: '2026-10-18', letters: 'A'.repeat(24) + 'B', reason: 'Corrected last tile' } });
  assert.equal((await f.worker.current()).history.gameCount, 1);
  assert.equal((await f.worker.current()).current.letters.at(-1), 'B');
  assert.equal((await f.worker.check()).outcome, 'candidate');
});

test('failed publication leaves the old snapshot visible; rollback and backup retain revisions', async () => {
  const f = fixture(); f.upstream();
  await f.worker.check({ accept: true });
  const backup = await f.worker.backup();
  assert.equal(Object.keys(backup.revisions).length, 1); assert.equal(backup.snapshot.current.puzzle, 3);
  const originalCommit = f.repo.commit;
  f.repo.commit = async () => { throw new Error('Another update won the race'); };
  await assert.rejects(f.worker.check({ rebuild: true }), /won the race/);
  assert.equal((await f.worker.current()).current.puzzle, 3);
  f.repo.commit = originalCommit;
  await f.worker.rollback();
  assert.equal((await f.worker.current()).current.puzzle, 2);
});

test('admin writes fail closed without a configured key and reject unauthenticated requests', async () => {
  const request = new Request('https://example.test/history-api/admin', { method: 'POST', headers: { 'x-admin-key': 'secret' }, body: '{}' });
  assert.equal(authorized(request, ''), false); assert.equal(authorized(request, 'secret'), true); assert.equal(authorized(request, 'different'), false);
  assert.equal((await adminHandler(new Request('https://example.test/history-api/admin', { method: 'POST', body: '{}' }))).status, 403);
});

