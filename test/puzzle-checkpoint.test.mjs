import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createCheckpoint, verifyCheckpoint, saveCheckpoint } from '../tools/recovery/puzzle-checkpoint.mjs';

const snapshot = { sourceVersion: '97cebeabd71e18e0', current: { puzzle: 8616, date: '2026-10-20', letters: 'ABCDEFGHIJKLMNOPQRSTUVWXY', totalWords: 1, totalScore: 9, words: [{ word: 'abcd', score: 9, startRow: 1, startCol: 2 }], validation: { status: 'matched', official: { total: 1 } } }, corrections: { wxyz: { action: 'exclude', reason: 'Explicit dictionary rejection' } } };

test('checkpoint requires the requested day, successful validation and consistent totals', () => {
  const saved = createCheckpoint(snapshot, '2026-10-20');
  assert.equal(verifyCheckpoint(saved).snapshot.current.totalWords, 1);
  assert.equal(saved.corrections.wxyz.action, 'exclude');
  assert.throws(() => createCheckpoint(snapshot, '2026-10-21'), /stale/);
  for (const status of ['mismatch', 'unavailable', undefined]) assert.throws(() => createCheckpoint({ ...snapshot, current: { ...snapshot.current, validation: { status } } }, '2026-10-20'), /validated/);
  assert.throws(() => createCheckpoint({ ...snapshot, current: { ...snapshot.current, totalWords: 2 } }, '2026-10-20'), /totals/);
  assert.throws(() => createCheckpoint({ ...snapshot, current: { ...snapshot.current, words: [...snapshot.current.words, ...snapshot.current.words] } }, '2026-10-20'), /word/);
});
test('checksums are stable across object property order and detect changed content', () => {
  const saved = createCheckpoint(snapshot, '2026-10-20');
  const reordered = createCheckpoint({ corrections: snapshot.corrections, current: Object.fromEntries(Object.entries(snapshot.current).reverse()), sourceVersion: snapshot.sourceVersion }, '2026-10-20');
  assert.equal(saved.sha256, reordered.sha256);
  const damaged = structuredClone(saved); damaged.game.words[0].score = 10;
  assert.throws(() => verifyCheckpoint(damaged), /checksum/);
  const revised = createCheckpoint({ ...snapshot, corrections: {} }, '2026-10-20');
  assert.notEqual(saved.sha256, revised.sha256);
});
test('same checkpoint creates one file; revised corrections preserve a second revision', async () => {
  await fs.mkdir('artifacts/checkpoint-tests', { recursive: true });
  const folder = await fs.mkdtemp('artifacts/checkpoint-tests/run-');
  const saved = createCheckpoint(snapshot, '2026-10-20');
  const first = await saveCheckpoint(saved, folder);
  assert.equal(first.outcome, 'saved'); assert.ok(first.bytes < 2000);
  assert.equal((await saveCheckpoint(saved, folder)).outcome, 'unchanged');
  assert.equal((await fs.readdir(folder)).length, 1);
  verifyCheckpoint(JSON.parse(gunzipSync(await fs.readFile(folder + '/' + first.filename))));
  await saveCheckpoint(createCheckpoint({ ...snapshot, corrections: {} }, '2026-10-20'), folder);
  assert.equal((await fs.readdir(folder)).length, 2);
});
