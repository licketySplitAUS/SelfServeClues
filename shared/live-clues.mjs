// Share one small, cacheable request per visible page every two minutes.
// A focus/online event checks sooner, with a thirty-second burst guard.
export function watchClueUpdates({ win, doc, currentGeneration, onChange, fetchImpl = win.fetch.bind(win), now = Date.now, intervalMs = 120000 }) {
  let stopped = false, busy = false, lastAttempt = now();
  const abort = new AbortController();
  async function check() {
    if (stopped || busy || doc.visibilityState === 'hidden' || win.navigator.onLine === false || now() - lastAttempt < 30000) return;
    busy = true; lastAttempt = now();
    try {
      const signal = typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]) : abort.signal;
      // A newly loaded generation gets a fresh shared cache key, so a stale
      // marker from the previous generation cannot send this page backwards.
      const query = '?known=' + encodeURIComponent(currentGeneration() || 'import');
      const response = await fetchImpl('/history-api/version' + query, { signal });
      if (!response.ok || stopped) return;
      const data = await response.json();
      if (stopped || !Object.hasOwn(data, 'generation') || (data.generation !== null && typeof data.generation !== 'string')) return;
      if (data.generation !== currentGeneration()) await onChange(data.generation);
    } catch { /* Keep the last good clues; the next check retries. */ }
    finally { busy = false; }
  }
  const timer = win.setInterval(check, intervalMs);
  doc.addEventListener('visibilitychange', check);
  win.addEventListener('focus', check); win.addEventListener('online', check);
  return () => {
    stopped = true; abort.abort(); win.clearInterval(timer);
    doc.removeEventListener('visibilitychange', check);
    win.removeEventListener('focus', check); win.removeEventListener('online', check);
  };
}
export function reconcileFound(saved, words) {
  if (!Array.isArray(saved)) return [];
  const allowed = new Set(words.map(word => word.toUpperCase()));
  return [...new Set(saved.filter(word => typeof word === 'string').map(word => word.toUpperCase()).filter(word => allowed.has(word)))];
}
