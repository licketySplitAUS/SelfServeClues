import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = { module: { exports: {} }, URLSearchParams, URL };
vm.runInNewContext(fs.readFileSync(new URL('../public/clues-celebration.js', import.meta.url), 'utf8'), context);
const { installCluesCelebration, installExpertCelebrationUpgrade } = context.module.exports;
test('the hosted Expert pack and browser bundle use exactly the shared renderer and reporting catalog', async () => {
  const pack = JSON.parse(fs.readFileSync(new URL('../public/celebration-pack-v1.json', import.meta.url), 'utf8'));
  const shared = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL('../public/celebration-effects.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'), shared);
  assert.equal(pack.version, 1);
  assert.equal(pack.renderer, shared.createBabbleCelebration.toString());
  const catalog = shared.createBabbleCelebration({ getContext: () => null });
  assert.deepEqual(pack.effects, Array.from(catalog.effects));
  assert.deepEqual(pack.labels, Array.from(catalog.labels));
  const { celebrationNames } = await import('../netlify/lib/celebration-names.mjs');
  for (let i = 0; i < pack.effects.length; i++) assert.equal(celebrationNames[pack.effects[i]], pack.labels[i]);
  const browser = fs.readFileSync(new URL('../public/clues-celebration.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(browser.includes(pack.renderer)); assert.ok(browser.includes(pack.fireworks));
});
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
  const fireworks = (canvas, options) => { shows++; assert.equal(options.sound, true); assert.equal(options.clickReplay, false); assert.equal(options.transparent, true); return { destroy() { destroyed++; } }; };
  return { win, nodes, events, observers, timers, storage, fireworks, shows: () => shows, destroyed: () => destroyed };
}
const complete = { puzzleKey: 'published:8618:ABCDEFGHIJKLMNOPQRSTUVWXY', total: 3, found: 3 };

test('normal completion replays the selected show and words without a chooser or an extra completion report', () => {
  const f = fixture(), shows = [], reports = [];
  let words = ['alpha']; f.win.GetCelebrationWords = () => words;
  f.win.fetch = (_url, options) => { reports.push(JSON.parse(options.body)); return Promise.resolve({ ok: true }); };
  const controller = installCluesCelebration(f.win, (_canvas, options) => { shows.push(options); options.onStart({ effect: 'aurora', animation: 'aurora', seed: 71 }); return { destroy() {} }; });
  controller.progress(complete);
  let panel = f.nodes.find(node => !node.removed && node.attributes.role === 'status');
  assert.ok(!panel.children.some(node => node.attributes['aria-label'] === 'Celebration effect'));
  words = ['bravo']; panel.children.find(node => node.textContent === 'Play again').click();
  assert.equal(shows.length, 2); assert.equal(shows.at(-1).effect, 'aurora');
  assert.equal(shows.at(-1).seed, 71); assert.deepEqual(Array.from(shows.at(-1).words), ['alpha']);
  panel = f.nodes.find(node => !node.removed && node.attributes.role === 'status');
  assert.ok(!panel.children.some(node => node.attributes['aria-label'] === 'Celebration effect'));
  assert.equal(reports.length, 1); controller.stop();
});

test('browser cloud uses only current found words and the preview chooser contains the entire shared catalog', () => {
  const f = fixture(), shows = [], reports = [];
  let current = ['CHARLIE', 'alpha', 'alpha', '<not-a-word>'];
  f.win.GetCelebrationWords = () => current;
  f.win.fetch = (_url, options) => { reports.push(JSON.parse(options.body)); return Promise.resolve({ ok: true }); };
  const controller = installCluesCelebration(f.win, (_canvas, options) => {
    shows.push(options); options.onStart({ effect: 'word-cloud', animation: 'word-cloud' }); return { destroy() {} };
  });
  f.events.get('lickety:celebration-preview')({ detail: { effect: 'word-cloud' } });
  assert.deepEqual(Array.from(shows.at(-1).words), ['alpha', 'charlie']);
  const select = f.nodes.find(node => node.attributes.role === 'status').children.find(node => node.attributes['aria-label'] === 'Celebration effect');
  const pack = JSON.parse(fs.readFileSync(new URL('../public/celebration-pack-v1.json', import.meta.url), 'utf8'));
  assert.equal(select.children.length, pack.effects.length + 1);
  assert.ok(select.children.some(option => option.value === 'fibre-tunnel'));
  current = ['bravo']; controller.progress(complete);
  assert.deepEqual(Array.from(shows.at(-1).words), ['bravo'], 'a new show reads the current puzzle rather than retaining old words');
  assert.doesNotMatch(JSON.stringify(reports), /alpha|bravo|charlie|foundWords/);
  current = []; f.events.get('lickety:celebration-preview')({ detail: { effect: 'word-cloud' } });
  assert.equal(shows.at(-1).words.length, 0);
  controller.stop();
});

