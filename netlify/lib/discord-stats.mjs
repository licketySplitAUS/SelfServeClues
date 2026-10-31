import { anonymousAlias } from './anonymous-alias.mjs';
import { diagnosticErrorMeaning } from './diagnostic-errors.mjs';

export const reportingChannels = Object.freeze([
  ['upgrades', '1561810196253376582'], ['flip', '1561810287492079778'], ['new-user', '1561810718519599134'],
  ['licketymessage', '1561811248960774164'], ['finishedfortheday', '1561824827046887424'], ['fireworks', '1562632376352379041'],
  ['interestinbabbleexpert', '1562663346204049448'], ['diagnostics', '1562707418893516880'],
  ['startedbabbleexpert', '1562747715178332221'], ['general', '1560784971398910105'],
].map(([name, id]) => ({ name, id })));
export const testInstallations = Object.freeze([
  { id: 'BE-MBQX-QRM7', name: anonymousAlias('BE-MBQX-QRM7'), device: 'PC' }, { id: 'BE-JQ9R-MUWL', name: anonymousAlias('BE-JQ9R-MUWL'), device: 'MacBook' },
  { id: 'BE-TEST-TEST', name: 'Synthetic', device: 'Connection test' }, { id: 'BE-TEST-2ABC', name: 'Synthetic', device: 'Client test' },
]);
const snowflake = /^\d{17,20}$/;
const epoch = 1420070400000;
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' });
const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Sydney', hour: '2-digit', hourCycle: 'h23' });
const clean = (value, max = 100) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
export function configuredChannels(value) {
  if (!value?.trim()) return reportingChannels;
  const ids = [...new Set(value.split(/[\s,]+/).filter(Boolean))];
  if (!ids.length || ids.length > 30 || ids.some(id => !snowflake.test(id))) throw new Error('DISCORD_STATS_CHANNEL_IDS must contain comma-separated channel IDs.');
  return ids.map(id => reportingChannels.find(channel => channel.id === id) || { id, name: `Channel ${id}` });
}
function sydneyDate(time) {
  const parts = Object.fromEntries(dateFormat.formatToParts(time).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function midnight(date) {
  if (!/^\d{4}-\d\d-\d\d$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error('Choose valid dates.');
  const wall = Date.parse(`${date}T00:00:00Z`);
  if (new Date(wall).toISOString().slice(0, 10) !== date) throw new Error('Choose valid dates.');
  let time = wall;
  const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(format.formatToParts(time).map(part => [part.type, part.value]));
    time += wall - Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  }
  return time;
}
export function reportRange(params, now = Date.now()) {
  const period = params.get('period') || '7';
  let from, to = now;
  if (period === 'today') from = midnight(sydneyDate(now));
  else if (period === 'all') from = epoch;
  else if (['7', '30'].includes(period)) from = now - Number(period) * 86400000;
  else if (period === 'custom') {
    from = midnight(params.get('start') || '');
    const last = params.get('end') || '';
    midnight(last);
    const nextDay = new Date(Date.parse(`${last}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    to = Math.min(now, midnight(nextDay));
  } else throw new Error('Choose Today, 7 days, 30 days, all history or a custom date range.');
  if (from < epoch || from >= to) throw new Error('Choose a start date before the end of the report.');
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), timeZone: 'Australia/Sydney' };
}
export function pageRange(params, now = Date.now()) {
  const from = Date.parse(params.get('from') || ''), to = Date.parse(params.get('to') || '');
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < epoch || from >= to || to > now + 300000) throw new Error('Invalid report date range. Start a new report.');
  const before = params.get('before');
  if (before && !snowflake.test(before)) throw new Error('Invalid Discord history cursor.');
  const endCursor = ((BigInt(to) - BigInt(epoch)) << 22n).toString();
  return { from, to, before: before && BigInt(before) < BigInt(endCursor) ? before : endCursor };
}
const events = [
  [/^New Babble Expert user$/i, 'Installs'], [/^Babble Expert upgraded$/i, 'Upgrades'],
  [/^Babble Expert started$/i, 'Starts'], [/^Babble Expert session ended$/i, 'Sessions'],
  [/^Babble Expert resource opened$/i, 'Resources'], [/^Babble Expert option used$/i, 'Options'],
  [/^Babble Expert fireworks triggered$/i, 'Expert fireworks'], [/^Clues completed/i, 'Clues completions'],
  [/^Babble Expert information page visited$/i, 'Guide visits'], [/^A message for lickety$/i, 'Contact messages'],
  [/^Babble preview:/i, 'Puzzle updates'], [/backup/i, 'Backup alerts'],
  [/^(?:Page could not load|Page loading unusually slowly|Slow page finished loading|Page renderer stopped|Page stopped responding|Page responding again|Expert could not start|Expert main process exception|Expert update failed|Diagnostics connection test)/i, 'Diagnostics'],
];
function eventFor(title) { return events.find(([pattern]) => pattern.test(title))?.[1]; }
function normalizedVersion(value) {
  const text = String(value || '').trim();
  if (!/^\d+(?:\.\d+){1,3}$/.test(text)) return '';
  const parts = text.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  if (parts.length === 4 && parts[3] === 0) parts.pop();
  return parts.join('.');
}
function normalizedPlatform(value) {
  const text = clean(value);
  const match = text.match(/^(windows|win32|darwin|macos|linux)\s*[/·]\s*(x64|arm64|ia32|arm)$/i);
  if (!match) return text;
  return `${({ windows: 'Windows', win32: 'Windows', darwin: 'macOS', macos: 'macOS', linux: 'Linux' })[match[1].toLowerCase()]} / ${match[2].toLowerCase()}`;
}
const testFeatures = new Set(['Babble Expert client option test', 'Babble Expert client resource test', 'Resources menu test']);
function durationSeconds(value) {
  if (typeof value !== 'string' || !/^\s*(?:\d+\s*[hms]\s*)+$/i.test(value)) return null;
  let seconds = 0;
  for (const match of value.matchAll(/(\d+)\s*([hms])/gi)) seconds += Number(match[1]) * ({ h: 3600, m: 60, s: 1 })[match[2].toLowerCase()];
  return seconds <= 31 * 86400 ? seconds : null;
}
function group(cohort) {
  return { cohort, posts: 0, reports: 0, sessionSeconds: 0, measuredSessions: 0, diagnosticIncidents: 0,
    installations: {}, browsers: [], events: {}, days: {}, hours: Array(24).fill(0), versions: {}, platforms: {}, countries: {}, features: {}, errors: {} };
}
const add = (table, key, amount = 1) => {
  if (key) Object.defineProperty(table, key, { value: (Object.hasOwn(table, key) ? table[key] : 0) + amount, enumerable: true, writable: true, configurable: true });
};
export function summarizeMessages(messages, from, to) {
  const groups = new Map(), browserSets = new Map();
  let hiddenReports = 0;
  for (const message of messages) {
    const time = Date.parse(message.timestamp);
    if (!Number.isFinite(time) || time < from || time >= to) continue;
    const embeds = Array.isArray(message.embeds) ? message.embeds : [];
    const embed = embeds.find(embed => eventFor(embed.title || '')) || {};
    const title = clean(embed.title), event = eventFor(title);
    const fields = new Map((Array.isArray(embed.fields) ? embed.fields : []).map(field => [field.name, String(field.value || '')]));
    const id = fields.get('Anonymous user')?.match(/\bBE-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}\b/)?.[0];
    const localInstant = fields.get('Occurred (Sydney)')?.match(/<t:(\d{1,12}):R>/);
    const occurred = localInstant ? Number(localInstant[1]) * 1000 : Date.parse(fields.get('Occurred (UTC)'));
    const observed = event === 'Diagnostics' && occurred >= epoch && occurred <= time ? occurred : time;
    const observedAt = new Date(observed).toISOString();
    const browser = fields.get('Anonymous browser')?.match(/\bCV-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/)?.[0];
    const synthetic = /^Diagnostics connection test/i.test(title) || testFeatures.has(fields.get('Option')) || testFeatures.has(fields.get('Resource'))
      || fields.get('Platform') === 'Connection test - not a player launch / test';
    const cohort = synthetic || testInstallations.some(test => test.id === id) ? 'test' : id ? 'regular' : 'unattributed';
    if (!groups.has(cohort)) { groups.set(cohort, group(cohort)); browserSets.set(cohort, new Set()); }
    const row = groups.get(cohort);
    row.posts++; if (event) row.reports++;
    add(row.events, event || 'Other posts'); add(row.days, sydneyDate(time)); row.hours[Number(hourFormat.format(time))]++;
    if (id) {
      if (!Object.hasOwn(row.installations, id)) row.installations[id] = { name: anonymousAlias(id), posts: 0, sessions: 0, sessionSeconds: 0, lastSeenAt: observedAt };
      row.installations[id].posts++;
      if (observedAt > row.installations[id].lastSeenAt) row.installations[id].lastSeenAt = observedAt;
    }
    if (browser) browserSets.get(cohort).add(browser);
    if (message.webhook_id && !message.content && !embeds.length) hiddenReports++;
    if (!event) continue;
    const version = normalizedVersion(fields.get('Version') || fields.get('Babble Expert version'));
    if (version) {
      add(row.versions, version);
      if (id) {
        const actor = row.installations[id];
        // Queued diagnostics can arrive days later, carrying an older version.
        if (!actor.versionAt || observed > Date.parse(actor.versionAt)) {
          actor.latestVersion = version; actor.versionAt = observedAt;
        }
      }
    }
    add(row.platforms, normalizedPlatform(fields.get('Platform'))); add(row.countries, clean(fields.get('Country')));
    const feature = fields.get('Resource') || fields.get('Option');
    if (feature) add(row.features, `${event}: ${clean(feature, 80)}`);
    if (event === 'Sessions') {
      const seconds = durationSeconds(fields.get('Time in program'));
      if (seconds !== null) {
        row.sessionSeconds += seconds; row.measuredSessions++;
        if (id) { row.installations[id].sessionSeconds += seconds; row.installations[id].sessions++; }
      }
    }
    if (event === 'Diagnostics') {
      const incidents = Math.min(9999, Math.max(1, Number.parseInt(fields.get('Repeated incidents'), 10) || 1));
      row.diagnosticIncidents += incidents;
      const rawCode = fields.get('Error code')?.trim();
      const code = rawCode && /^-?\d+$/.test(rawCode) ? Number(rawCode) : rawCode;
      const component = clean(fields.get('Component')) || 'Unknown component';
      const reason = fields.get('Stage / reason');
      const safeReason = ['exception', 'timeout', 'check', 'download', 'install', 'clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'unknown'].includes(reason) ? reason : '';
      const key = `${title} · ${component}${version ? ' · v' + version : ''}${safeReason ? ' · ' + safeReason : ''}${rawCode ? ' · ' + clean(rawCode, 65) : ''}`;
      const errorEvent = ({ 'Page could not load': 'load-failed', 'Page renderer stopped': 'renderer-crashed', 'Expert update failed': 'update-failed', 'Expert could not start': 'startup-failed' })[title] || 'unknown';
      const kind = /^Diagnostics connection test/i.test(title) ? 'test' : /^(?:Page responding again|Slow page finished loading)/i.test(title) ? 'recovery' : 'problem';
      if (!Object.hasOwn(row.errors, key)) row.errors[key] = { count: 0, incidents: 0, kind, installations: [], firstOccurredAt: observedAt, lastOccurredAt: observedAt, lastReceivedAt: new Date(time).toISOString(),
        meaning: rawCode ? diagnosticErrorMeaning(errorEvent, code).split('\n')[0] : kind === 'recovery' ? 'Recovery notice; not a new failure.' : kind === 'test' ? 'Synthetic connection test.' : 'No error code was supplied.' };
      const error = row.errors[key];
      error.count++; error.incidents += incidents;
      if (id && !error.installations.includes(id)) error.installations.push(id);
      if (observedAt < error.firstOccurredAt) error.firstOccurredAt = observedAt;
      if (observedAt > error.lastOccurredAt) error.lastOccurredAt = observedAt;
      if (new Date(time).toISOString() > error.lastReceivedAt) error.lastReceivedAt = new Date(time).toISOString();
    }
  }
  for (const [cohort, row] of groups) row.browsers = [...browserSets.get(cohort)];
  return { groups: [...groups.values()], hiddenReports };
}

export class DiscordError extends Error {
  constructor(message, status = 502, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export function createDiscordReader({ token, fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map();
  let globalWait = 0;
  const routeWait = new Map();
  async function get(route, bucket) {
    const remaining = Math.max(globalWait, routeWait.get(bucket) || 0) - now();
    if (remaining > 0) throw new DiscordError('Discord is limiting requests. The report will resume shortly.', 429, Math.ceil(remaining / 1000));
    let response;
    try { response = await fetchImpl('https://discord.com/api/v10' + route, { headers: { Authorization: 'Bot ' + token, 'User-Agent': 'LicketyStats (https://selfserve.r46.me, 1.0)' }, signal: AbortSignal.timeout(12000) }); }
    catch { throw new DiscordError('Discord could not be reached. Please try again.'); }
    if (response.status === 429) {
      const detail = await response.json().catch(() => ({}));
      const seconds = Math.min(3600, Math.max(1, Number(detail.retry_after || response.headers.get('retry-after')) || 2));
      if (detail.global) globalWait = now() + seconds * 1000;
      else routeWait.set(bucket, now() + seconds * 1000);
      throw new DiscordError('Discord is limiting requests. The report will resume shortly.', 429, Math.ceil(seconds));
    }
    if (response.status === 401) throw new DiscordError('Discord rejected the bot token. Check DISCORD_STATS_BOT_TOKEN and redeploy.', 503);
    if (response.status === 403) throw new DiscordError('The bot cannot read this channel. Allow View Channel and Read Message History.', 403);
    if (response.status === 404) throw new DiscordError('Channel not found or unavailable to the bot. Check its ID and server installation.', 404);
    if (!response.ok) throw new DiscordError(`Discord returned HTTP ${response.status}. Please try again.`);
    if (response.headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number(response.headers.get('x-ratelimit-reset-after'));
      if (reset > 0) routeWait.set(bucket, now() + Math.min(reset, 3600) * 1000);
    }
    try { return await response.json(); } catch { throw new DiscordError('Discord returned an unreadable response.'); }
  }
  return {
    async connection(channels) {
      const bot = await get('/users/@me', 'bot');
      const results = [];
      for (const channel of channels) {
        try {
          const messages = await get(`/channels/${channel.id}/messages?limit=1`, channel.id);
          if (!Array.isArray(messages)) throw new DiscordError('Discord returned an unreadable channel response.');
          const hidden = messages.some(message => message.webhook_id && !message.content && !message.embeds?.length);
          results.push({ ...channel, readable: true, state: hidden ? 'content-hidden' : messages.length ? 'ready' : 'empty', message: hidden ? 'Enable Message Content Intent to read report fields.' : messages.length ? 'History readable' : 'No messages returned; check history access if this channel contains posts.' });
        } catch (error) {
          if (error.status === 503 || error.status === 429) throw error;
          results.push({ ...channel, readable: false, state: 'unavailable', message: error.message });
        }
      }
      return { bot: clean(bot.username), channels: results };
    },
    async page(channel, range) {
      const key = `${channel.id}:${range.from}:${range.to}:${range.before}`;
      const saved = cache.get(key);
      if (saved && saved.expires > now()) return { ...saved.result, cached: true };
      const messages = await get(`/channels/${channel.id}/messages?limit=100&before=${range.before}`, channel.id);
      if (!Array.isArray(messages) || messages.some(message => !snowflake.test(message.id) || !Number.isFinite(Date.parse(message.timestamp)))) throw new DiscordError('Discord returned an unreadable history page.');
      const oldest = messages.reduce((first, message) => !first || BigInt(message.id) < BigInt(first.id) ? message : first, null);
      if (oldest && BigInt(oldest.id) >= BigInt(range.before)) throw new DiscordError('Discord history did not advance. Start a new report.');
      const done = messages.length < 100 || !oldest || Date.parse(oldest.timestamp) < range.from;
      const result = { ...summarizeMessages(messages, range.from, range.to), channel, fetched: messages.length, done, nextBefore: done ? null : oldest.id, cached: false };
      // Cache calculated summaries only, after authentication, in this warm
      // function's memory. No Discord message bodies are retained or published.
      for (const [key, value] of cache) if (value.expires <= now()) cache.delete(key);
      if (cache.size >= 128) cache.delete(cache.keys().next().value);
      cache.set(key, { expires: now() + 300000, result });
      return result;
    },
  };
}
