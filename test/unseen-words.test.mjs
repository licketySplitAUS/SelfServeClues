import test from 'node:test';
import assert from 'node:assert/strict';
import { adjust, emptyAggregate, meta, unseenFourLetterWords } from '../netlify/lib/history/stats.mjs';
import { makeService } from '../netlify/lib/history/service.mjs';
import handler from '../netlify/functions/history-unseen-words.mjs';

test('unseen words are distinct four-letter dictionary entries absent from every positive history counter', () => {
  const aggregate = { games: 3, words: { 'seen|4': 1, 'seen|5': 2, 'gone|4': 0, 'longer|8': 1 } };
  assert.deepEqual(unseenFourLetterWords(aggregate, ['seen', 'zzzz', 'gone', 'aaaa', 'aaaa', 'longer', 'a-bc']), {
    words: ['aaaa', 'gone', 'zzzz'], count: 3, dictionaryWords: 4, gridCount: 3,
  });
});

function fixture() {
  const game = (puzzle, word) => ({ puzzle, gameId: puzzle, date: `2026-10-${String(17 + puzzle).padStart(2, '0')}`, letters: 'A'.repeat(25), totalWords: 1, totalScore: 4, words: [{ word, score: 4 }] });
  const first = game(1, 'aaaa'), current = game(2, 'bbbb');
  const aggregate = emptyAggregate(); adjust(aggregate, first); adjust(aggregate, current);
  const baseline = { sourceVersion: 'fixture', importedAt: '2026-10-19T12:00:00Z', aggregate, games: [meta(first), meta(current)], current, dictionary: ['aaaa', 'bbbb', 'cccc', 'dddd'] };
  let state = null;
  const repo = {
    control: async () => ({ value: state ? { stateKey: 'state' } : null }),
    read: async () => structuredClone(state),
    write: () => assert.fail('A word-list read must not publish data'),
    commit: () => assert.fail('A word-list read must not change control'),
  };
  const worker = makeService({ repo, baseline, archivedGame: async puzzle => structuredClone([first, current].find(row => row.puzzle === puzzle) || null), fetchImpl: () => assert.fail('A word-list read must not fetch or submit to Babble') });
  return { worker, game, replace: value => { state = value; }, baseline };
}

test('the current imported grid is included, unlike statistics that exclude today', async () => {
  const { worker } = fixture(); const result = await worker.unseenWords();
  assert.deepEqual(result.words, ['cccc', 'dddd']);
  assert.equal(result.gridCount, 2); assert.equal(result.currentPuzzle, 2);
  assert.equal(result.firstDate, '2026-10-18'); assert.equal(result.lastDate, '2026-10-19');
});

test('replacements, new grids, dictionary corrections and restored history change the list without duplicate grid counts', async () => {
  const f = fixture();
  const replacement = f.game(2, 'cccc'), latest = f.game(3, 'dddd');
  f.replace({ sourceVersion: 'fixture', current: latest, puzzles: { 2: replacement, 3: latest }, corrections: { dddd: { action: 'exclude' }, eeee: { action: 'include' } } });
  const result = await f.worker.unseenWords();
  assert.deepEqual(result.words, ['bbbb', 'eeee']);
  assert.equal(result.dictionaryWords, 4); assert.equal(result.gridCount, 3);
  assert.equal(result.lastDate, '2026-10-20'); assert.equal(result.currentPuzzle, 3);
  f.replace(null);
  assert.deepEqual((await f.worker.unseenWords()).words, ['cccc', 'dddd']);
});

test('unseen-word endpoint rejects writes before accessing storage', async () => {
  assert.equal((await handler(new Request('https://example/history-api/unseen-four-letter-words', { method: 'POST' }), {})).status, 405);
});