test('older Expert gets a silent hosted Clues effect through its existing replay/dismiss handle; new Expert remains in charge', () => {
  const f = fixture({ electron: true }); let starts = 0, oldStops = 0, stops = 0;
  const render = (canvas, options) => { assert.equal(options.sound, false); assert.equal(options.clickReplay, false); starts++; canvas.dataset = { effect: 'slime' }; return { destroy() { stops++; canvas.remove(); } }; };
  const addOld = () => { const canvas = f.win.document.createElement('canvas'); canvas.id = 'babble-expert-fireworks'; canvas.dataset = {}; f.win.document.body.appendChild(canvas); f.win.__babbleExpertFireworks = { destroy() { oldStops++; canvas.remove(); } }; };
  const controller = installExpertCelebrationUpgrade(f.win, render);
  assert.equal(controller.enabled, true); assert.equal(starts, 0);
  addOld(); f.observers[0].fn(); assert.equal(starts, 1); assert.equal(oldStops, 1);
  f.observers[0].fn(); assert.equal(starts, 1, 'the replacement cannot restart itself');
  f.win.__babbleExpertFireworks.destroy(); assert.equal(stops, 1, 'old Expert Hide stops the hosted effect');
  addOld(); f.observers[0].fn(); assert.equal(starts, 2, 'old Expert replay receives a fresh effect');
  f.win.__babbleExpertFireworks.destroy();
  const modern = f.win.document.createElement('canvas'); modern.id = 'babble-expert-fireworks'; modern.dataset = { effect: 'curtain' }; f.win.document.body.appendChild(modern);
  f.observers[0].fn(); assert.equal(starts, 2, 'Expert 3.6 selected effects are never replaced');
  assert.equal(f.storage.size, 0, 'the bridge never claims browser completion');
  controller.stop(); assert.equal(f.observers[0].disconnected, true);
  for (const options of [{}, { electron: true, print: true }]) assert.equal(installExpertCelebrationUpgrade(fixture(options).win, render).enabled, false);
});

test('browser celebrations ignore the system reduced-motion preference and offer mute/unmute', () => {
  for (const reduced of [false, true]) {
  const f = fixture({ reduced }), soundChanges = [];
  const controller = installCluesCelebration(f.win, (_canvas, options) => {
    assert.equal(options.sound, true);
    assert.equal(options.reducedMotion, false);
    return { setSoundEnabled: enabled => soundChanges.push(enabled), destroy() {} };
  });
  controller.progress(complete);
  const notice = f.nodes.find(node => node.attributes.role === 'status');
  const mute = notice.children.find(node => node.textContent === 'Mute');
  mute.click(); assert.equal(mute.textContent, 'Enable sound');
  mute.click(); assert.equal(mute.textContent, 'Mute');
  assert.deepEqual(soundChanges, [false, true]); controller.stop();
  }
});

