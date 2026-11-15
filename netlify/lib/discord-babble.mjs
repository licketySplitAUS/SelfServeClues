import { createPublicKey, verify } from 'node:crypto';
import { load } from 'cheerio';
import { babbleClient } from './history/babble.mjs';
import { parseGrid, sameGrid } from './history/solver.mjs';
import { centralDate, fetchChat } from './babble-mentions.mjs';
import { validReplyId, replyModal } from './discord-babble-ui.mjs';

// These are public Discord identifiers, not credentials.
export const discordBabble = Object.freeze({
  application: '1571425939013894274',
  publicKey: '3e24afd9f6f4421c24d933aa2911c46a45e54ff70dcb78b5baae384ad885d1e4',
  guild: '1560784970560053318', channel: '1571424611730718800', user: '782728802060861490',
  username: 'licketySplitAUS',
});
export const babbleCommand = Object.freeze({
  name: 'babble', type: 1, description: 'Post a message to PlayBabble as licketySplitAUS',
  options: [{ name: 'message', type: 3, description: 'Your message for Babble chat (one line, up to 250 characters)', required: true, min_length: 1, max_length: 250 }],
});
const idPattern = /^\d{17,22}$/;
const dayMs = 86400000;
const reply = content => Response.json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } }, { headers: { 'cache-control': 'no-store' } });

async function signedBody(request, publicKey, now) {
  const timestamp = request.headers.get('x-signature-timestamp') || '';
  const signature = request.headers.get('x-signature-ed25519') || '';
  if (!/^\d{10,12}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300000 || !/^[a-f\d]{128}$/i.test(signature) || !/^[a-f\d]{64}$/i.test(publicKey)) throw Error('signature');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw Error('body');
  const reader = request.body?.getReader();
  if (!reader) throw Error('body');
  let size = 0; const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 16384) throw Error('body');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const body = Buffer.concat(chunks);
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'hex')]), format: 'der', type: 'spki' });
  if (!verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signature, 'hex'))) throw Error('signature');
  return JSON.parse(body.toString('utf8'));
}

// One bounded document serializes sends and retains receipts without chat text,
// passwords, cookies or interaction tokens. Never replay a claimed command.
export function deliveryLedger(store, now = Date.now) {
  const change = async mutate => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const record = await store.getWithMetadata('delivery', { type: 'json' });
      const state = record ? record.data : { version: 1, entries: [] };
      if (state?.version !== 1 || !Array.isArray(state.entries) || state.entries.length > 512 || state.entries.some(row => !row || !idPattern.test(row.id) || !Number.isFinite(row.at) || !['preparing', 'submitting', 'sent', 'not-sent', 'uncertain'].includes(row.status))) throw Error('Invalid delivery state');
      if (record && !record.etag) throw Error('Missing delivery ETag');
      state.entries = state.entries.filter(row => row.at >= now() - dayMs);
      const result = mutate(state);
      if (result === false) return false;
      const saved = await store.setJSON('delivery', state, record ? { onlyIfMatch: record.etag } : { onlyIfNew: true });
      if (saved.modified) return true;
    }
    throw Error('Delivery checkpoint busy');
  };
  return {
    claim: async id => {
      let denial = 'busy';
      const changed = await change(state => {
        if (state.entries.some(row => row.id === id)) { denial = 'duplicate'; return false; }
        if (state.entries.some(row => ['preparing', 'submitting'].includes(row.status) && row.at > now() - 60000) || state.entries.length >= 512) return false;
        state.entries.push({ id, at: now(), status: 'preparing' });
      });
      return changed ? 'claimed' : denial;
    },
    update: (id, status) => change(state => {
      const row = state.entries.find(row => row.id === id);
      if (!row) throw Error('Missing delivery receipt');
      row.status = status;
    }),
  };
}

