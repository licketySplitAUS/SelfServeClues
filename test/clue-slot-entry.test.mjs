import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { captureClueFollow, centreNextClue, readClueCenteringOff, clueCenteringCookie } from '../shared/clue-follow.mjs';

const source = fs.readFileSync(new URL('../public/clue-slot-entry.js', import.meta.url), 'utf8');
function fixture() {
  const listeners = new Map(), calls = [];
  const document = { body: {}, querySelectorAll: () => fields, getElementById: () => document.centeringControl,
    addEventListener: (name, callback) => listeners.set(name, callback) };
  const fields = ['aced', 'aces', 'acid'].map((word, index) => {
    const check = { checked: false, matches: selector => selector === 'input[type="checkbox"]',
      closest: () => ({ querySelector: () => fields[index] }) };
    const field = { name: `edt${index + 1}`, dataset: {}, value: word.slice(0, 2), isConnected: true,
      matches: () => true, closest: () => ({ querySelector: () => check, scrollIntoView: options => { field.centred = options.block; } }),
      getClientRects: () => [1], focus(options) { document.activeElement = this; this.focusOptions = options; },
      select() { this.selected = true; }, check };
    return field;
  });
  const window = { lWordArray: ['aced', 'aces', 'acid'], decrypt: word => word, lShow: 1,
    AddBabbleWord(word) { calls.push(word); fields.find(field => window.lWordArray[Number(field.name.slice(3)) - 1] === word).check.checked = true; },
    showAll: () => calls.push('all'), showNone: () => calls.push('on'), showOff: () => calls.push('off') };
  vm.runInNewContext(source, { window, document });
  const fire = (name, target, extra = {}) => {
    const event = { target, key: 'Enter', preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...extra };
    listeners.get(name)(event); return event;
  };
  return { window, document, fields, calls, fire };
}

test('legacy slots tick only their own exact answer, refresh the chosen view and retain drafts', () => {
  const f = fixture(), field = f.fields[0];
  field.value = 'aces'; f.fire('change', field);
  assert.deepEqual(f.calls, []);
  assert.equal(field.value, 'aces');
  field.value = ' ACED '; f.window.lShow = 3; f.fire('change', field);
  assert.equal(field.check.checked, true);
  assert.deepEqual(f.calls, ['aced', 'off']);
});

test('Enter checks then advances to the next unsolved visible slot; holding Enter cannot advance', () => {
  const f = fixture(), field = f.fields[0];
  field.focus(); field.value = 'aced';
  assert.equal(f.fire('keydown', field).prevented, true);
  assert.equal(f.document.activeElement, field);
  f.fire('keydown', field, { repeat: true });
  assert.equal(f.document.activeElement, field);
  f.fields[1].check.checked = true;
  f.fire('keydown', field);
  assert.equal(f.document.activeElement, f.fields[2]);
  assert.equal(f.fields[2].selected, true);
  assert.equal(f.fields[2].centred, 'center');
  assert.equal(f.fields[2].focusOptions.preventScroll, true);
  assert.equal(f.fire('keypress', field).prevented, true, 'Legacy Add Word keypress handler must not run');
});

function followFixture(words = ['ACED', 'ACES', 'ACID', 'AGED', 'AGES']) {
  const scrolled = [], body = { matches: () => false };
  const document = { body, activeElement: body, visibilityState: 'visible', hasFocus: () => true,
    defaultView: { innerHeight: 600 }, selection: null,
    querySelector: () => document.selection,
    querySelectorAll(selector) {
      const word = selector.match(/data-answer-word="([A-Z]+)"/)?.[1];
      return document.fields.filter(field => !word || field.dataset.answerWord === word);
    }, fields: [] };
  document.fields = words.map((word, index) => {
    const row = { querySelector: () => field, scrollIntoView: options => scrolled.push({ word, index, options }) };
    const field = { dataset: { answerWord: word }, value: word.slice(0, 2).toLowerCase(), disabled: false, hidden: false,
      matches: () => true, closest: () => row, getClientRects: () => field.hidden ? [] : [1],
      getBoundingClientRect: () => ({ top: index * 100, height: 20 }) };
    return field;
  });
  return { document, scrolled };
}

test('new progress centres the next visible unfilled row without changing focus or values', () => {
  const f = followFixture(), { document } = f;
  document.activeElement = document.fields[1];
  const anchor = captureClueFollow(document, 'ACES');
  const before = document.fields.map(field => field.value);
  centreNextClue(document, anchor, new Set(['ACES', 'ACID']));
  assert.equal(f.scrolled[0].word, 'AGED');
  assert.deepEqual(f.scrolled[0].options, { block: 'center', inline: 'nearest', behavior: 'instant' });
  assert.equal(document.activeElement, document.fields[1]);
  assert.deepEqual(document.fields.map(field => field.value), before);
});

