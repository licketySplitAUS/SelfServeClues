import { env } from './env.mjs';
export async function backupAlarm(description) {
  const webhook = env('DISCORD_DIAGNOSTICS_WEBHOOK_URL');
  if (!webhook) throw Error('Backup alert channel is not configured.');
  const sent = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ username: 'Babble backup monitor', allowed_mentions: { parse: [] }, embeds: [{ title: 'Babble backup needs attention', description, color: 0xd77930, timestamp: new Date().toISOString() }] }) });
  if (!sent.ok) throw Error('Backup alarm could not be delivered.');
}
