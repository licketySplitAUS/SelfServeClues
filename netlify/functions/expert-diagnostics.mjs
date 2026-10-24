import { anonymousAlias } from '../lib/anonymous-alias.mjs';
import { getStore, getDeployStore } from '@netlify/blobs';
import { diagnosticDelivery } from '../lib/diagnostic-delivery.mjs';
import { env, productionNotifications } from '../lib/env.mjs';
import { diagnosticErrorMeaning } from '../lib/diagnostic-errors.mjs';

const events = {
  'diagnostic-test': 'Diagnostics connection test (not a user failure)',
  'startup-failed': 'Expert could not start', 'load-failed': 'Page could not load',
  'process-failed': 'Expert main process exception',
  'load-slow': 'Page loading unusually slowly', 'load-recovered': 'Slow page finished loading',
  'renderer-crashed': 'Page renderer stopped', unresponsive: 'Page stopped responding',
  responsive: 'Page responding again', 'update-failed': 'Expert update failed',
};
const components = new Set(['main', 'babble', 'clues', 'resources', 'updater', 'tour', 'auxiliary']);
const reasons = new Set(['exception', 'timeout', 'check', 'download', 'install', 'clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'unknown']);
const json = (body, status) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const origins = new Set(['https://r46.me', 'https://selfserve.r46.me', 'https://selfserveclues.netlify.app', 'null']);
const version = value => typeof value === 'string' && /^\d+(?:\.\d+){1,3}$/.test(value) && value.length <= 32;

export function diagnosticMessage(data) {
  if (!data || typeof data !== 'object' || typeof data.event !== 'string' || !Object.hasOwn(events, data.event) || !components.has(data.component)
      || typeof data.anonymousId !== 'string' || !/^BE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(data.anonymousId)
      || typeof data.reportId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(data.reportId)
      || !version(data.version) || !['win32', 'darwin', 'linux'].includes(data.platform)
      || !['x64', 'arm64', 'ia32', 'arm'].includes(data.architecture)
      || typeof data.occurredAt !== 'string' || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(data.occurredAt) || !Number.isFinite(Date.parse(data.occurredAt))) return null;
  const fields = [
    { name: 'Anonymous user', value: `${anonymousAlias(data.anonymousId)}\n${data.anonymousId}`, inline: true },
    { name: 'Version', value: data.version, inline: true },
    { name: 'Component', value: data.component, inline: true },
    { name: 'Platform', value: `${data.platform} / ${data.architecture}`, inline: true },
  ];
  if (typeof data.osRelease === 'string' && /^[\d.]{1,32}$/.test(data.osRelease)) fields.push({ name: 'OS build', value: data.osRelease, inline: true });
  if (Number.isInteger(data.memoryMB) && data.memoryMB > 0 && data.memoryMB <= 16777216) fields.push({ name: 'Total RAM', value: `${data.memoryMB} MB`, inline: true });
  if (reasons.has(data.reason)) fields.push({ name: 'Stage / reason', value: data.reason, inline: true });
  if ((Number.isInteger(data.code) && Math.abs(data.code) < 1000000) || (typeof data.code === 'string' && /^(?:ERR_[A-Z0-9_]{1,60}|E[A-Z]{2,20})$/.test(data.code))) {
    fields.push({ name: 'Error code', value: String(data.code), inline: true });
    fields.push({ name: 'What it means', value: diagnosticErrorMeaning(data.event, data.code), inline: false });
  }
  if (Number.isFinite(data.elapsedMs) && data.elapsedMs >= 0 && data.elapsedMs <= 86400000) fields.push({ name: 'Elapsed', value: `${(data.elapsedMs / 1000).toFixed(1)} seconds`, inline: true });
  if (version(data.targetVersion)) fields.push({ name: 'Update target', value: data.targetVersion, inline: true });
  if (Number.isInteger(data.count) && data.count > 1 && data.count <= 9999) fields.push({ name: 'Repeated incidents', value: String(data.count), inline: true });
  if (['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AbortError'].includes(data.errorType)) fields.push({ name: 'Exception class', value: data.errorType, inline: true });
  if (['main.js', 'app.js', 'pages.js', 'engine.js', 'updates.js', 'settings.js', 'tour.js', 'startup.js', 'diagnostics.js', 'local-window.js', 'page-runtime.js', 'async.js'].includes(data.source) && Number.isInteger(data.line) && data.line > 0 && data.line < 100000) fields.push({ name: 'Application location', value: `${data.source}:${data.line}`, inline: true });
  fields.push({ name: 'Occurred (UTC)', value: data.occurredAt, inline: false }, { name: 'Report ID', value: data.reportId, inline: false });
  return { username: 'Babble Expert diagnostics', allowed_mentions: { parse: [] }, embeds: [{
    title: events[data.event], color: ['responsive', 'load-recovered'].includes(data.event) ? 0x51b985 : 0xe69b38,
    fields, timestamp: new Date().toISOString(),
  }] };
}

export function createHandler({ getWebhook = () => env('DISCORD_DIAGNOSTICS_WEBHOOK_URL'),
  send = (...args) => fetch(...args), delivery } = {}) {
  return async request => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const origin = request.headers.get('origin');
    if (origin && !origins.has(origin)) return json({ error: 'Unsupported origin' }, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'JSON required' }, 415);
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: 'Request is too large' }, 413);
    let data;
    try { data = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
    const message = diagnosticMessage(data);
    if (!message) return json({ error: 'Invalid diagnostic' }, 400);
    if (!productionNotifications()) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    const webhook = getWebhook();
    if (!webhook) return json({ error: 'Diagnostics service is not configured' }, 503);
    let claim;
    try {
      claim = await delivery?.claim(data);
      if (claim?.duplicate) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
      if (claim?.busy) return json({ error: 'Diagnostic delivery is in progress; retry later.' }, 503);
      const response = await send(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message), signal: AbortSignal.timeout(5000) });
      if (!response.ok) { if (claim) await delivery.finish(claim, false); return json({ error: 'Notification was rejected' }, 502); }
      if (claim) await delivery.finish(claim, true);
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    } catch { if (claim?.key) await delivery?.finish(claim, false).catch(() => {}); return json({ error: 'Diagnostics service is unavailable' }, 502); }
  };
}
export default (request, context) => {
  const options = { name: 'expert-diagnostic-delivery', consistency: 'strong' };
  const production = (context?.deploy?.context || env('CONTEXT')) === 'production';
  const store = production ? getStore(options) : getDeployStore(options);
  return createHandler({ delivery: diagnosticDelivery(store) })(request);
};
export const config = { path: '/api/expert-diagnostics', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 30, windowSize: 60 } };
