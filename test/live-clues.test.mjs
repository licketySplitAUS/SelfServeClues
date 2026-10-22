import test from 'node:test';
import assert from 'node:assert/strict';
import { versionResponse } from '../netlify/functions/clues-version.mjs';
import { watchClueUpdates, reconcileFound } from '../shared/live-clues.mjs';
test('tiny version endpoint reads only the pointer, supports conditional requests, and ignores monitor changes', async () => {
  let control = { generation: 'published-1', snapshotKey: 'large-snapshot', lastCheck: 'now' }, reads = 0;
  const repo = { control: async () => { reads++; return { value: control }; }, read() { assert.fail('Version checks never read snapshots or history'); } };
  const request = headers => new Request('https://r46.me/history-api/version', { headers });
  const first = await versionResponse(request(), repo); assert.equal(first.status, 200); const etag = first.headers.get('etag');
  assert.deepEqual(await first.json(), { generation: 'published-1' }); assert.match(first.headers.get('netlify-cdn-cache-control'), /durable, max-age=60/);
  control.lastCheck = 'later'; const unchanged = await versionResponse(request({ 'if-none-match': etag }), repo); assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), '');
  control.generation = 'published-2'; assert.equal((await versionResponse(request({ 'if-none-match': etag }), repo)).status, 200); assert.equal(reads, 3);
  assert.deepEqual(await (await versionResponse(request(), { control: async () => ({ value: null }) })).json(), { generation: null });
  assert.equal((await versionResponse(request(), { control: async () => { throw Error('offline'); } })).status, 503);
});
function fixture() {
  let time = 0, generation = 'one', remote = 'one', calls = 0, changes = 0, interval, aborted = false;
  const winEvents = new Map(), docEvents = new Map(), urls = [];
  const win = { navigator: { onLine: true }, addEventListener: (name, fn) => winEvents.set(name, fn), removeEventListener: name => winEvents.delete(name),
    setInterval(fn, ms) { interval = fn; assert.equal(ms, 120000); return 1; }, clearInterval() { interval = null; },
  };
  const doc = { visibilityState: 'visible', addEventListener: (name, fn) => docEvents.set(name, fn), removeEventListener: name => docEvents.delete(name) };
  let fetcher = async (url, options) => { calls++; urls.push(url); options.signal.addEventListener('abort', () => { aborted = true; }); return Response.json({ generation: remote }); };
  const stop = watchClueUpdates({ win, doc, now: () => time, currentGeneration: () => generation,
    fetchImpl: (...args) => fetcher(...args), onChange: async next => { changes++; generation = next; },
  });
  return { win, doc, winEvents, docEvents, stop, urls, tick: async () => interval?.(), advance: ms => { time += ms; },
    remote: value => { remote = value; }, fetcher: fn => { fetcher = fn; }, calls: () => calls, changes: () => changes, aborted: () => aborted };
}
test('visible pages poll lightly and fetch new data only on a changed publication', async () => {
  const f = fixture(); assert.equal(f.calls(), 0);
  f.advance(120000); await f.tick(); assert.equal(f.calls(), 1); assert.equal(f.changes(), 0);
  f.remote('two'); f.advance(120000); await f.tick(); assert.equal(f.changes(), 1);
  f.advance(120000); await f.tick(); assert.equal(f.changes(), 1); assert.deepEqual(f.urls, ['/history-api/version?known=one', '/history-api/version?known=one', '/history-api/version?known=two']); f.stop();
});
test('hidden and offline pages make no requests; returning checks promptly with focus burst protection', async () => {
  const f = fixture(); f.doc.visibilityState = 'hidden'; f.advance(120000); await f.tick(); assert.equal(f.calls(), 0);
  f.doc.visibilityState = 'visible'; await f.docEvents.get('visibilitychange')(); assert.equal(f.calls(), 1);
  await f.winEvents.get('focus')(); assert.equal(f.calls(), 1);
  f.win.navigator.onLine = false; f.advance(120000); await f.tick(); assert.equal(f.calls(), 1);
  f.win.navigator.onLine = true; await f.winEvents.get('online')(); assert.equal(f.calls(), 2); f.stop();
});
test('overlapping checks, broken responses and stopped requests never apply stale updates', async () => {
  const f = fixture(); let resolve;
  f.fetcher(() => new Promise(done => { resolve = done; }));
  f.advance(120000); const pending = f.tick(); await f.tick(); assert.equal(f.changes(), 0);
  f.stop(); resolve(Response.json({ generation: 'two' })); await pending; assert.equal(f.changes(), 0);
  assert.equal(f.winEvents.size, 0); assert.equal(f.docEvents.size, 0);
  const retry = fixture(); retry.fetcher(async () => { throw Error('offline'); }); retry.advance(120000); await retry.tick(); assert.equal(retry.changes(), 0);
  retry.fetcher(async () => Response.json({ generation: 'recovered' })); retry.advance(120000); await retry.tick(); assert.equal(retry.changes(), 1); retry.stop();
});
test('same-puzzle corrections retain valid entered words, remove duplicates and exclude removed answers', () => {
  assert.deepEqual(reconcileFound(['BIKE','mugg','BIKE','REMOVED',null], ['BIKE','MUGG','NEW']), ['BIKE','MUGG']);
  assert.deepEqual(reconcileFound({ wrong: 'shape' }, ['BIKE']), []);
  assert.deepEqual(reconcileFound(['OLD'], ['NEW']), []);
});