test('browser completion reports the actual animation with either system motion preference', () => {
  for (const reduced of [false, true]) {
    const f = fixture({ reduced }); let notice;
    f.win.fetch = (_url, options) => { notice = JSON.parse(options.body); return Promise.resolve(); };
    installCluesCelebration(f.win, (_canvas, options) => { options.onStart({ effect: 'curtain', animation: 'curtain' }); return { destroy() {} }; }).progress(complete);
    assert.equal(notice.animation, 'curtain');
    assert.equal(notice.effect, 'fireworks');
  }
});
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
test('Escape, Close and auto-finish clean up animations even when the system requests reduced motion', () => {
  const reduced = fixture({ reduced: true }); installCluesCelebration(reduced.win, reduced.fireworks).progress(complete);
  assert.equal(reduced.shows(), 1); assert.ok(reduced.nodes.some(n => n.attributes.role === 'status'));
  reduced.events.get('keydown')({ key: 'Escape' }); assert.equal(reduced.nodes.filter(n => !n.removed).length, 0);
  for (const dismiss of ['close', 'timer']) {
    const f = fixture({ reduced: true }); installCluesCelebration(f.win, f.fireworks).progress(complete);
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
  const drawing = new Proxy({}, { get: (_, key) => /create.*Gradient/.test(key) ? () => gradient : key === 'measureText' ? text => ({width:text.length*10}) : () => {}, set: () => true });
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

test('hidden previews can choose effects without claiming completion or reporting, then hand over to Expert', () => {
  const f = fixture(); let notices = 0;
  f.win.fetch = () => { notices++; return Promise.resolve(); };
  installCluesCelebration(f.win, f.fireworks);
  f.events.get('lickety:celebration-preview')({ detail: { effect: 'lanterns' } });
  assert.equal(f.shows(), 1); assert.equal(notices, 0); assert.equal(f.storage.size, 0);
  f.events.get('keydown')({ key: 'Escape' }); assert.equal(f.destroyed(), 1);
  f.events.get('lickety:clues-progress')({ detail: complete });
  assert.equal(f.shows(), 2); assert.equal(notices, 1); assert.equal(f.storage.size, 1);
  const embedded = fixture({ electron: true });
  assert.equal(installCluesCelebration(embedded.win, embedded.fireworks).enabled, false);
});

test('five quick heart-logo clicks open the standalone chooser, leaving completion unclaimed', () => {
  const f = fixture(); installCluesCelebration(f.win, f.fireworks);
  let prevented = 0;
  const click = f.events.get('click');
  const event = { target: { closest: () => ({ src: 'https://r46.me/MyLogo.gif' }) }, preventDefault() { prevented++; } };
  for (let i = 0; i < 4; i++) click(event);
  assert.equal(f.shows(), 0);
  click(event); assert.equal(f.shows(), 1); assert.equal(prevented, 5); assert.equal(f.storage.size, 0);
  const panel = f.nodes.find(node => node.attributes.role === 'status');
  const chooser = panel.children.find(node => node.attributes['aria-label'] === 'Celebration effect');
  const pack = JSON.parse(fs.readFileSync(new URL('../public/celebration-pack-v1.json', import.meta.url), 'utf8'));
  assert.equal(chooser.children.length, pack.effects.length + 1);
  chooser.value = 'slime'; chooser.change(); assert.equal(f.shows(), 2); assert.equal(f.destroyed(), 1);
});


test('only a newly triggered browser celebration sends a completion notice, with no grid or entered words', async () => {
  const f = fixture(); const notices = [];
  f.win.fetch = (url, options) => { notices.push({ url, options, data: JSON.parse(options.body) }); return Promise.reject(Error('offline')); };
  const controller = installCluesCelebration(f.win, f.fireworks);
  controller.progress({ ...complete, found: 2 }); assert.equal(notices.length, 0);
  controller.progress(complete); controller.progress(complete); assert.equal(notices.length, 1);
  assert.equal(notices[0].url, '/api/clues-fireworks');
  assert.deepEqual(notices[0].data, { source: 'published', puzzle: '8618', words: 3, effect: 'fireworks', animation: 'fireworks' });
  assert.equal(notices[0].options.keepalive, true); assert.equal(f.shows(), 1);
  await Promise.resolve();
  const expert = fixture({ electron: true }); expert.win.fetch = () => assert.fail('Expert does not send browser reports');
  assert.equal(installCluesCelebration(expert.win, expert.fireworks).enabled, false);
});


test('completion report carries the browser identity without exposing a grid', () => {
  const f = fixture(); const sent = []; const id = 'CV-12345678-1234-4234-8234-123456789abc';
  f.win.LicketyBrowserIdentity = { getId: () => id }; f.win.fetch = (_, options) => { sent.push(JSON.parse(options.body)); return Promise.resolve({ ok: true }); };
  installCluesCelebration(f.win, f.fireworks).progress(complete);
  assert.equal(sent[0].browserId, id); assert.equal(sent[0].puzzle, '8618'); assert.equal(sent[0].grid, undefined);
});
