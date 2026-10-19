const central = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function centralTime(now) {
  const parts = Object.fromEntries(central.formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function scheduleStartMinute(value = process.env.HISTORY_PREVIEW_START_MINUTE) {
  if (value === undefined || value === '') return 0;
  if (!/^\d{1,2}$/.test(String(value)) || Number(value) > 59) throw new Error('HISTORY_PREVIEW_START_MINUTE must be a whole number from 0 to 59.');
  return Number(value);
}

export const puzzleNoticeDetails = snapshot => ({ date: snapshot.current.date, puzzle: snapshot.current.puzzle, gameId: snapshot.current.gameId,
  words: snapshot.current.totalWords, score: snapshot.current.totalScore, wordCounts: snapshot.today?.counts || {} });

export async function runScheduled({ now = new Date(), createService, notify = async () => {}, startMinute = scheduleStartMinute() }) {
  const local = centralTime(now);
  const elapsed = local.hour * 60 + local.minute - scheduleStartMinute(startMinute);
  const allowed = elapsed >= 0 && elapsed < 60 && (elapsed < 10 || (elapsed < 30 ? elapsed % 5 === 0 : elapsed % 10 === 0));
  if (!allowed) return { outcome: 'outside-window' };
  const worker = await createService();
  const snapshot = await worker.current();
  // Once today's puzzle is published there is no need to fetch upstream again.
  // Future manual grids are also respected. Word corrections remain an admin action.
  if (snapshot.current.date >= local.date) {
    if (snapshot.current.date === local.date) await notify('published', puzzleNoticeDetails(snapshot));
    return { outcome: 'already-current', puzzle: snapshot.current.puzzle };
  }
  await notify('watching', { date: local.date, startMinute });
  const result = await worker.check();
  if (result.outcome === 'published') {
    const updated = await worker.current();
    await notify('published', puzzleNoticeDetails(updated));
  }
  return result;
}

export async function finishFlipWindow({ now = new Date(), createService, notify = async () => {}, startMinute = scheduleStartMinute() }) {
  const local = centralTime(now);
  if (local.hour * 60 + local.minute !== scheduleStartMinute(startMinute) + 60) return { outcome: 'outside-window' };
  const worker = await createService(), snapshot = await worker.current();
  if (snapshot.current.date >= local.date) {
    if (snapshot.current.date === local.date) await notify('published', puzzleNoticeDetails(snapshot));
    return { outcome: 'already-current', puzzle: snapshot.current.puzzle };
  }
  await notify('timeout', { date: local.date, puzzle: snapshot.current.puzzle, puzzleDate: snapshot.current.date, message: snapshot.monitor?.message, startMinute });
  return { outcome: 'manual-check-needed', puzzle: snapshot.current.puzzle };
}