export async function editDiscordReply(interaction, content, fetchImpl = fetch) {
  const response = await fetchImpl(`https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
    method: 'PATCH', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) throw Error('Discord confirmation unavailable');
  await response.body?.cancel();
}

function accountMatches(html, username) {
  const text = load(html)('body').text();
  return text.match(/\blogged in as\s*:?\s*([^\s<>]+)/i)?.[1]?.toLowerCase() === username.toLowerCase();
}

export async function deliverBabbleReply(interaction, message, {
  ledger, client = babbleClient(), readChat = fetchChat, notify = editDiscordReply,
  settings = discordBabble, now = Date.now, expectedDate,
} = {}) {
  let claimed = false, submitting = false, outcome = 'not-sent';
  try {
    const claim = await ledger.claim(interaction.id);
    // A replay must not overwrite the first invocation's progress/confirmation.
    if (claim === 'duplicate') return 'duplicate';
    if (claim === 'busy') {
      await notify(interaction, 'Another message is being sent, or the daily limit has been reached. Your message was not sent. Please try again later.');
      return 'busy';
    }
    if (claim !== 'claimed') throw Error('Delivery claim unavailable');
    claimed = true;
    // Prove Discord accepted the deferred response before making a public post.
    await notify(interaction, 'Sending your message to Babble…');
    const html = await client.login();
    if (!accountMatches(html, settings.username)) throw Error('Wrong Babble account');
    const grid = parseGrid(html);
    if (grid.date !== centralDate(new Date(now())) || (expectedDate && grid.date !== expectedDate)) throw Error('Babble has not rolled over');
    const matches = rows => rows.filter(row => row.username.toLowerCase() === settings.username.toLowerCase() && row.text === message).length;
    const baseline = matches(await readChat(grid));
    const current = await client.page();
    if (!accountMatches(current, settings.username) || !sameGrid(grid, parseGrid(current)) || grid.date !== centralDate(new Date(now()))) throw Error('Puzzle changed');
    await ledger.update(interaction.id, 'submitting');
    if (grid.date !== centralDate(new Date(now()))) throw Error('Puzzle changed during checkpoint');
    submitting = true;
    try { await client.chat(grid.puzzle, message); } catch { /* Read back once; never resend an uncertain POST. */ }
    outcome = matches(await readChat(grid)) > baseline ? 'sent' : 'uncertain';
  } catch {
    outcome = submitting ? 'uncertain' : 'not-sent';
  }
  if (claimed) {
    try { await ledger.update(interaction.id, outcome); } catch { /* Existing claim still prevents a resend. */ }
  }
  const content = outcome === 'sent' ? 'Posted to Babble as licketySplitAUS.'
      : outcome === 'uncertain' ? 'Delivery could not be confirmed. Check Babble chat before trying again; your message has not been resent.'
        : 'Your message was not sent. Babble, the current puzzle, or the connection could not be checked. Please try again shortly.';
  try { await notify(interaction, content); } catch { /* No public replay when Discord feedback fails. */ }
  return outcome;
}

export function createDiscordBabbleHandler({ settings = discordBabble, enabled = () => false,
  getLedger, deliver = deliverBabbleReply, now = Date.now, buttonKey = () => '' } = {}) {
  return async (request, context) => {
    const reject = status => new Response(null, { status, headers: { 'cache-control': 'no-store' } });
    if (request.method !== 'POST') return reject(405);
    if (context?.deploy?.context !== 'production') return reject(404);
    let interaction;
    try { interaction = await signedBody(request, settings.publicKey, now()); } catch { return reject(401); }
    if (interaction?.application_id !== settings.application) return reject(403);
    if (interaction.type === 1) return Response.json({ type: 1 }, { headers: { 'cache-control': 'no-store' } });
    if (interaction.guild_id !== settings.guild || interaction.member?.user?.id !== settings.user || interaction.member.user.bot) return reply('Babble replies are only available to Lickety in the configured server.');
    let message, expectedDate;
    if (interaction.type === 2) {
      if (interaction.channel_id !== settings.channel) return reply('This command is only available in #babble-replies.');
      if (interaction.data?.type !== 1 || interaction.data.name !== 'babble') return reply('Use /babble with a message.');
      const options = interaction.data.options;
      if (Array.isArray(options) && options.length === 1 && options[0]?.name === 'message' && options[0].type === 3) message = options[0].value;
    } else if (interaction.type === 3) {
      if (interaction.data?.component_type !== 2 || interaction.message?.author?.id !== settings.application || !validReplyId(interaction.data.custom_id, 'babble-reply', interaction.channel_id, null, buttonKey())) return reply('This Reply to Babble button could not be checked. Use /babble in #babble-replies.');
      if (!enabled()) return reply('Babble replies are not enabled yet. Your message was not sent.');
      return Response.json(replyModal(interaction.channel_id, centralDate(new Date(now())), buttonKey()), { headers: { 'cache-control': 'no-store' } });
    } else if (interaction.type === 5) {
      expectedDate = centralDate(new Date(now()));
      if (!validReplyId(interaction.data?.custom_id, 'babble-send', interaction.channel_id, expectedDate, buttonKey())) return reply('This reply form has expired or could not be checked. Open Reply to Babble again; your message was not sent.');
      const components = interaction.data.components;
      const field = components?.[0]?.component;
      if (Array.isArray(components) && components.length === 1 && components[0].type === 18 && field?.type === 4 && field.custom_id === 'message') message = field.value;
    } else return reply('Use /babble with a message.');
    if (typeof message !== 'string' || !message.trim() || message.trim().length > 250 || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(message)) return reply('Enter one line of text, up to 250 characters.');
    if (!idPattern.test(interaction.id) || typeof interaction.token !== 'string' || !/^[\w.-]{1,2048}$/.test(interaction.token)) return reject(400);
    if (!enabled() || typeof context.waitUntil !== 'function') return reply('Babble replies are not enabled yet. Your message was not sent.');
    // No Blob or upstream network wait on the three-second acknowledgement path.
    context.waitUntil(Promise.resolve().then(async () => {
      let ledger;
      try { ledger = getLedger(); }
      catch {
        try { await editDiscordReply(interaction, 'Your message was not sent. Delivery storage is unavailable; please try again shortly.'); } catch { /* No public post was attempted. */ }
        return;
      }
      await deliver(interaction, message.trim(), { ledger, settings, now, expectedDate });
    }).catch(() => {}));
    return Response.json({ type: 5, data: { flags: 64 } }, { headers: { 'cache-control': 'no-store' } });
  };
}
