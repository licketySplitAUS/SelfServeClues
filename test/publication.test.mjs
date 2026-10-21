import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationStatus, setPublication, configureLaunch, runPublicationLaunch, launchPlan } from '../netlify/lib/publication.mjs';
import handler from '../netlify/functions/history-publication.mjs';
import { authorized } from '../netlify/lib/history/runtime.mjs';

const fixture = () => {
  let data = null, version = 0;
  return { get: async () => structuredClone(data), getWithMetadata: async () => data ? { data: structuredClone(data), etag: String(version) } : null,
    setJSON: async (key, next, condition) => {
      if (condition?.onlyIfNew && data || condition?.onlyIfMatch && condition.onlyIfMatch !== String(version)) return { modified: false };
      data = structuredClone(next); return { modified: true, etag: String(++version) };
    } };
};
const hook = 'https://api.netlify.com/build_hooks/123abc';

test('publication defaults to legacy and config reads do not call the public site', async () => {
  const result = await publicationStatus({ store: fixture(), configOnly: true, fetchImpl: () => assert.fail('No network needed') });
  assert.equal(result.enabled, false);
});
test('Admin saves the selected mode before requesting deployment and verifies the applied operation', async () => {
  const store = fixture();
  let live = { enabled: false, operationId: 'initial' };
  const result = await setPublication(true, { store, hook, fetchImpl: async (url, request) => {
    const body = JSON.parse(request.body), saved = await store.get();
    assert.equal(saved.enabled, true); assert.equal(body.operationId, saved.operationId);
    assert.equal(body.useNewBabbleClues, true); assert.equal(url, hook);
    return Response.json({});
  } });
  const status = () => publicationStatus({ store, fetchImpl: async () => Response.json(live) });
  assert.equal((await status()).phase, 'deploying');
  live = { enabled: true, operationId: result.operationId };
  assert.equal((await status()).phase, 'live');
  const rollback = await setPublication(false, { store, hook, fetchImpl: async () => Response.json({}) });
  live = { enabled: false, operationId: rollback.operationId };
  assert.equal((await status()).liveEnabled, false);
});
test('failed build hook remains retryable and missing acknowledgement is not called live', async () => {
  const store = fixture();
  assert.equal((await setPublication(true, { store, hook, fetchImpl: async () => new Response(null, { status: 503 }) })).phase, 'failed');
  assert.equal((await publicationStatus({ store, fetchImpl: async () => Response.json({ enabled: false, operationId: 'initial' }) })).phase, 'failed');
  await setPublication(false, { store, hook, fetchImpl: async () => { throw new Error('timeout'); } });
  assert.equal((await publicationStatus({ store, fetchImpl: async () => Response.json({ enabled: false, operationId: 'old' }) })).phase, 'deploying');
});
test('invalid input and unauthenticated requests never trigger publication', async () => {
  await assert.rejects(setPublication('true', { store: fixture(), hook }), /Choose either/);
  await assert.rejects(setPublication(true, { store: fixture(), hook: '' }), /not been configured/);
  assert.equal((await handler(new Request('https://example.test/history-api/publication', { method: 'POST', body: '{}' }))).status, 403);
});

const beforeLaunch = new Date('2026-10-22T04:59:59.999Z');
const launchTime = new Date(launchPlan.scheduledAt);
const arm = store => configureLaunch('schedule-launch', { store, hook, now: beforeLaunch });

test('launch is armed without switching pages, and remains legacy until exactly Central midnight', async () => {
  const store = fixture();
  const scheduled = await arm(store);
  assert.equal(scheduled.enabled, false);
  assert.equal(scheduled.launch.state, 'scheduled');
  assert.equal((await publicationStatus({ store, configOnly: true })).enabled, false);
  assert.deepEqual(await arm(store), scheduled);
  const fetchImpl = () => assert.fail('No build before midnight');
  assert.equal((await runPublicationLaunch({ store, hook, now: beforeLaunch, fetchImpl })).outcome, 'not-due');
  const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', day: '2-digit' }).format(launchTime);
  assert.match(local, /22/); assert.match(local, /00:00/);
  const status = await publicationStatus({ store, fetchImpl: async () => Response.json({ enabled: false, operationId: 'initial' }) });
  assert.equal(status.phase, 'live'); assert.equal(status.launch.state, 'scheduled');
});

