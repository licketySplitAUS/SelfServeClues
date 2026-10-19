import { blobRepository } from './repository.mjs';

export async function sendFlipNotice(event, details, { repo, webhook, fetchImpl = fetch }) {
  if (!webhook) return { outcome: 'not-configured' };
  const key = `${details.date}/${event}${event === 'test' ? `-${Date.now()}` : ''}`;
  let claimed = false;
  const messages = {
    watching: ['Babble preview: watching for the flip', `Checking for ${details.date} starting at 00:${String(details.startMinute || 0).padStart(2, '0')} US Central. Retries taper from 1 to 5 to 10 minutes and stop after one hour.`],
    published: ['Babble preview: new clues are ready', `Puzzle #${details.puzzle} · ${details.date}\n${details.words} words · ${details.score} points\nClues and historical statistics have been updated.`],
    timeout: ['Babble preview: manual flip check needed', `The check window for ${details.date} has ended without publishing that day's grid.\nKeeping puzzle #${details.puzzle} (${details.puzzleDate}).\nLast status: ${String(details.message || 'The site did not provide a confirmed new grid.').slice(0, 500)}`],
    test: ['Babble preview: flip notifications enabled', `Test notification. Flip checks start at 00:${String(details.startMinute || 0).padStart(2, '0')} US Central and stop after one hour. No puzzle data was changed by this test.`],
  };
  const [title, description] = messages[event];
  const fields = [];
  if (details.puzzle !== undefined) fields.push(
    { name: 'Puzzle date', value: String(details.date), inline: true },
    { name: 'Puzzle number', value: String(details.puzzle), inline: true },
    { name: 'Game ID', value: String(details.gameId ?? details.puzzle), inline: true },
  );
  if (details.words !== undefined) fields.push({ name: 'Words / points', value: `${details.words} words · ${details.score} points`, inline: true });
  const sizes = Object.entries(details.wordCounts || {}).sort(([a], [b]) => Number(a) - Number(b))
    .map(([length, row]) => `${length} letters: ${row.count} words · ${row.score} pts`).join('\n');
  if (sizes) fields.push({ name: 'Word counts by size', value: sizes.slice(0, 1024) });
  fields.push({ name: 'Administration', value: '[Open admin & exceptions](https://selfserve.r46.me/history-admin.html)' });
  try {
    if (!await repo.claimNotification(key)) return { outcome: 'already-sent' };
    claimed = true;
    const response = await fetchImpl(webhook, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(4500),
      body: JSON.stringify({ allowed_mentions: { parse: [] }, embeds: [{ title, description,
        color: event === 'timeout' ? 15105570 : event === 'published' ? 3066993 : 3447003,
        url: 'https://selfserve.r46.me/history-preview.html', timestamp: new Date().toISOString(),
        fields,
      }] }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { outcome: 'sent' };
  } catch {
    if (claimed) await repo.releaseNotification(key).catch(() => {});
    console.error('Discord flip notification could not be delivered. Puzzle publication is unaffected.');
    return { outcome: 'delivery-failed' };
  }
}

export const notifyFlip = (event, details) => sendFlipNotice(event, details, {
  repo: blobRepository(), webhook: process.env.DISCORD_PUZZLE_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL,
});
