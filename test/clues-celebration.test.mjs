import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = { module: { exports: {} }, URLSearchParams };
vm.runInNewContext(fs.readFileSync(new URL('../public/clues-celebration.js', import.meta.url), 'utf8'), context);
const { installCluesCelebration } = context.module.exports;
function fixture({ electron = false, reduced = false, storage = new Map(), print = false } = {}) {
  const nodes = [], events = new Map(), observers = [], timers = new Map();
  const element = () => ({ style: {}, removed: false, children: [], attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    hasAttribute(name) { return name in this.attributes; },
    append(...children) { this.children.push(...children); },
    appendChild(child) { nodes.push(child); this.children.push(child); },
    addEventListener(name, fn) { this[name] = fn; }, remove() { this.removed = true; } });
  const doc = { readyState: 'complete', documentElement: element(), body: element(),
    createElement: element, getElementById: id => nodes.find(n => !n.removed && n.id === id),
    forms: { namedItem: () => null } };
  const win = { document: doc, navigator: { userAgent: electron ? 'Chrome/140 Electron/44 BabbleExpert' : 'Chrome/140' },
    location: { search: print ? '?print=1' : '', pathname: '/babbleclues' },
    matchMedia: query => ({ matches: query.includes('reduced') && reduced }),
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  };
  let shows = 0, destroyed = 0;
  const fireworks = (canvas, options) => { shows++; assert.equal(options.sound, false); assert.equal(options.clickReplay, false); assert.equal(options.transparent, true); return { destroy() { destroyed++; } }; };
  return { win, nodes, events, observers, timers, storage, fireworks, shows: () => shows, destroyed: () => destroyed };
}
const complete = { puzzleKey: 'published:8618:ABCDEFGHIJKLMNOPQRSTUVWXY', total: 3, found: 3 };
test('ordinary browser completion runs once; partial, empty, duplicate and restored progress do not replay', () => {
  const f = fixture(); const controller = installCluesCelebration(f.win, f.fireworks);
  assert.equal(f.shows(), 0, 'Saved progress is not checked at installation');
  controller.progress({ ...complete, found: 2 }); controller.progress({ ...complete, total: 0, found: 0 });
  assert.equal(f.shows(), 0);
  f.events.get('lickety:clues-progress')({ detail: complete }); assert.equal(f.shows(), 1);
  controller.progress(complete); controller.progress({ ...complete, found: 2 }); controller.progress(complete);
  assert.equal(f.shows(), 1);
  const reloaded = fixture({ storage: f.storage }); installCluesCelebration(reloaded.win, reloaded.fireworks).progress(complete);
  assert.equal(reloaded.shows(), 0);
  controller.progress({ ...complete, puzzleKey: 'new-puzzle' }); assert.equal(f.shows(), 2); assert.equal(f.destroyed(), 1);
});
test('existing Expert installations and printable pages never install browser fireworks', () => {
  for (const options of [{ electron: true }, { print: true }]) {
    const f = fixture(options); assert.equal(installCluesCelebration(f.win, f.fireworks).enabled, false); assert.equal(f.events.size, 0); assert.equal(f.shows(), 0);
  }
  const f = fixture(); f.win.__babbleExpertFireworks = {};
  assert.equal(installCluesCelebration(f.win, f.fireworks).enabled, false);
});
test('Expert overlay starting later immediately stops and removes the browser celebration', () => {
  const f = fixture(); installCluesCelebration(f.win, f.fireworks).progress(complete);
  const canvas = f.win.document.createElement('canvas'); canvas.id = 'babble-expert-fireworks'; f.win.document.body.appendChild(canvas);
  f.observers[0].fn(); assert.equal(f.destroyed(), 1); assert.equal(f.win.document.getElementById('lickety-clues-fireworks'), undefined);
  assert.equal(f.nodes.filter(n => !n.removed && n.attributes.role === 'status').length, 0); assert.equal(f.timers.size, 0);
});
test('reduced motion uses a message only; Escape, Close and auto-finish clean up', () => {
  const reduced = fixture({ reduced: true }); installCluesCelebration(reduced.win, reduced.fireworks).progress(complete);
  assert.equal(reduced.shows(), 0); assert.ok(reduced.nodes.some(n => n.attributes.role === 'status'));
  reduced.events.get('keydown')({ key: 'Escape' }); assert.equal(reduced.nodes.filter(n => !n.removed).length, 0);
  for (const dismiss of ['close', 'timer']) {
    const f = fixture(); installCluesCelebration(f.win, f.fireworks).progress(complete);
    if (dismiss === 'close') f.nodes.find(n => n.attributes.role === 'status').children[1].click();
    else [...f.timers.values()][0]();
    assert.equal(f.destroyed(), 1); assert.equal(f.timers.size, 0); assert.ok(f.observers[0].disconnected);
  }
});
test('legacy Bulk Add preserves return values and celebrates only correctly entered, checked answers', () => {
  const f = fixture(); const fields = { check1: { checked: true }, edt1: { value: 'bike' }, check2: { checked: false }, edt2: { value: 'wrong' } };
  f.win.document.forms.namedItem = name => name === 'myForm' ? { elements: { namedItem: name => fields[name] } } : null;
  f.win.lTotalWords = 2; f.win.lWordArray = ['bike', 'mugg']; f.win.lBabbleID = '8618'; f.win.decrypt = word => word;
  f.win.AddBabbleWord = () => '2'; f.win.setCheck = () => { fields.check2.checked = true; return 'unchanged'; };
  f.win.AddBulkWord = () => { fields.edt2.value = 'mugg'; return 'bulk-result'; };
  installCluesCelebration(f.win, f.fireworks); assert.equal(f.shows(), 0);
  assert.equal(f.win.setCheck(), 'unchanged'); assert.equal(f.shows(), 0, 'Checkbox with wrong text is insufficient');
  assert.equal(f.win.AddBulkWord(), 'bulk-result'); assert.equal(f.shows(), 1);
  assert.equal(f.win.AddBabbleWord(), '2'); assert.equal(f.shows(), 1);
});
test('unavailable storage does not prevent celebration or cause duplicate shows', () => {
  const f = fixture(); f.win.sessionStorage = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  const controller = installCluesCelebration(f.win, f.fireworks); controller.progress(complete); controller.progress(complete); assert.equal(f.shows(), 1);
});


