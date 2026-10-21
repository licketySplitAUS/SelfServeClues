import test from 'node:test';
import assert from 'node:assert/strict';
import { diceExplanation, analyzeUnseenWords } from '../netlify/lib/history/dice.mjs';

test('reference dice explain mixed rare letters, repeated rare letters, bare Q and repeated V', () => {
  for (const word of ['bike', 'book', 'baby', 'jazz', 'quiz']) assert.equal(diceExplanation(word).code, 'shared-rare-die', word);
  for (const word of ['qaid', 'qats', 'suqs']) assert.equal(diceExplanation(word).code, 'qu-tile', word);
  assert.equal(diceExplanation('viva').code, 'letter-supply');
  assert.equal(diceExplanation('quit').blocked, false, 'Qu consumes one die, not separate Q and U dice');
});

test('the model labels possible explanations rather than treating all never-seen words as impossible', () => {
  const result = analyzeUnseenWords(['bike', 'viva', 'mugg']);
  assert.equal(result.blockedCount, 2); assert.equal(result.unexplainedCount, 1);
  assert.deepEqual(result.entries.filter(entry => !entry.blocked).map(entry => entry.word), ['mugg']);
  assert.match(result.model, /not verified/);
  assert.match(result.entries.at(-1).reason, /Not explained/);
});
