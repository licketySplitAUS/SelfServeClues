import { createHash, randomUUID } from 'node:crypto';
import { load } from 'cheerio';

const origin = 'https://www.playbabble.com';
const central = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const sydney = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const hash = value => createHash('sha256').update(value).digest('hex');
const parts = date => Object.fromEntries(central.formatToParts(date).map(p => [p.type, p.value]));
export function centralDate(date) { const p = parts(date); return `${p.year}-${p.month}-${p.day}`; }
export const isMention = text => /\blickety(?:split(?:aus)?|s)?\b|\bbabble\s+expert\b/i.test(text);
export const localTime = iso => sydney.format(new Date(iso));
const escape = text => text.replace(/([\\`*_{}\[\]()<>#+.!|~])/g, '\\$1');

function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}
export function archiveURL(day) {
  if (!validDate(day.date) || !Number.isSafeInteger(day.puzzle) || day.puzzle < 1) throw Error('Invalid chat archive identity');
  const [year, month, date] = day.date.split('-');
  return `${origin}/${day.puzzle}/${month}/${date}/${year}`;
}
export function puzzleLink(html) {
  const $ = load(html);
  for (const el of $('a[href]').toArray()) {
    const match = ($(el).attr('href') || '').match(/^\/(\d+)\/(\d{1,2})\/(\d{1,2})\/(\d{4})#chat_log$/);
    if (match) {
      const day = { puzzle: Number(match[1]), date: `${match[4]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` };
      archiveURL(day); return day;
    }
  }
  throw Error('Babble did not identify its current chat archive');
}

// Archive clocks are US Central wall times, without offsets. At the autumn
// repeated hour, preserve document order and choose the first possible instant.
export function chatInstant(date, clock, previous = -Infinity) {
  const match = clock.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!validDate(date) || !match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) throw Error('Invalid archive chat time');
  const hour = Number(match[1]) % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  const wall = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:00Z`);
  for (const offset of [5, 6]) {
    const instant = wall + offset * 3600000, p = parts(new Date(instant));
    if (centralDate(new Date(instant)) === date && Number(p.hour) === hour && p.minute === match[2] && instant >= previous) return new Date(instant).toISOString();
  }
  // Babble can leave posts made during the flip on yesterday's archive.
  // Accept only the midnight hour following an observed late-night post;
  // other backwards clocks must still fail without changing saved progress.
  if (hour === 0 && Number.isFinite(previous)) {
    const prior = parts(new Date(previous));
    const nextDate = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const priorDate = centralDate(new Date(previous));
    if ((priorDate === date && Number(prior.hour) === 23) || (priorDate === nextDate && Number(prior.hour) === 0)) {
      return chatInstant(nextDate, clock, previous);
    }
  }
  throw Error('Archive chat times are not in chronological Central time order');
}

export function parseChat(html, day) {
  archiveURL(day);
  const $ = load(html), title = $('h2').first().text().trim();
  const titleDate = Date.parse(`${title} 12:00:00 GMT`);
  if (!Number.isFinite(titleDate) || new Date(titleDate).toISOString().slice(0, 10) !== day.date || !$('#chat_log').length || !$('.log').length) throw Error('Chat archive date or structure changed');
  const posts = $('.log .post').toArray();
  if (posts.length > 2000) throw Error('Chat archive exceeds the post limit');
  let previous = -Infinity;
  const occurrences = new Map();
  return posts.map(el => {
    const row = $(el), message = row.find('.message').clone();
    message.find('br').replaceWith('\n');
    message.find('img').replaceWith((_, image) => $(image).attr('alt') || '');
    const username = row.find('.name').text().trim(), text = message.text().trim();
    if (!username || username.length > 200 || !text || text.length > 20000) throw Error('Invalid or oversized chat message');
    const at = chatInstant(day.date, row.find('.time').text().trim(), previous);
    previous = Date.parse(at);
    const fingerprint = hash(JSON.stringify([day.date, at, username, text]));
    const occurrence = (occurrences.get(fingerprint) || 0) + 1; occurrences.set(fingerprint, occurrence);
    return { id: `${fingerprint.slice(0, 24)}-${occurrence}`, at, username, text, mention: isMention(text), date: day.date, puzzle: day.puzzle };
  });
}

export function mentionGroups(messages) {
  const groups = [];
  for (let index = 0; index < messages.length; index++) {
    if (!messages[index].mention) continue;
    let group = groups.at(-1);
    // Merge overlapping context windows, including a new mention immediately
    // after the three replies. Extend through three replies after the last one.
    if (!group || index - 1 > group.last + 3) {
      group = { id: messages[index].id, first: index, last: index }; groups.push(group);
    } else group.last = index;
  }
  return groups.map(group => ({ ...group, messages: messages.slice(Math.max(0, group.first - 1), group.last + 4),
    replies: Math.min(3, messages.length - group.last - 1), source: archiveURL(messages[group.first]) + '#chat_log' }));
}

export function discordAlert(group, { test = false } = {}) {
  const status = group.replies === 3 ? 'Includes three messages after the last mention.' : `Waiting for ${3 - group.replies} more message${group.replies === 2 ? '' : 's'} after the last mention; this post will update.`;
  const transcript = group.messages.map(row => `${row.mention ? '[MENTION] ' : ''}${localTime(row.at)} — ${row.username}\n${row.text}`).join('\n\n');
  const description = group.messages.map(row => `${row.mention ? '🔎 ' : ''}**${escape(row.username)}** · ${localTime(row.at)}\n${row.text.split('\n').map(line => '> ' + escape(line)).join('\n')}`).join('\n\n');
  const overflow = description.length > 3900;
  const payload = { allowed_mentions: { parse: [] }, attachments: [], embeds: [{
    title: `${test ? 'Historical test · ' : ''}Babble chat mentions`, url: group.source, color: 0x719449,
    description: overflow ? 'This conversation is longer than Discord’s display limit. The attached transcript contains every message in full, with usernames and Sydney times.' : description,
    footer: { text: `Oldest first · Australia/Sydney · ${status}` },
  }] };
  return { payload, attachment: overflow ? `Babble chat mentions\n${group.source}\n${status}\n\n${transcript}\n` : null };
}

export function webhookURL(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('DISCORD_MENTIONS_URL is not a valid Discord webhook'); }
  if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname) || url.port || url.username || url.password || !/^\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w.-]+$/.test(url.pathname)) throw Error('DISCORD_MENTIONS_URL is not a valid Discord webhook');
  url.search = ''; url.hash = ''; return url;
}

