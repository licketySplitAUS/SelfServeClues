import { randomUUID } from 'node:crypto';

export const legacyOrigin = 'https://r46.me';
export const launchPlan = Object.freeze({
  id: 'new-clues-2026-10-22', scheduledAt: '2026-10-22T05:00:00.000Z',
  puzzleCheckAt: '2026-10-22T05:17:00.000Z', expiresAt: '2026-10-22T06:00:00.000Z',
});
const initialSelection = { enabled: false, operationId: 'initial', changedAt: null, phase: 'idle' };
const conditionFor = prior => prior?.etag ? { onlyIfMatch: prior.etag } : { onlyIfNew: true };
function checkHook(hook) {
  if (!hook || !/^https:\/\/api\.netlify\.com\/build_hooks\/[a-f0-9]+$/.test(hook)) throw new Error('The publication build hook has not been configured.');
}

export async function publicationStatus({ store, fetchImpl = fetch, configOnly = false }) {
  const saved = await store.get('mode', { type: 'json' });
  const selection = { ...(saved || initialSelection), launch: saved?.launch || { ...launchPlan, state: 'not-scheduled' } };
  if (configOnly) return { enabled: selection.enabled, operationId: selection.operationId };
  try {
    const response = await fetchImpl(`${legacyOrigin}/clues-publication.json?status=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Publication marker unavailable.');
    const live = await response.json();
    if (typeof live.enabled !== 'boolean' || typeof live.operationId !== 'string') throw new Error('Invalid publication marker.');
    const applied = live.enabled === selection.enabled && (!saved || live.operationId === selection.operationId);
    const delayed = selection.changedAt && Date.now() - Date.parse(selection.changedAt) > 600000;
    return { ...selection, liveEnabled: live.enabled, phase: applied ? 'live' : selection.phase === 'failed' ? 'failed' : delayed ? 'delayed' : 'deploying',
      message: applied ? `The ${live.enabled ? 'new' : 'legacy'} clues page is live at r46.me/babbleclues.` : selection.message || (delayed ? 'Deployment has not been verified after ten minutes. Check Netlify deploy logs or retry deployment.' : 'Waiting for Netlify to publish the requested change.') };
  } catch {
    return { ...selection, liveEnabled: null, phase: selection.phase === 'failed' ? 'failed' : 'unverified',
      message: selection.message || 'The live page could not be verified. Reload status shortly.' };
  }
}

export async function setPublication(enabled, { store, hook, fetchImpl = fetch }) {
  if (typeof enabled !== 'boolean') throw new Error('Choose either the new or legacy clues page.');
  checkHook(hook);
  const prior = await store.getWithMetadata('mode', { type: 'json' });
  const launch = prior?.data?.launch;
  const mode = { ...prior?.data, enabled, operationId: randomUUID(), changedAt: new Date().toISOString(), phase: 'deploying', message: undefined,
    ...(launch?.state === 'scheduled' ? { launch: { ...launch, state: 'cancelled', cancelledAt: new Date().toISOString() } } : {}) };
  const result = await store.setJSON('mode', mode, conditionFor(prior));
  if (!result.modified) throw new Error('Another publication change was saved first. Reload status and try again.');
  return requestDeployment(mode, { store, hook, fetchImpl, etag: result.etag });
}

async function requestDeployment(mode, { store, hook, fetchImpl, etag }) {
  try {
    const response = await fetchImpl(hook, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ useNewBabbleClues: mode.enabled, operationId: mode.operationId }), signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      await store.setJSON('mode', { ...mode, phase: 'failed', message: `Netlify rejected the deployment request (HTTP ${response.status}). Retry deployment.` }, { onlyIfMatch: etag });
      return { ...mode, phase: 'failed', message: 'Deployment could not be started. Retry deployment.' };
    }
    return { ...mode, message: 'Setting saved. Netlify is deploying the change; the public page stays available.' };
  } catch {
    // A request may have reached Netlify even when its response was lost.
    return { ...mode, message: 'Setting saved; deployment acknowledgement was unavailable. Checking the live page.' };
  }
}

export async function configureLaunch(action, { store, hook, now = new Date() }) {
  if (!['schedule-launch', 'cancel-launch'].includes(action)) throw new Error('Unknown launch action.');
  const prior = await store.getWithMetadata('mode', { type: 'json' });
  const mode = prior?.data || initialSelection;
  if (action === 'schedule-launch') {
    checkHook(hook);
    if (mode.launch?.state === 'scheduled') return mode;
    if (mode.launch) throw new Error('This one-time launch has already been used or cancelled.');
    if (+now >= Date.parse(launchPlan.scheduledAt)) throw new Error('The launch time has already passed. Use the manual publication switch.');
    if (mode.enabled) throw new Error('The new clues page is already selected.');
  } else if (mode.launch?.state !== 'scheduled') throw new Error('There is no pending launch to cancel.');
  const launch = action === 'schedule-launch'
    ? { ...launchPlan, state: 'scheduled', armedAt: now.toISOString() }
    : { ...mode.launch, state: 'cancelled', cancelledAt: now.toISOString() };
  const updated = { ...mode, launch };
  const result = await store.setJSON('mode', updated, conditionFor(prior));
  if (!result.modified) throw new Error('Another publication change was saved first. Reload status and try again.');
  return updated;
}

export async function runPublicationLaunch({ store, hook, now = new Date(), fetchImpl = fetch }) {
  if (+now < Date.parse(launchPlan.scheduledAt)) return { outcome: 'not-due' };
  const prior = await store.getWithMetadata('mode', { type: 'json' });
  const launch = prior?.data?.launch;
  if (launch?.id !== launchPlan.id || launch.state !== 'scheduled') return { outcome: 'no-pending-launch' };
  if (+now >= Date.parse(launch.expiresAt)) {
    await store.setJSON('mode', { ...prior.data, launch: { ...launch, state: 'missed' } }, conditionFor(prior));
    return { outcome: 'missed' };
  }
  checkHook(hook);
  // The mode and consumed launch are saved together. Duplicate cron deliveries
  // cannot repeat the launch or undo a later manual publication choice.
  const mode = { ...prior.data, enabled: true, operationId: launch.id, changedAt: now.toISOString(), phase: 'deploying', message: undefined,
    launch: { ...launch, state: 'triggered', triggeredAt: now.toISOString() } };
  const result = await store.setJSON('mode', mode, conditionFor(prior));
  if (!result.modified) return { outcome: 'already-claimed' };
  const deployment = await requestDeployment(mode, { store, hook, fetchImpl, etag: result.etag });
  return { outcome: deployment.phase === 'failed' ? 'deployment-failed' : 'triggered', operationId: mode.operationId };
}
