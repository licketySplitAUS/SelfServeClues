import test from 'node:test';
import assert from 'node:assert/strict';
import { groupCluesByGrid, readClueOrder, clueOrderCookie } from '../shared/clue-order.mjs';

const grid = ['CATSC', 'ATSXA', 'TSXXT', 'SXXXS', 'XXXXX'].join('');
const clues = ['CATS', 'CATT', 'CAST', 'CACA'].map(word => ({ word }));

test('grid groups use every valid starting tile, real adjacent paths and alphabetical clues', () => {
  const groups = groupCluesByGrid(grid, clues);
  assert.equal(groups.length, 25);
  assert.deepEqual(groups[0], { index: 0, row: 1, column: 1, letter: 'C', clues: [clues[2], clues[0], clues[1]] });
  assert.deepEqual(groups[4].clues, [clues[2], clues[0]], 'The second C has its own reachable words, not every C clue');
  assert.equal(groups.flatMap(group => group.clues).some(clue => clue.word === 'CACA'), false, 'Cannot reuse a tile to complete a word');
  assert.deepEqual(groups[24], { index: 24, row: 5, column: 5, letter: 'X', clues: [] });
  assert.deepEqual(clues.map(clue => clue.word), ['CATS', 'CATT', 'CAST', 'CACA'], 'Grouping never changes canonical clues or totals');
});

test('grid grouping handles diagonal paths and Qu as one tile containing two letters', () => {
  const board = Array(25).fill('X'); board[0] = 'Q'; board[6] = 'I'; board[12] = 'T'; board[18] = 'S';
  const groups = groupCluesByGrid(board.join(''), [{ word: 'QUITS' }, { word: 'QITS' }]);
  assert.equal(groups[0].letter, 'Qu');
  assert.deepEqual(groups[0].clues, [{ word: 'QUITS' }]);
  assert.equal(groups.slice(1).flatMap(group => group.clues).length, 0);
  assert.ok(groupCluesByGrid('', clues).every(group => !group.clues.length));
});

test('cookie mode defaults safely and uses one-year shared r46.me scope without leaking into other hosts', () => {
  assert.equal(readClueOrder(''), 'alphabetical');
  assert.equal(readClueOrder('other=1; lickety_clue_order=grid; third=2'), 'grid');
  for (const cookie of ['lickety_clue_order=invalid', 'not_lickety_clue_order=grid', 'lickety_clue_order=grid-more']) assert.equal(readClueOrder(cookie), 'alphabetical');
  for (const host of ['r46.me', 'selfserve.r46.me']) assert.equal(clueOrderCookie('grid', host, true), 'lickety_clue_order=grid; Max-Age=31536000; Path=/; SameSite=Lax; Domain=r46.me; Secure');
  assert.equal(clueOrderCookie('alphabetical', 'localhost', false), 'lickety_clue_order=alphabetical; Max-Age=31536000; Path=/; SameSite=Lax');
  assert.ok(!clueOrderCookie('grid', 'selfserveclues.netlify.app', true).includes('Domain='));
  assert.ok(!clueOrderCookie('grid', 'evilr46.me', true).includes('Domain='));
});
