const central = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function centralTime(now) {
  const parts = Object.fromEntries(central.formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

export async function runScheduled({ now = new Date(), createService, notify = async () => {} }) {
  const local = centralTime(now);
  const allowed = local.hour === 0 && (local.minute < 10 || (local.minute < 30 ? local.minute % 5 === 0 : local.minute % 10 === 0));
  if (!allowed) return { outcome: 'outside-window' };
  const worker = await createService();
  const snapshot = await worker.current();
  // Once today's puzzle is published there is no need to fetch upstream again.
  // Future manual grids are also respected. Word corrections remain an admin action.
  if (snapshot.current.date >= local.date) {
    if (snapshot.current.date === local.date) await notify('published', { date: local.date, puzzle: snapshot.current.puzzle, words: snapshot.current.totalWords, score: snapshot.current.totalScore });
    return { outcome: 'already-current', puzzle: snapshot.current.puzzle };
  }
  await notify('watching', { date: local.date });
  const result = await worker.check();
  if (result.outcome === 'published') {
    const updated = await worker.current();
    await notify('published', { date: updated.current.date, puzzle: updated.current.puzzle, words: updated.current.totalWords, score: updated.current.totalScore });
  }
  return result;
}

export async function finishFlipWindow({ now = new Date(), createService, notify = async () => {} }) {
  const local = centralTime(now);
  if (local.hour !== 1 || local.minute !== 0) return { outcome: 'outside-window' };
  const worker = await createService(), snapshot = await worker.current();
  if (snapshot.current.date >= local.date) {
    if (snapshot.current.date === local.date) await notify('published', { date: local.date, puzzle: snapshot.current.puzzle, words: snapshot.current.totalWords, score: snapshot.current.totalScore });
    return { outcome: 'already-current', puzzle: snapshot.current.puzzle };
  }
  await notify('timeout', { date: local.date, puzzle: snapshot.current.puzzle, puzzleDate: snapshot.current.date, message: snapshot.monitor?.message });
  return { outcome: 'manual-check-needed', puzzle: snapshot.current.puzzle };
}
