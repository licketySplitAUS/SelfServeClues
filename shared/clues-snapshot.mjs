const key = 'lickety_last_published_snapshot_v1';
export function validSnapshot(value) {
  const game = value?.current, stats = value?.history;
  return !!game && Number.isInteger(game.puzzle) && game.puzzle > 0 && /^[A-Z]{25}$/.test(game.letters || '')
    && /^\d{4}-\d\d-\d\d$/.test(game.date || '') && Array.isArray(game.words) && game.words.length > 0
    && game.words.every(word => typeof word?.word === 'string' && /^[a-z]{4,25}$/i.test(word.word) && Number.isFinite(word.score))
    && !!stats && ['recent', 'frequent', 'longest', 'highest', 'commonLetters', 'rareLetters', 'appearancesByLength', 'dictionaryCoverage'].every(name => Array.isArray(stats[name]))
    && !!value.today?.counts && !!value.today?.prefixes && !!value.today?.starts;
}
export async function loadCluesSnapshot({ fetchImpl = fetch, storage, generation, allowFallback = true, signal }) {
  try {
    const query = generation !== undefined ? '?generation=' + encodeURIComponent(generation || 'import') : '';
    const response = await fetchImpl('/history-api/current' + query, { cache: generation !== undefined ? 'default' : 'no-store', signal });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw Error('Live clues unavailable.');
    const snapshot = await response.json();
    if (!validSnapshot(snapshot)) throw Error('Invalid live clues.');
    try { const json = JSON.stringify(snapshot); if (json.length <= 2_000_000) storage?.setItem(key, json); } catch { /* Optional cache. */ }
    return { snapshot, notice: '' };
  } catch (error) {
    if (!allowFallback) throw error;
    try {
      const raw = storage?.getItem(key);
      if (raw && raw.length <= 2_000_000) {
        const snapshot = JSON.parse(raw);
        if (validSnapshot(snapshot)) return { snapshot, notice: `Live clues could not be reached. Showing saved clues for ${snapshot.current.date}, puzzle #${snapshot.current.puzzle}. Check the date before playing; refresh to retry.` };
      }
    } catch { /* Try the bundled fallback. */ }
    const response = await fetchImpl('/history-preview-data/snapshot.json', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Could not load saved clues. Check your connection and retry.');
    const snapshot = await response.json();
    if (!validSnapshot(snapshot)) throw Error('Saved clues are invalid. Please retry when online.');
    return { snapshot, notice: `Live clues could not be reached. This bundled puzzle is dated ${snapshot.current.date} (#${snapshot.current.puzzle}) and may be old. Check the date before playing; refresh to retry.` };
  }
}
