import { blobRepository } from './repository.mjs';
import { babbleClient, env } from './babble.mjs';
import { parseGrid } from './solver.mjs';
import { chatSettings } from './chat-settings.mjs';

export async function sendFlipNotice(event, details, { repo, webhook, fetchImpl = fetch, chatEnabled = env('NotifyBabblersOfClues') === 'true', announcementText }) {
  let chatOutcome = chatEnabled ? 'waiting-for-validation' : 'disabled';
  if (event === 'published' && chatEnabled && ['matched', 'corrected'].includes(details.validation?.status)) {
    const chatKey = `${details.date}/babble-chat-${details.puzzle}`;
    if (await repo.claimNotification(chatKey)) {
      let submitting = false;
      try {
        const client = babbleClient({ fetchImpl });
        const grid = parseGrid(await client.login());
        if (grid.puzzle !== details.puzzle || grid.date !== details.date) throw new Error('Puzzle changed.');
        submitting = true;
        await client.chat(details.puzzle, announcementText); chatOutcome = 'sent';
      } catch {
        chatOutcome = 'unconfirmed';
        if (!submitting) await repo.releaseNotification(chatKey);
        // Keep the claim after an ambiguous public send to avoid duplicates.
      }
    } else chatOutcome = 'already-sent';
  }
  if (!webhook) return { outcome: 'not-configured' };
  const excluded = details.validation?.excluded || details.validation?.rejected || [];
  const key = `${details.date}/${event}${event === 'published' ? `-${details.puzzle}-${details.validation?.status || 'unchecked'}-${excluded.join('-')}` : ''}${event === 'test' ? `-${Date.now()}` : ''}`;
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
  if (event === 'published') {
    const validation = details.validation;
    fields.push({ name: 'PlayBabble validation', value: validation ? `${['matched', 'corrected'].includes(validation.status) ? '✓' : '⚠'} ${validation.message}`.slice(0, 1024) : 'Not yet checked against a logged-in Babble session.' });
    if (excluded.length) fields.push({ name: 'Bad words found and excluded', value: excluded.map(word => `||${word}||`).join(', ').slice(0, 1024) });
    if (validation?.differences && validation.status === 'mismatch') fields.push({ name: 'Discrepancy (our clues minus Babble)', value: JSON.stringify(validation.differences).slice(0, 1024) });
    fields.push({ name: 'Babble chat', value: chatOutcome === 'disabled' ? 'Announcement disabled.' : chatOutcome });
  }
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

export async function sendConfiguredFlipNotice(event, details, options) {
  let chatEnabled = false;
  let announcementText;
  try { const setting = await chatSettings(options.repo); chatEnabled = setting.enabled; announcementText = setting.announcementText; }
  catch { console.error('Chat setting unavailable; public announcements are disabled for this invocation.'); }
  return sendFlipNotice(event, details, { ...options, chatEnabled, announcementText });
}
export const notifyFlip = (event, details, context) => sendConfiguredFlipNotice(event, details, {
  repo: blobRepository(context), webhook: env('DISCORD_PUZZLE_WEBHOOK_URL') || env('DISCORD_WEBHOOK_URL'),
});