test('the actual canvas renderer starts, advances and shuts down without audio or lingering frames', () => {
  const f = fixture(); let clock = 0, nextFrame = 0; const frames = new Map();
  const gradient = { addColorStop() {} };
  const drawing = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => gradient : () => {}, set: () => true });
  const create = f.win.document.createElement;
  f.win.document.createElement = tag => { const node = create(tag); node.dataset = {}; node.getContext = () => drawing; node.removeEventListener = () => {}; return node; };
  const rendererContext = { module: { exports: {} }, URLSearchParams, performance: { now: () => clock },
    devicePixelRatio: 1, innerWidth: 1000, innerHeight: 800, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: fn => { const id = ++nextFrame; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/clues-celebration.js', import.meta.url), 'utf8'), rendererContext);
  rendererContext.module.exports.installCluesCelebration(f.win).progress(complete);
  assert.equal(frames.size, 1);
  for (let index = 0; index < 240; index++) {
    clock += 1000 / 60;
    const [id, frame] = [...frames.entries()][0]; frames.delete(id); frame(clock);
  }
  assert.ok(f.win.document.getElementById('lickety-clues-fireworks'));
  f.events.get('keydown')({ key: 'Escape' }); assert.equal(frames.size, 0); assert.equal(f.timers.size, 0);
});


test('only a newly triggered browser celebration sends a completion notice, with no grid or entered words', async () => {
  const f = fixture(); const notices = [];
  f.win.fetch = (url, options) => { notices.push({ url, options, data: JSON.parse(options.body) }); return Promise.reject(Error('offline')); };
  const controller = installCluesCelebration(f.win, f.fireworks);
  controller.progress({ ...complete, found: 2 }); assert.equal(notices.length, 0);
  controller.progress(complete); controller.progress(complete); assert.equal(notices.length, 1);
  assert.equal(notices[0].url, '/api/clues-fireworks');
  assert.deepEqual(notices[0].data, { source: 'published', puzzle: '8618', words: 3, effect: 'fireworks' });
  assert.equal(notices[0].options.keepalive, true); assert.equal(f.shows(), 1);
  await Promise.resolve();
  const expert = fixture({ electron: true }); expert.win.fetch = () => assert.fail('Expert does not send browser reports');
  assert.equal(installCluesCelebration(expert.win, expert.fireworks).enabled, false);
});