test('midnight consumes launch atomically and competing invocations request only one build', async () => {
  const store = fixture(); await arm(store);
  let builds = 0;
  const fetchImpl = async (url, request) => {
    builds++;
    const saved = await store.get();
    assert.equal(saved.enabled, true); assert.equal(saved.launch.state, 'triggered');
    assert.equal(JSON.parse(request.body).operationId, launchPlan.id);
    return Response.json({});
  };
  const results = await Promise.all(Array.from({ length: 5 }, () => runPublicationLaunch({ store, hook, now: launchTime, fetchImpl })));
  assert.equal(builds, 1); assert.equal(results.filter(r => r.outcome === 'triggered').length, 1);
  assert.equal((await store.get()).launch.triggeredAt, launchTime.toISOString());
  const status = await publicationStatus({ store, fetchImpl: async () => Response.json({ enabled: true, operationId: launchPlan.id }) });
  assert.equal(status.phase, 'live');
  await setPublication(false, { store, hook, fetchImpl: async () => Response.json({}) });
  assert.equal((await runPublicationLaunch({ store, hook, now: new Date('2026-10-22T05:20:00Z'), fetchImpl })).outcome, 'no-pending-launch');
  assert.equal((await store.get()).enabled, false); assert.equal(builds, 1);
});

test('cancelled or missed launch never switches, and cannot recur the next day or year', async () => {
  const cancelled = fixture(); await arm(cancelled);
  await configureLaunch('cancel-launch', { store: cancelled, hook, now: beforeLaunch });
  const fetchImpl = () => assert.fail('Cancelled or expired launch must not deploy');
  assert.equal((await runPublicationLaunch({ store: cancelled, hook, now: launchTime, fetchImpl })).outcome, 'no-pending-launch');
  await assert.rejects(arm(cancelled), /already been used or cancelled/);
  const store = fixture(); await arm(store);
  assert.equal((await runPublicationLaunch({ store, hook, now: new Date(launchPlan.expiresAt), fetchImpl })).outcome, 'missed');
  assert.equal((await store.get()).launch.state, 'missed');
  for (const date of ['2026-10-23T05:00:00Z', '2027-10-22T05:00:00Z']) {
    assert.equal((await runPublicationLaunch({ store, hook, now: new Date(date), fetchImpl })).outcome, 'no-pending-launch');
  }
  assert.equal((await store.get()).enabled, false);
});

test('hook rejection is visible and duplicate ticks never send another launch request', async () => {
  const store = fixture(); await arm(store); let builds = 0;
  const fetchImpl = async () => { builds++; return new Response(null, { status: 503 }); };
  assert.equal((await runPublicationLaunch({ store, hook, now: launchTime, fetchImpl })).outcome, 'deployment-failed');
  assert.equal((await store.get()).phase, 'failed');
  await runPublicationLaunch({ store, hook, now: launchTime, fetchImpl }); assert.equal(builds, 1);
  const ambiguous = fixture(); await arm(ambiguous);
  await runPublicationLaunch({ store: ambiguous, hook, now: launchTime, fetchImpl: async () => { throw Error('timeout'); } });
  assert.equal((await ambiguous.get()).launch.state, 'triggered');
  assert.equal((await publicationStatus({ store: ambiguous, fetchImpl: async () => Response.json({ enabled: false, operationId: 'initial' }) })).phase, 'deploying');
});

test('manual changes cancel a pending launch and late scheduling fails closed', async () => {
  const store = fixture(); await arm(store);
  await setPublication(false, { store, hook, fetchImpl: async () => Response.json({}) });
  assert.equal((await store.get()).launch.state, 'cancelled');
  await assert.rejects(configureLaunch('schedule-launch', { store: fixture(), hook, now: launchTime }), /already passed/);
  await assert.rejects(configureLaunch('schedule-launch', { store: fixture(), hook: '', now: beforeLaunch }), /not been configured/);
});


test('admin authentication uses the Netlify runtime environment with a local fallback', () => {
  const prior = globalThis.Netlify;
  try {
    globalThis.Netlify = { env: { get: name => name === 'HISTORY_PREVIEW_ADMIN_KEY' ? 'runtime-test-key' : undefined } };
    assert.equal(authorized(new Request('https://example.test', { headers: { 'x-admin-key': 'runtime-test-key' } })), true);
    assert.equal(authorized(new Request('https://example.test', { headers: { 'x-admin-key': 'wrong' } })), false);
    assert.equal(authorized(new Request('https://example.test'), ''), false);
  } finally { globalThis.Netlify = prior; }
});
