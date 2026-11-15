import { createHmac, timingSafeEqual } from 'node:crypto';

const channelPattern = /^\d{17,22}$/;
const digest = (value, key) => createHmac('sha256', key).update(`babble-owner-reply:v1:${value}`).digest('hex').slice(0, 32);
const makeId = (purpose, channel, date, key) => {
  if (!key || !channelPattern.test(channel)) throw Error('Reply button configuration unavailable');
  const value = [purpose, channel, ...(date ? [date] : [])].join(':');
  return `${value}:${digest(value, key)}`;
};
export function validReplyId(value, purpose, channel, date, key) {
  if (typeof value !== 'string' || !/^[\w:-]+$/.test(value) || !key || !channelPattern.test(channel)) return false;
  const expected = makeId(purpose, channel, date, key);
  return value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
export function replyButton(channel, key) {
  return [{ type: 1, components: [{ type: 2, style: 1, label: 'Reply to Babble', custom_id: makeId('babble-reply', channel, null, key) }] }];
}
export function replyModal(channel, date, key) {
  return { type: 9, data: { title: 'Reply to Babble', custom_id: makeId('babble-send', channel, date, key), components: [{
    type: 18, label: 'Message for today’s Babble chat', description: 'Posts publicly as licketySplitAUS. Up to 250 characters.',
    component: { type: 4, custom_id: 'message', style: 1, required: true, min_length: 1, max_length: 250 },
  }] } };
}

// The existing incoming webhook cannot carry this app's interactive controls.
// Its bot posts one small reply beneath the alert; no webhook migration and no
// duplicate conversation transcript is needed.
export async function sendReplyButton(webhookURL, token, sourceId, { guild, fetchImpl = fetch, signal } = {}) {
  let info;
  try {
    const response = await fetchImpl(webhookURL, { redirect: 'error', signal: signal || AbortSignal.timeout(5000) });
    if (!response.ok) throw Error('Webhook metadata unavailable');
    info = await response.json();
  } catch { throw Object.assign(Error('Reply channel could not be checked'), { ambiguous: false }); }
  if (info.guild_id !== guild || !channelPattern.test(info.channel_id) || !channelPattern.test(sourceId)) throw Object.assign(Error('Reply channel did not match the configured server'), { ambiguous: false });
  const body = {
    content: 'Reply to this conversation in today’s Babble chat:',
    message_reference: { message_id: sourceId, channel_id: info.channel_id, fail_if_not_exists: true },
    allowed_mentions: { parse: [], replied_user: false }, components: replyButton(info.channel_id, token),
  };
  let response;
  try {
    response = await fetchImpl(`https://discord.com/api/v10/channels/${info.channel_id}/messages`, {
      method: 'POST', redirect: 'error', signal: signal || AbortSignal.timeout(5000),
      headers: { authorization: `Bot ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch { throw Object.assign(Error('Reply button delivery could not be confirmed'), { ambiguous: true }); }
  if (!response.ok) {
    const seconds = Number(response.headers.get('retry-after') || 300);
    throw Object.assign(Error('Reply button delivery failed'), { ambiguous: response.status >= 500,
      retryAfter: response.status === 429 && Number.isFinite(seconds) ? Math.min(3600000, Math.max(300000, seconds * 1000)) : 300000 });
  }
  let data;
  try { data = await response.json(); } catch { /* A lost ID must not cause another new message. */ }
  if (!channelPattern.test(data?.id || '')) throw Object.assign(Error('Reply button delivery could not be confirmed'), { ambiguous: true });
  return data.id;
}