export async function sendAlert(webhook, alert, { messageId, fetchImpl = fetch, signal } = {}) {
  const url = webhookURL(webhook);
  if (messageId) {
    if (!/^\d{1,22}$/.test(messageId)) throw Error('Invalid saved Discord message ID');
    url.pathname += `/messages/${messageId}`;
  } else url.searchParams.set('wait', 'true');
  let body = JSON.stringify(alert.payload), headers = { 'content-type': 'application/json' };
  if (alert.attachment) {
    const payload = { ...alert.payload, attachments: [{ id: 0, filename: 'babble-chat.txt', description: 'Complete conversation with Sydney times' }] };
    body = new FormData(); body.set('payload_json', JSON.stringify(payload));
    body.set('files[0]', new Blob([alert.attachment], { type: 'text/plain;charset=utf-8' }), 'babble-chat.txt'); headers = {};
  }
  let response;
  try { response = await fetchImpl(url, { method: messageId ? 'PATCH' : 'POST', redirect: 'error', headers, body, signal: signal || AbortSignal.timeout(5000) }); }
  catch { throw Object.assign(Error('Discord delivery could not be confirmed'), { ambiguous: !messageId }); }
  if (!response.ok) {
    const requested = Number(response.headers.get('retry-after') || 300);
    const retryAfter = response.status === 429 && Number.isFinite(requested) ? Math.min(3600000, Math.max(300000, requested * 1000)) : 300000;
    throw Object.assign(Error(`Discord mentions HTTP ${response.status}`), { ambiguous: !messageId && response.status >= 500, retryAfter });
  }
  let data;
  try { data = await response.json(); } catch { /* A new send without an ID cannot safely be replayed. */ }
  if (!/^\d{1,22}$/.test(String(data?.id || ''))) throw Object.assign(Error('Discord did not return a message ID'), { ambiguous: !messageId });
  return data.id;
}

