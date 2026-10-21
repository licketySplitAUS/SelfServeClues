import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('word cards expose reasons, category filtering finds unexplained words, and downloads keep the full classified list', async () => {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: id === 'rule-filter' ? 'all' : '', textContent: '', events: {}, items: [], classList: { add() {} }, addEventListener(event, handler) { this.events[event] = handler; }, replaceChildren(...items) { this.items = items; }, append(...items) { this.items.push(...items); }, getBoundingClientRect() { return { height: 400 }; }, click() {}, remove() {} });
    return nodes.get(id);
  };
  let resolveFetch, downloaded;
  const window = { addEventListener() {} }; window.parent = window;
  const context = { document: { getElementById: node, querySelector: node, createElement: () => node(Symbol()), body: node('body') },
    window, location: { search: '?embed=1' }, URLSearchParams, AbortSignal, Intl, Date, Blob,
    URL: { createObjectURL(blob) { downloaded = blob; return 'blob:test'; }, revokeObjectURL() {} }, setTimeout() {},
    ResizeObserver: class { observe() {} }, fetch: () => new Promise(resolve => { resolveFetch = resolve; }) };
  vm.runInNewContext(fs.readFileSync('public/word-history/unseen-words.js', 'utf8'), context);
  resolveFetch({ ok: true, json: async () => ({ words: ['bike', 'mugg'], count: 2, dictionaryWords: 4, gridCount: 3, currentPuzzle: 4,
    diceAnalysis: { entries: [{ word: 'bike', blocked: true, reason: 'B and K share a die.' }, { word: 'mugg', blocked: false, reason: 'Not explained by these dice rules.' }] } }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('words').items[0].className, 'dice-conflict');
  assert.equal(node('words').items[1].className, 'unexplained');
  assert.equal(node('words').items[0].items.at(-1).textContent, 'B and K share a die.');
  assert.match(node('dice-summary').textContent, /1 possible dice conflicts · 1 not explained/);
  node('rule-filter').value = 'unexplained'; node('rule-filter').events.change();
  assert.equal(node('words').items.length, 1);
  assert.equal(node('words').items[0].items[0].textContent, 'mugg');
  node('download').events.click();
  const text = await downloaded.text();
  assert.match(text, /bike\tPossible dice conflict/); assert.match(text, /mugg\tNot explained/);
  node('word-filter').value = 'bike'; node('word-filter').events.input();
  assert.equal(node('words').items.length, 0);
  assert.match(node('filter-status').textContent, /Showing 0 of 2/);
});
