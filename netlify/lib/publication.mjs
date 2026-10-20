import { randomUUID } from 'node:crypto';

export const legacyOrigin = 'https://r46.me';

export async function publicationStatus({ store, fetchImpl = fetch, configOnly = false }) {
  const saved = await store.get('mode', { type: 'json' });
  const selection = saved || { enabled: false, operationId: 'initial', changedAt: null, phase: 'idle' };
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
  if (!hook || !/^https:\/\/api\.netlify\.com\/build_hooks\/[a-f0-9]+$/.test(hook)) throw new Error('The publication build hook has not been configured.');
  const prior = await store.getWithMetadata('mode', { type: 'json' });
  const mode = { enabled, operationId: randomUUID(), changedAt: new Date().toISOString(), phase: 'deploying' };
  const result = await store.setJSON('mode', mode, prior?.etag ? { onlyIfMatch: prior.etag } : { onlyIfNew: true });
  if (!result.modified) throw new Error('Another publication change was saved first. Reload status and try again.');
  try {
    const response = await fetchImpl(hook, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ useNewBabbleClues: enabled, operationId: mode.operationId }), signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      await store.setJSON('mode', { ...mode, phase: 'failed', message: `Netlify rejected the deployment request (HTTP ${response.status}). Retry deployment.` }, { onlyIfMatch: result.etag });
      return { ...mode, phase: 'failed', message: 'Deployment could not be started. Retry deployment.' };
    }
    return { ...mode, message: 'Setting saved. Netlify is deploying the change; the public page stays available.' };
  } catch {
    // A request may have reached Netlify even when its response was lost.
    return { ...mode, message: 'Setting saved; deployment acknowledgement was unavailable. Checking the live page.' };
  }
}