async function htmlPage(url, fetchImpl, signal) {
  const response = await fetchImpl(url, { signal, redirect: 'error', cache: 'no-store', headers: { 'user-agent': 'LicketysChatMentions/1.0' } });
  if (!response.ok) throw Error(`Babble chat HTTP ${response.status}`);
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2000000) throw Error('Babble chat page exceeds the size limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchChat(day, { fetchImpl = fetch, signal = AbortSignal.timeout(7000) } = {}) {
  return parseChat(await htmlPage(archiveURL(day), fetchImpl, signal), day);
}

// One conditional lease covers the poll and all delivery checkpoints. A saved
// 'creating' receipt is deliberately not replayed after an ambiguous POST.
export async function runMentions({ store, webhook, now = new Date(), fetchImpl = fetch, clock = Date.now, sendButton, buttonRevision } = {}) {
  webhookURL(webhook);
  const timestamp = now.getTime(), date = centralDate(now), deadline = clock() + 24000;
  const requestSignal = () => AbortSignal.timeout(Math.max(1, Math.min(6000, deadline - clock())));
  const record = await store.getWithMetadata('monitor', { type: 'json' });
  if (record && record.data?.version !== 1) throw Error('Unknown chat monitor state; existing state was retained');
  const state = record?.data || { version: 1, days: [], alerts: {} };
  if (state.lease?.until > timestamp || state.nextPollAt > timestamp) return { outcome: 'busy-or-backoff' };
  state.lease = { id: randomUUID(), until: timestamp + 90000 };
  let result = await store.setJSON('monitor', state, record?.etag ? { onlyIfMatch: record.etag } : { onlyIfNew: true });
  if (!result.modified) return { outcome: 'busy' };
  if (!result.etag) throw Error('Chat monitor lease has no checkpoint ETag');
  let etag = result.etag;
  const save = async () => {
    result = await store.setJSON('monitor', state, { onlyIfMatch: etag });
    if (!result.modified || !result.etag) throw Error('Chat monitor lease changed');
    etag = result.etag;
  };
  let sent = 0, updated = 0, buttons = 0, buttonAttempts = 0, buttonFailures = 0;
  try {
    if (state.identity?.date !== date) {
      const identity = puzzleLink(await htmlPage(origin + '/', fetchImpl, requestSignal()));
      if (identity.date !== date) throw Error('Babble current chat has not rolled to the expected Central date');
      state.identity = identity;
    }
    const cutoff = new Date(Date.parse(`${date}T12:00:00Z`) - 2 * 86400000).toISOString().slice(0, 10);
    const lastDate = state.days.map(day => day.date).sort().at(-1);
    state.days = state.days.filter(day => day.date >= cutoff);
    // After an outage, recover up to two missed dates. Daily puzzle numbers
    // advance by one; the archive heading must independently confirm the date.
    if (lastDate && lastDate < date) {
      for (let back = 2; back >= 1; back--) {
        const missing = new Date(Date.parse(`${date}T12:00:00Z`) - back * 86400000).toISOString().slice(0, 10);
        if (missing > lastDate && !state.days.some(day => day.date === missing)) state.days.push({ date: missing, puzzle: state.identity.puzzle - back, messages: [] });
      }
    }
    let today = state.days.find(day => day.date === date);
    if (!today) { today = { ...state.identity, messages: [] }; state.days.push(today); }
    // Catch the final posts after our last poll before midnight, once only.
    for (const day of state.days.filter(day => day.date !== date && !day.closed).sort((a, b) => a.date.localeCompare(b.date)).concat(today)) {
      if (clock() > deadline - 7000) break;
      const messages = await fetchChat(day, { fetchImpl, signal: requestSignal() });
      if (messages.length < day.messages.length || day.messages.some((row, index) => messages[index]?.id !== row.id)) throw Error('Chat archive changed existing posts; progress was retained');
      day.messages = messages;
      day.closed = day.date !== date;
    }
    const messages = state.days.sort((a, b) => a.date.localeCompare(b.date)).flatMap(day => day.messages);
    state.alerts = Object.fromEntries(Object.entries(state.alerts).filter(([, alert]) => alert.date >= cutoff));
    state.failures = 0; state.nextPollAt = 0; delete state.lastError;
    for (const group of mentionGroups(messages)) {
      if (clock() > deadline - 6000 || sent + updated + buttonAttempts >= 3) break;
      const alert = discordAlert(group), fingerprint = hash(JSON.stringify(alert));
      const mentionIds = group.messages.filter(row => row.mention).map(row => row.id);
      // A conversation can outlive the cached days. Reuse its post if its
      // original first mention has aged out but a later mention remains.
      let receipt = state.alerts[group.id] || Object.values(state.alerts).find(alert => alert.mentions?.some(id => mentionIds.includes(id)));
      if (receipt?.status === 'creating' || receipt?.status === 'uncertain' || receipt?.retryAt > timestamp) continue;
      receipt ||= state.alerts[group.id] = { date: group.messages.find(row => row.mention).date };
      receipt.date = group.messages.filter(row => row.mention).at(-1).date;
      receipt.mentions = mentionIds;
      if (receipt.fingerprint !== fingerprint) {
        const creating = !receipt.messageId;
        receipt.status = creating ? 'creating' : 'updating'; await save();
        try {
          receipt.messageId = await sendAlert(webhook, alert, { messageId: receipt.messageId, fetchImpl, signal: requestSignal() });
          receipt.status = 'sent'; receipt.fingerprint = fingerprint; delete receipt.retryAt;
          if (creating) sent++; else updated++;
        } catch (error) {
          receipt.status = error.ambiguous ? 'uncertain' : 'retry';
          receipt.retryAt = timestamp + (error.retryAfter || 300000);
          state.lastError = error.ambiguous ? 'discord-send-uncertain' : 'discord-delivery-failed';
          // Discord rate limits apply to the whole webhook, not just one alert.
          state.nextPollAt = receipt.retryAt;
          await save(); break;
        }
        await save();
      }
      // Add one app-owned button beneath today's alerts. Existing webhook
      // receipts/updates remain independent; button failures cannot block them.
      const button = receipt.replyButton;
      // Refresh known messages in place after token rotation. An interrupted
      // PATCH can retry the saved ID; an ambiguous new POST still cannot.
      const refresh = !!(buttonRevision && button?.messageId && ['sent', 'updating', 'retry'].includes(button.status) && button.revision !== buttonRevision);
      if (sendButton && (receipt.date === date || refresh) && receipt.messageId && sent + updated + buttonAttempts < 3 && clock() <= deadline - 6000
        && (refresh || !['creating', 'uncertain', 'sent'].includes(button?.status)) && !(button?.retryAt > timestamp)) {
        receipt.replyButton = refresh ? { ...button, status: 'updating' } : { status: 'creating' }; await save(); buttonAttempts++;
        try {
          const messageId = await sendButton(receipt.messageId, { fetchImpl, signal: requestSignal(), ...(refresh ? { messageId: button.messageId } : {}) });
          receipt.replyButton = { status: 'sent', messageId, ...(buttonRevision ? { revision: buttonRevision } : {}) }; buttons++;
        } catch (error) {
          receipt.replyButton = { ...receipt.replyButton, status: error.ambiguous ? 'uncertain' : 'retry', retryAt: timestamp + (error.retryAfter || 300000) };
          buttonFailures++;
        }
        await save();
      }
    }
    state.lastCheckedAt = now.toISOString();
    return { outcome: state.lastError || 'checked', posts: today.messages.length, sent, updated, buttons, buttonFailures,
      uncertain: Object.values(state.alerts).filter(alert => ['creating', 'uncertain'].includes(alert.status) || ['creating', 'uncertain'].includes(alert.replyButton?.status)).length };
  } catch {
    state.failures = Math.min(6, (state.failures || 0) + 1);
    state.nextPollAt = timestamp + Math.min(3600000, 300000 * 2 ** (state.failures - 1));
    state.lastError = 'chat-check-failed';
    return { outcome: 'chat-check-failed', sent, updated };
  } finally { delete state.lease; await save(); }
}
