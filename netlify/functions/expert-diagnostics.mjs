import { anonymousAlias } from '../lib/anonymous-alias.mjs';
import { resolveInstallationAlias } from '../lib/alias-registry.mjs';
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
  'update-stage': 'Babble Expert update journey', 'celebration-pack-failed': 'Celebration pack unavailable',
};
const components = new Set(['main', 'babble', 'clues', 'resources', 'updater', 'tour', 'auxiliary']);
const reasons = new Set(['exception', 'timeout', 'check', 'download', 'install', 'clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'unknown']);
const json = (body, status) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const origins = new Set(['https://r46.me', 'https://selfserve.r46.me', 'https://selfserveclues.netlify.app', 'null']);
const version = value => typeof value === 'string' && /^\d+(?:\.\d+){1,3}$/.test(value) && value.length <= 32;
const sydneyTime = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney',
  day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });

export function diagnosticMessage(data) {
  if (!data || typeof data !== 'object' || typeof data.event !== 'string' || !Object.hasOwn(events, data.event) || !components.has(data.component)
      || typeof data.anonymousId !== 'string' || !/^BE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(data.anonymousId)
      || typeof data.reportId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(data.reportId)
      || !version(data.version) || !['win32', 'darwin', 'linux'].includes(data.platform)
      || !['x64', 'arm64', 'ia32', 'arm'].includes(data.architecture)
      || typeof data.occurredAt !== 'string' || !/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(data.occurredAt) || !Number.isFinite(Date.parse(data.occurredAt))) return null;
  const stages = { 'download-ready': 'Download ready', later: 'User chose Later', 'install-requested': 'Installation requested', 'download-opened': 'Download opened (Mac)', running: 'New version running successfully' };
  if (data.event === 'update-stage' && (data.component !== 'updater' || !Object.hasOwn(stages, data.stage) || !version(data.targetVersion))) return null;
  const fields = [
    { name: 'Anonymous user', value: `${anonymousAlias(data.anonymousId)}\n${data.anonymousId}`, inline: true },
    { name: 'Version', value: data.version, inline: true },
    { name: 'Component', value: data.component, inline: true },
    { name: 'Platform', value: `${data.platform} / ${data.architecture}`, inline: true },
  ];
  if (data.event === 'update-stage') {
    fields.push({ name: 'Upgrade step', value: stages[data.stage], inline: false });
    fields.push({ name: 'What this confirms', value: data.stage === 'running' ? 'The newer version opened its main window successfully.' : data.stage === 'install-requested' ? 'Installation was requested; a later successful launch confirms the result.' : data.stage === 'download-opened' ? 'The Mac download link opened; download and installation are not yet confirmed.' : data.stage === 'later' ? 'The player deferred the update; this is not an update failure.' : 'The update download finished and is ready to install.', inline: false });
    if (version(data.previousVersion)) fields.push({ name: 'Previous version', value: data.previousVersion, inline: true });
  }
  if (data.event === 'celebration-pack-failed') fields.push({ name: 'Effect on play', value: 'Expert keeps using cached or bundled effects and retries silently. No error dialog is shown.', inline: false });
  if (typeof data.incidentId === 'string' && /^[a-f0-9-]{36}$/.test(data.incidentId)) fields.push({ name: 'Incident ID', value: data.incidentId, inline: false });
  if (['continuous', 'interrupted'].includes(data.timingStatus)) fields.push({ name: 'Timing', value: data.timingStatus === 'interrupted' ? 'Interrupted by sleep, suspension or delayed execution; elapsed time excluded' : 'Continuous measurement', inline: false });
  if (typeof data.osRelease === 'string' && /^[\d.]{1,32}$/.test(data.osRelease)) fields.push({ name: 'OS build', value: data.osRelease, inline: true });
  const windows = { zoom: 'Zoom', add: 'Lickety Add', history: 'Recent entries', message: 'Send lickety a message', help: 'Help', highlights: "What's new", clue: 'Create Clues', journal: 'Personal progress journal' };
  if (typeof data.window === 'string' && Object.hasOwn(windows, data.window)) fields.push({ name: 'Window', value: windows[data.window], inline: true });
  if (Number.isInteger(data.memoryMB) && data.memoryMB > 0 && data.memoryMB <= 16777216) fields.push({ name: 'Total RAM', value: `${data.memoryMB} MB`, inline: true });
  const resourceFields = { appWorkingSetMB: 'Expert working set (sum)', appPrivateMB: 'Expert private memory', freeMemoryMB: 'System free RAM', appCpuPercent: 'Expert CPU (% of machine)', sampleWindowSeconds: 'CPU sample window (seconds)', sampleAgeSeconds: 'Resource sample age (seconds)' };
  for (const [key, name] of Object.entries(resourceFields)) {
    const max = key === 'appCpuPercent' ? 100 : key.endsWith('Seconds') ? 90 : 16777216;
    if (Number.isFinite(data[key]) && data[key] >= 0 && data[key] <= max && (key === 'appCpuPercent' || Number.isInteger(data[key]))) fields.push({ name, value: String(data[key]), inline: true });
  }
  if (data.service && ['github-api', 'github-assets', 'github-releases', 'github-updates'].includes(data.service)) fields.push({ name: 'Update service', value: data.service, inline: true });
  if (['offline', 'online-hint', 'unknown'].includes(data.networkState)) fields.push({ name: 'Connection status', value: data.networkState === 'online-hint' ? 'Network link reported online; internet/GitHub access is not confirmed' : data.networkState === 'offline' ? 'Device reported offline' : 'Not determined', inline: false });
  if (reasons.has(data.reason)) fields.push({ name: 'Stage / reason', value: data.reason, inline: true });
  if (data.event === 'update-failed') {
    const impact = {
      check: 'Expert could not check whether a newer version is available. This check did not install an update.',
      download: 'Expert could not finish downloading the update. The running application has not been replaced by this download.',
      install: 'Expert could not start or complete the installation step. Check the version shown in Expert after reopening it.',
    };
    if (Object.hasOwn(impact, data.reason)) fields.push({ name: 'Effect on Expert', value: impact[data.reason], inline: false });
  }
  if ((Number.isInteger(data.code) && Math.abs(data.code) < 1000000) || (typeof data.code === 'string' && /^(?:ERR_[A-Z0-9_]{1,60}|E[A-Z]{2,20})$/.test(data.code))) {
    fields.push({ name: 'Error code', value: String(data.code), inline: true });
    fields.push({ name: 'What it means', value: diagnosticErrorMeaning(data.event, data.code), inline: false });
  }
  else if (['load-slow', 'load-recovered', 'unresponsive', 'responsive'].includes(data.event)) fields.push({ name: 'What it means', value: diagnosticErrorMeaning(data.event), inline: false });
  if (data.timingStatus !== 'interrupted' && Number.isFinite(data.elapsedMs) && data.elapsedMs >= 0 && data.elapsedMs <= 86400000) fields.push({ name: 'Elapsed', value: `${(data.elapsedMs / 1000).toFixed(1)} seconds`, inline: true });
  if (version(data.targetVersion)) fields.push({ name: 'Update target', value: data.targetVersion, inline: true });
  if (Number.isInteger(data.count) && data.count > 1 && data.count <= 9999) fields.push({ name: 'Repeated incidents', value: String(data.count), inline: true });
  if (['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError', 'AbortError'].includes(data.errorType)) fields.push({ name: 'Exception class', value: data.errorType, inline: true });
  if (['main.js', 'app.js', 'pages.js', 'engine.js', 'updates.js', 'settings.js', 'tour.js', 'startup.js', 'diagnostics.js', 'local-window.js', 'page-runtime.js', 'async.js'].includes(data.source) && Number.isInteger(data.line) && data.line > 0 && data.line < 100000) fields.push({ name: 'Application location', value: `${data.source}:${data.line}`, inline: true });
  // The Discord timestamp preserves an unambiguous instant for statistics;
  // the explicit Sydney date remains readable in any viewer's time zone.
  fields.push({ name: 'Occurred (Sydney)', value: `${sydneyTime.format(new Date(data.occurredAt))}\n<t:${Math.floor(Date.parse(data.occurredAt) / 1000)}:R>`, inline: false }, { name: 'Report ID', value: data.reportId, inline: false });
  return { username: 'Babble Expert diagnostics', allowed_mentions: { parse: [] }, embeds: [{
    title: events[data.event], color: ['responsive', 'load-recovered'].includes(data.event) ? 0x51b985 : 0xe69b38,
    fields, timestamp: new Date().toISOString(),
  }] };
}

