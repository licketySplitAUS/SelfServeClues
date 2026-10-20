import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { makePageCounter } from '../netlify/lib/page-counter.mjs';
import handler from '../netlify/functions/page-counter.mjs';

function fixture() {
  const data = new Map();
  let now = new Date('2026-10-20T12:00:00Z');
  const store = {
    get: async key => structuredClone(data.get(key) ?? null),
    setJSON: async (key, value) => {
      if (data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    list: async ({ prefix }) => ({ blobs: [...data.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }),
  };
  return { counter: makePageCounter({ store, clock: () => now }), data, advance: date => { now = new Date(date); } };
}

test('append-only ledger retains the historic total and counts simultaneous refreshes without duplicate retries', async () => {
    const { counter } = fixture();
    assert.equal(await counter.read(), 4197761);
    const visitId = randomUUID();
    assert.equal(await counter.record(visitId), 4197762);
    assert.equal(await counter.record(visitId), 4197762, 'A retry cannot increment the same page load twice');
    const ids = Array.from({ length: 30 }, () => randomUUID());
    await Promise.all(ids.flatMap(id => [counter.record(id), counter.record(id)]));
    assert.equal(await counter.read(), 4197792);
});

test('retry across midnight and immutable daily checkpoints do not change accumulated visits', async () => {
  const { counter, data, advance } = fixture();
  const visitId = randomUUID();
  await counter.record(visitId);
  advance('2026-10-21T12:00:00Z');
  await counter.record(visitId);
  await counter.record(randomUUID());
  assert.equal(await counter.read(), 4197763);
  advance('2026-10-24T12:00:00Z');
  await Promise.all([counter.seal(), counter.seal()]);
  assert.deepEqual(data.get('checkpoints/2026-10-22'), { through: '2026-10-22', count: 4197763 });
  assert.equal(await counter.read(), 4197763);
  await counter.record(randomUUID());
  assert.equal(await counter.read(), 4197764);
  assert.equal(data.get('checkpoints/2026-10-22').count, 4197763, 'Published checkpoints never change');
});

test('retry repairs a visit index after an interrupted write', async () => {
  const { counter, data } = fixture();
  const visitId = randomUUID();
  data.set(`receipts/${visitId}`, { day: '2026-10-20' });
  assert.equal(await counter.record(visitId), 4197762);
  assert.equal(await counter.record(visitId), 4197762);
});

test('invalid or oversized counter requests never reach storage', async () => {
  for (const body of ['{}', '{"visitId":"not-an-id"}', 'x'.repeat(129)]) {
    assert.equal((await handler(new Request('https://example.test/api/page-counter', { method: 'POST', body }))).status, 400);
  }
  assert.equal((await handler(new Request('https://example.test/api/page-counter', { method: 'DELETE' }))).status, 405);
  await assert.rejects(fixture().counter.record('invalid'), /Invalid/);
});
