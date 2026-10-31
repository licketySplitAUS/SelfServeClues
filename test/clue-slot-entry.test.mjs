import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/clue-slot-entry.js', import.meta.url), 'utf8');
function fixture() {
  const listeners = new Map(), calls = [];
  const document = { body: {}, querySelectorAll: () => fields,
    addEventListener: (name, callback) => listeners.set(name, callback) };
  const fields = ['aced', 'aces', 'acid'].map((word, index) => {
    const check = { checked: false };
    return { name: `edt${index + 1}`, dataset: {}, value: word.slice(0, 2), isConnected: true,
      matches: () => true, closest: () => ({ querySelector: () => check }),
      getClientRects: () => [1], focus() { document.activeElement = this; },
      select() { this.selected = true; }, check };
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
  assert.equal(f.fire('keypress', field).prevented, true, 'Legacy Add Word keypress handler must not run');
});

test('editing again resets the Enter sequence and composition is left alone', () => {
  const f = fixture(), field = f.fields[0];
  field.focus(); field.value = 'nope'; f.fire('keydown', field);
  field.value = 'aced'; f.fire('input', field); f.fire('keydown', field);
  assert.equal(field.check.checked, true);
  assert.equal(f.document.activeElement, field);
  assert.equal(f.fire('keydown', field, { isComposing: true }).prevented, undefined);
});