export function createHandler({ getWebhook = data => data.event === 'update-stage' ? env('DISCORD_UPGRADE_WEBHOOK_URL') || env('DISCORD_DIAGNOSTICS_WEBHOOK_URL') : env('DISCORD_DIAGNOSTICS_WEBHOOK_URL'),
  send = (...args) => fetch(...args), delivery, resolveAlias = async id => anonymousAlias(id) } = {}) {
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
    // Acknowledge routine offline reports from older clients too, without
    // forwarding them to Discord or leaving them queued for another delivery.
    const networkCodes = new Set([-7, -15, -21, -100, -101, -102, -103, -104, -105, -106, -109, -118, -137,
      'ERR_INTERNET_DISCONNECTED', 'ERR_NAME_NOT_RESOLVED', 'ERR_CONNECTION_TIMED_OUT', 'ERR_CONNECTION_RESET', 'ERR_CONNECTION_CLOSED', 'ERR_CONNECTION_REFUSED', 'ERR_SOCKET_NOT_CONNECTED', 'ERR_NETWORK_CHANGED',
      'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ERR_UPDATE_UNKNOWN', 'ERR_UPDATER_INVALID_RELEASE_FEED', 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND', 'ERR_CELEBRATION_DOWNLOAD_FAILED']);
    if (['load-failed', 'update-failed', 'celebration-pack-failed'].includes(data.event) &&
      (data.code === -106 || data.code === 'ERR_INTERNET_DISCONNECTED' || (data.networkState === 'offline' && networkCodes.has(data.code)))) {
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    }
    if (!productionNotifications()) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    const webhook = getWebhook(data);
    if (!webhook) return json({ error: 'Diagnostics service is not configured' }, 503);
    let claim;
    try {
      claim = await delivery?.claim(data);
      if (claim?.duplicate) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
      if (claim?.busy) return json({ error: 'Diagnostic delivery is in progress; retry later.' }, 503);
      message.embeds[0].fields[0].value = `${await resolveAlias(data.anonymousId)}\n${data.anonymousId}`;
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
  return createHandler({ delivery: diagnosticDelivery(store), resolveAlias: resolveInstallationAlias })(request);
};
export const config = { path: '/api/expert-diagnostics', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 30, windowSize: 60 } };