test('Off and repeated grid clues follow the exact completed row and skip all found copies', () => {
  const f = followFixture(['ACED', 'ACES', 'ACID', 'ACES', 'AGED']);
  f.document.activeElement = f.document.fields[3];
  const anchor = captureClueFollow(f.document, 'ACES');
  f.document.fields[1].hidden = f.document.fields[3].hidden = true;
  centreNextClue(f.document, anchor, new Set(['ACES']));
  assert.equal(f.scrolled[0].word, 'AGED', 'Follow the active grid copy, not its earlier duplicate');
  const off = followFixture();
  off.document.activeElement = off.document.fields[1];
  off.document.selection = off.document.fields[1].closest('tr');
  const removed = captureClueFollow(off.document, 'ACES');
  off.document.fields.splice(1, 1); off.document.activeElement = off.document.body;
  off.document.selection = null;
  centreNextClue(off.document, removed, new Set(['ACES']));
  assert.equal(off.scrolled[0].word, 'ACID', 'Alphabetical Off can remove its completed row');
});

test('scrolling leaves a different editor or explicit Expert navigation alone', () => {
  const f = followFixture(), { document } = f;
  document.activeElement = document.fields[0];
  const anchor = captureClueFollow(document, 'ACES');
  centreNextClue(document, anchor, new Set(['ACES']));
  assert.deepEqual(f.scrolled, [], 'Do not move the page while another clue is being edited');
  document.activeElement = { id: 'add-word', value: 'draft', matches: () => true };
  centreNextClue(document, anchor, new Set(['ACES']));
  assert.deepEqual(f.scrolled, [], 'Keep an unfinished Add word entry in view');
  document.activeElement = document.body; document.selection = document.fields[3].closest('tr');
  centreNextClue(document, anchor, new Set(['ACES']));
  assert.deepEqual(f.scrolled, [], 'Resources/Next/Previous owns its selected row');
  assert.equal(captureClueFollow(document, 'ACES'), null, 'An existing unfinished Resources selection also keeps its place');
  assert.ok(captureClueFollow(document, 'ACES', ['AGED']), 'A completed Resources selection does not prevent following a later bulk entry');
});

test('filtered, hidden and completed lists do not scroll; a finished section wraps to the next gap', () => {
  const f = followFixture(), { document } = f;
  document.fields[1].hidden = true;
  assert.equal(captureClueFollow(document, 'ACES'), null, 'An entry outside the current filter is not a scroll anchor');
  document.fields[1].hidden = false;
  const anchor = captureClueFollow(document, 'AGES');
  centreNextClue(document, anchor, new Set(document.fields.map(field => field.dataset.answerWord)));
  assert.deepEqual(f.scrolled, []);
  centreNextClue(document, anchor, new Set(['AGES']));
  assert.equal(f.scrolled[0].word, 'ACED');
  document.visibilityState = 'hidden';
  assert.equal(centreNextClue(document, anchor, new Set(['AGES'])), null);
  assert.equal(f.scrolled.length, 1);
});

test('editing again resets the Enter sequence and composition is left alone', () => {
  const f = fixture(), field = f.fields[0];
  field.focus(); field.value = 'nope'; f.fire('keydown', field);
  field.value = 'aced'; f.fire('input', field); f.fire('keydown', field);
  assert.equal(field.check.checked, true);
  assert.equal(f.document.activeElement, field);
  assert.equal(f.fire('keydown', field, { isComposing: true }).prevented, undefined);
});

test('centering opt-out remembers a one-year preference shared by both r46.me pages', () => {
  assert.equal(readClueCenteringOff(''), false);
  assert.equal(readClueCenteringOff('other=1; lickety_clue_centering_off=1; last=2'), true);
  for (const cookie of ['lickety_clue_centering_off=0', 'lickety_clue_centering_off=invalid', 'other_lickety_clue_centering_off=1']) assert.equal(readClueCenteringOff(cookie), false);
  for (const host of ['r46.me', 'selfserve.r46.me']) assert.equal(clueCenteringCookie(true, host, true), 'lickety_clue_centering_off=1; Max-Age=31536000; Path=/; SameSite=Lax; Domain=r46.me; Secure');
  assert.equal(clueCenteringCookie(false, 'localhost', false), 'lickety_clue_centering_off=0; Max-Age=31536000; Path=/; SameSite=Lax');
  assert.ok(!clueCenteringCookie(true, 'evilr46.me', true).includes('Domain='));
});

test('turning centering off preserves double Enter navigation with normal browser focus scrolling', () => {
  for (const control of [true, false]) {
    const f = fixture(), field = f.fields[0];
    if (control) f.document.centeringControl = { checked: true };
    else f.document.cookie = 'lickety_clue_centering_off=1';
    field.focus(); field.value = 'aced'; f.fire('keydown', field); f.fire('keydown', field);
    assert.equal(f.document.activeElement, f.fields[1]);
    assert.equal(f.fields[1].selected, true);
    assert.equal(f.fields[1].centred, undefined);
    assert.equal(f.fields[1].focusOptions, undefined);
  }
});

test('clicking an unsolved checkbox cannot mark or reveal its answer, while unticking remains available', () => {
  const f = fixture(), field = f.fields[0];
  for (const value of ['ac', '', 'aces', 'wrong']) {
    field.value = value;
    field.check.checked = true; // Browsers toggle before dispatching click.
    assert.equal(f.fire('click', field.check).prevented, true);
    assert.equal(field.value, value);
    assert.deepEqual(f.calls, []);
  }
  field.check.checked = false;
  assert.equal(f.fire('click', field.check).prevented, undefined);
  field.value = ' ACED ';
  field.check.checked = true;
  assert.equal(f.fire('click', field.check).prevented, undefined);
  assert.deepEqual(f.calls, [], 'Clicking never imports an answer');
});
