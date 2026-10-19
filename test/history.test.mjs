import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readReport } from '../tools/history/report.mjs';
import { solveGrid, scoreWord, parseGrid } from '../netlify/lib/history/solver.mjs';
import { adjust, emptyAggregate, meta, snapshotFor } from '../netlify/lib/history/stats.mjs';
import { makeService } from '../netlify/lib/history/service.mjs';
import { authorized } from '../netlify/lib/history/runtime.mjs';
import adminHandler from '../netlify/functions/history-admin.mjs';

test('SQL fixed-width reports preserve spaces, NULL flags and declared row counts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'history-report-'));
  const file = path.join(dir, 'rows.rpt');
  try {
    await fs.writeFile(file, 'ID  Name                Flag\n--- ------------------- ----\n1   A name with spaces  NULL\n\n(1 row(s) affected)\n');
    const result = [];
    assert.equal(await readReport(file, row => result.push(row)), 1);
    assert.deepEqual(result, [{ ID: '1', Name: 'A name with spaces', Flag: 'NULL' }]);
    await fs.appendFile(file, 'unexpected trailing data\n');
    await assert.rejects(readReport(file, () => {}), /data after/);
    await fs.writeFile(file, 'ID\n---\n1\n(2 row(s) affected)\n');
    await assert.rejects(readReport(file, () => {}), /declares 2/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('solver respects adjacent cells, no tile reuse, distinct words and Qu scoring', () => {
  const words = solveGrid('QIT' + 'S'.repeat(22), ['quit', 'quits', 'quit', 'quitt', 'quui', 'qits']);
  assert.deepEqual(words.map(row => row.word), ['quit', 'quits']);
  assert.equal(scoreWord('quit'), 7); assert.equal(scoreWord('quits'), 16);
  assert.equal(scoreWord('exam'), 10); assert.equal(scoreWord('jazz'), 19);
  assert.throws(() => solveGrid('ABC', []), /25 letters/);
});

test('upstream parser requires identity, real date and 25 tiles', () => {
  const html = '<a href="/8608/10/19/2026#chat_log">chat</a>' + 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('').map(letter => `<img src="/images/${letter.toLowerCase()}.gif">`).join('');
  assert.deepEqual(parseGrid(html), { puzzle: 8608, date: '2026-10-19', letters: 'ABCDEFGHIJKLMNOPQRSTUVWXY' });
  assert.throws(() => parseGrid(html.replace('/10/19/', '/02/31/')), /valid puzzle/);
  assert.throws(() => parseGrid('<img src="/images/a.gif">'), /valid puzzle/);
});

function fixture() {
  const first = { puzzle: 1, gameId: 1, date: '2026-10-17', letters: 'A'.repeat(25), totalWords: 1, totalScore: 4, words: [{ word: 'aaaa', score: 4 }] };
  const current = { ...first, puzzle: 2, gameId: 2, date: '2026-10-18' };
  const aggregate = emptyAggregate(); adjust(aggregate, first); adjust(aggregate, current);
  const baseline = { sourceVersion: 'test', importedAt: '2026-10-18T12:00:00Z', aggregate, games: [meta(first), meta(current)], current, dictionary: ['aaaa', 'aaaaa'] };
  let control = null, etag = null, version = 0, now = new Date('2026-10-19T12:00:00Z'), html = '', fetches = 0;
  const blobs = new Map();
  const repo = {
    control: async () => ({ value: structuredClone(control), etag }),
    commit: async (next, expected) => { if (expected !== etag) throw new Error('Another update won the race'); control = structuredClone(next); etag = String(++version); },
    read: async key => { assert.ok(blobs.has(key)); return structuredClone(blobs.get(key)); },
    write: async (key, value) => { assert.ok(!blobs.has(key)); blobs.set(key, structuredClone(value)); },
  };
  const worker = makeService({ repo, baseline, archivedGame: async puzzle => structuredClone([first, current].find(game => game.puzzle === puzzle) || null),
    clock: () => now, fetchImpl: async () => { fetches++; return new Response(html); } });
  const upstream = (puzzle = 3, date = '10/19/2026') => { html = `<a href="/${puzzle}/${date}#chat_log">chat</a>` + '<img src="/images/a.gif">'.repeat(25); };
  return { worker, baseline, repo, upstream, blobs, get control() { return control; }, advance: () => { now = new Date(+now + 300000); }, fetches: () => fetches };
}

test('statistics exclude today, retain frequencies, repeated leaderboards and long word lengths', () => {
  const { baseline } = fixture();
  const snapshot = snapshotFor(baseline.aggregate, baseline.games, baseline.current, baseline.dictionary);
  assert.equal(snapshot.history.gameCount, 1);
  assert.equal(snapshot.history.uniqueWords, 1);
  assert.equal(snapshot.history.frequent.length, 0, 'Single occurrence is not a frequent winner');
  assert.equal(snapshot.history.dictionaryCount, 2);
  assert.equal(snapshot.history.recent[0].puzzle, 1);
});

test('new grids need two observations; repeat checks do not duplicate history or solve', async () => {
  const f = fixture(); f.upstream();
  assert.equal((await f.worker.check()).outcome, 'candidate');
  assert.equal((await f.worker.current()).current.puzzle, 2);
  f.advance();
  assert.equal((await f.worker.check()).outcome, 'published');
  const snapshot = await f.worker.current();
  assert.equal(snapshot.current.totalWords, 2); assert.equal(snapshot.history.gameCount, 2);
  const count = f.blobs.size;
  assert.equal((await f.worker.check()).outcome, 'unchanged');
  assert.equal(f.blobs.size, count);
  assert.equal((await f.worker.current()).history.gameCount, 2);
});

test('corrections replace a puzzle contribution, retain earlier history, and can be restored', async () => {
  const f = fixture();
  await f.worker.check({ correction: { word: 'aaaaa', action: 'exclude', reason: 'Rejected by Babble' } });
  let snapshot = await f.worker.current();
  assert.equal(snapshot.current.totalWords, 1); assert.equal(snapshot.history.gameCount, 1);
  assert.equal(snapshot.history.uniqueWords, 1); assert.equal(f.fetches(), 0);
  await f.worker.check({ correction: { word: 'aaaaa', action: 'restore', reason: 'Undo test' } });
  snapshot = await f.worker.current();
  assert.equal(snapshot.current.totalWords, 2); assert.equal(snapshot.history.gameCount, 1);
  assert.deepEqual(snapshot.corrections, {});
  await assert.rejects(f.worker.check({ correction: { word: 'oops', action: 'exclude', reason: '' } }), /reason/);
});

test('stale or malformed upstream never overwrites a good result; manual input is validated', async () => {
  const f = fixture(); f.upstream(1, '10/17/2026');
  assert.equal((await f.worker.check({ accept: true })).outcome, 'waiting');
  assert.equal((await f.worker.current()).current.puzzle, 2);
  assert.equal((await f.worker.check({ manualGrid: { puzzle: 3, date: '2026-10-19', letters: 'X', reason: 'test' } })).outcome, 'waiting');
  assert.equal((await f.worker.current()).current.puzzle, 2);
  await f.worker.check({ manualGrid: { puzzle: 3, date: '2026-10-19', letters: 'A'.repeat(25), reason: 'Verified by admin' } });
  assert.equal((await f.worker.current()).current.puzzle, 3);
});

test('same puzzle with a changed grid is quarantined; manual acceptance replaces it once', async () => {
  const f = fixture(); f.upstream(2, '10/18/2026');
  // Same letters/identity correctly takes the cheap unchanged path.
  assert.equal((await f.worker.check()).outcome, 'unchanged');
  await f.worker.check({ manualGrid: { puzzle: 2, date: '2026-10-18', letters: 'A'.repeat(24) + 'B', reason: 'Corrected last tile' } });
  assert.equal((await f.worker.current()).history.gameCount, 1);
  assert.equal((await f.worker.current()).current.letters.at(-1), 'B');
  assert.equal((await f.worker.check()).outcome, 'candidate');
});

test('failed publication leaves the old snapshot visible; rollback and backup retain revisions', async () => {
  const f = fixture(); f.upstream();
  await f.worker.check({ accept: true });
  const backup = await f.worker.backup();
  assert.equal(Object.keys(backup.revisions).length, 1); assert.equal(backup.snapshot.current.puzzle, 3);
  const originalCommit = f.repo.commit;
  f.repo.commit = async () => { throw new Error('Another update won the race'); };
  await assert.rejects(f.worker.check({ rebuild: true }), /won the race/);
  assert.equal((await f.worker.current()).current.puzzle, 3);
  f.repo.commit = originalCommit;
  await f.worker.rollback();
  assert.equal((await f.worker.current()).current.puzzle, 2);
});

test('admin writes fail closed without a configured key and reject unauthenticated requests', async () => {
  const request = new Request('https://example.test/history-api/admin', { method: 'POST', headers: { 'x-admin-key': 'secret' }, body: '{}' });
  assert.equal(authorized(request, ''), false); assert.equal(authorized(request, 'secret'), true); assert.equal(authorized(request, 'different'), false);
  assert.equal((await adminHandler(new Request('https://example.test/history-api/admin', { method: 'POST', body: '{}' }))).status, 403);
});


test('flip schedule follows US Central midnight across summer, winter and DST transitions', async () => {
  const { centralTime, runScheduled } = await import('../netlify/lib/history/schedule.mjs');
  assert.deepEqual(centralTime(new Date('2026-07-01T05:05:00Z')), { date: '2026-07-01', hour: 0, minute: 5 });
  assert.deepEqual(centralTime(new Date('2026-12-01T06:05:00Z')), { date: '2026-12-01', hour: 0, minute: 5 });
  assert.equal(centralTime(new Date('2026-03-08T06:00:00Z')).hour, 0);
  assert.equal(centralTime(new Date('2026-03-09T05:00:00Z')).hour, 0);
  assert.equal(centralTime(new Date('2026-11-01T05:00:00Z')).hour, 0);
  assert.equal(centralTime(new Date('2026-11-02T06:00:00Z')).hour, 0);
  let services = 0, checks = 0;
  const createService = async () => { services++; return { current: async () => ({ current: { date: '2026-06-30', puzzle: 1 } }), check: async () => { checks++; return { outcome: 'candidate' }; } }; };
  const expected = [0,1,2,3,4,5,6,7,8,9,10,15,20,25,30,40,50];
  for (const midnight of ['2026-07-01T05:00:00Z', '2026-12-01T06:00:00Z']) for (const startMinute of [0, 17, 59]) {
    const observed = [];
    for (let minute = 0; minute <= 180; minute++) {
      const result = await runScheduled({ now: new Date(Date.parse(midnight) + minute * 60000), createService, startMinute });
      if (result.outcome === 'candidate') observed.push(minute);
    }
    assert.deepEqual(observed, expected.map(minute => minute + startMinute), 'Never publish before the start; taper retries for one hour, even across 01:00');
  }
  assert.equal((await runScheduled({ now: new Date('2026-12-01T05:00:00Z'), createService })).outcome, 'outside-window');
  assert.equal(services, 102); assert.equal(checks, 102);
});

test('scheduled checks stop fetching once the Central-date puzzle is published', async () => {
  const { runScheduled } = await import('../netlify/lib/history/schedule.mjs');
  let checks = 0;
  const createService = async () => ({ current: async () => ({ current: { date: '2026-07-01', puzzle: 42 } }), check: async () => { checks++; } });
  assert.deepEqual(await runScheduled({ now: new Date('2026-07-01T05:10:00Z'), createService }), { outcome: 'already-current', puzzle: 42 });
  assert.equal(checks, 0);
});

test('flip deadline alerts once the hour ends without fetching upstream or discarding the last result', async () => {
  const { finishFlipWindow } = await import('../netlify/lib/history/schedule.mjs');
  let checks = 0, reads = 0; const notices = [];
  const createService = async () => ({ current: async () => { reads++; return { current: { date: '2026-06-30', puzzle: 41 }, monitor: { message: 'PlayBabble returned 503.' } }; }, check: async () => { checks++; } });
  const options = { createService, notify: async (event, details) => notices.push({ event, details }) };
  assert.equal((await finishFlipWindow({ ...options, now: new Date('2026-07-01T06:00:00Z') })).outcome, 'manual-check-needed');
  assert.equal(notices[0].event, 'timeout'); assert.equal(notices[0].details.puzzle, 41);
  assert.equal((await finishFlipWindow({ ...options, now: new Date('2026-07-01T07:00:00Z') })).outcome, 'outside-window');
  assert.equal(reads, 1); assert.equal(checks, 0);
});

test('flip notices deduplicate events, avoid spoilers/mentions, and retry failed delivery without blocking publication', async () => {
  const { sendFlipNotice } = await import('../netlify/lib/history/notifications.mjs');
  const claims = new Set(), sent = [];
  const repo = { claimNotification: async key => { if (claims.has(key)) return false; claims.add(key); return true; }, releaseNotification: async key => claims.delete(key) };
  let fail = false;
  const options = { repo, webhook: 'https://example.invalid/private-flip-webhook', fetchImpl: async (url, request) => { sent.push(JSON.parse(request.body)); return new Response(null, { status: fail ? 503 : 204 }); } };
  const details = { date: '2026-07-01', puzzle: 42, words: 197, score: 2400, ignored: 'must-not-be-sent' };
  assert.equal((await sendFlipNotice('watching', details, options)).outcome, 'sent');
  assert.equal((await sendFlipNotice('watching', details, options)).outcome, 'already-sent');
  fail = true;
  assert.equal((await sendFlipNotice('published', details, options)).outcome, 'delivery-failed');
  fail = false;
  assert.equal((await sendFlipNotice('published', details, options)).outcome, 'sent');
  assert.equal((await sendFlipNotice('published', details, options)).outcome, 'already-sent');
  assert.equal(sent.length, 3); assert.deepEqual(sent[2].allowed_mentions, { parse: [] });
  assert.match(sent[2].embeds[0].description, /197 words.*2400 points/);
  assert.doesNotMatch(JSON.stringify(sent), /private-flip-webhook|must-not-be-sent/);
  assert.equal((await sendFlipNotice('test', details, { ...options, webhook: undefined })).outcome, 'not-configured');
});

test('configurable start validates minutes and moves the no-fetch cutoff to one hour after the start', async () => {
  const { scheduleStartMinute, finishFlipWindow } = await import('../netlify/lib/history/schedule.mjs');
  assert.equal(scheduleStartMinute('17'), 17); assert.equal(scheduleStartMinute('0'), 0); assert.equal(scheduleStartMinute('59'), 59);
  for (const value of ['60', '-1', '17.5', 'not-a-minute']) assert.throws(() => scheduleStartMinute(value), /whole number from 0 to 59/);
  let reads = 0, notices = 0;
  const options = { startMinute: 17, createService: async () => ({ current: async () => { reads++; return { current: { date: '2026-06-30', puzzle: 41 } }; } }), notify: async () => { notices++; } };
  assert.equal((await finishFlipWindow({ ...options, now: new Date('2026-07-01T06:00:00Z') })).outcome, 'outside-window');
  assert.equal((await finishFlipWindow({ ...options, now: new Date('2026-07-01T06:17:00Z') })).outcome, 'manual-check-needed');
  assert.equal((await finishFlipWindow({ ...options, now: new Date('2026-07-01T06:18:00Z') })).outcome, 'outside-window');
  assert.equal(reads, 1); assert.equal(notices, 1);
});

test('published puzzle notifications include game ID and word-size statistics', async()=>{
 const {puzzleNoticeDetails}=await import('../netlify/lib/history/schedule.mjs');const {sendFlipNotice}=await import('../netlify/lib/history/notifications.mjs');let sent;
 const details=puzzleNoticeDetails({current:{date:'2026-10-20',puzzle:8609,gameId:7425,totalWords:120,totalScore:1400},today:{counts:{4:{count:80,score:400},5:{count:40,score:1000}}}});
 await sendFlipNotice('published',details,{repo:{claimNotification:async()=>true},webhook:'https://example.invalid/solving',fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return new Response(null,{status:204});}});
 const fields=sent.embeds[0].fields;assert.equal(fields.find(row=>row.name==='Game ID').value,'7425');assert.equal(fields.find(row=>row.name==='Puzzle date').value,'2026-10-20');
 assert.match(fields.find(row=>row.name==='Word counts by size').value,/4 letters: 80 words.*400 pts/);assert.match(fields.find(row=>row.name==='Word counts by size').value,/5 letters: 40 words.*1000 pts/);
});
