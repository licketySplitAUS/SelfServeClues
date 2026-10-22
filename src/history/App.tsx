import { useEffect, useRef, useState } from 'react';
import SelfServe from '../App';
import type { Snapshot } from './types';
import Statistics from './Statistics';
import LoadingClues from '../LoadingClues';
import { watchClueUpdates } from '../../shared/live-clues.mjs';
import { loadCluesSnapshot } from '../../shared/clues-snapshot.mjs';
export default function HistoryApp() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [updateNotice, setUpdateNotice] = useState('');
  const [fallbackNotice, setFallbackNotice] = useState('');
  const current = useRef<Snapshot | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(false);
  async function load(automatic = false, generation?: string | null) {
    if (inFlight.current) return inFlight.current;
    const task = (async () => {
      try {
        // All visitors requesting a given generation share its cached snapshot.
        let storage: Storage | undefined;
        try { storage = window.localStorage; } catch { /* Browser storage can be unavailable. */ }
        const { snapshot: next, notice } = await loadCluesSnapshot({ storage, generation, allowFallback: !current.current, signal: AbortSignal.timeout(15000) });
        if (!mounted.current) return;
        setFallbackNotice(notice);
        const previous = current.current;
        // An unchanged or temporarily cached response must not reset entries.
        if (automatic && (next.generation || null) === (previous?.generation || null)) return;
        current.current = next; setSnapshot(next); setError('');
        if (automatic && previous) setUpdateNotice(previous.current.puzzle === next.current.puzzle
          ? 'The clues have updated automatically. Your matching entered words have been kept.'
          : 'New puzzle loaded automatically. Your previous puzzle entries remain saved.');
      } catch (problem) {
        if (mounted.current && !automatic) setError(problem instanceof Error ? problem.message : 'Could not load saved clues.');
      }
    })();
    inFlight.current = task;
    try { await task; } finally { if (inFlight.current === task) inFlight.current = null; }
  }
  useEffect(() => {
    mounted.current = true; void load();
    const printing = new URLSearchParams(window.location.search).get('print') === '1';
    const stop = printing ? () => {} : watchClueUpdates({ win: window, doc: document,
      currentGeneration: () => current.current?.generation || null,
      onChange: async generation => { await load(true, generation); },
    });
    return () => { mounted.current = false; stop(); };
  }, []);
  if (!snapshot) return <LoadingClues error={error} onRetry={() => { setError(''); void load(); }} />;
  return <SelfServe key={snapshot.current.puzzle + ':' + snapshot.current.letters} publishedPuzzle={snapshot.current} dictionaryCount={snapshot.history.dictionaryCount} onRefresh={() => load()}
    pageNotice={fallbackNotice ? <p role="alert" className="saved-clues-warning">{fallbackNotice}</p> : undefined}
    statistics={<Statistics snapshot={snapshot} stats={snapshot.history} />}
    sidebarExtra={<>{updateNotice && <p role="status" aria-live="polite">{updateNotice}</p>}{error && <p role="alert">{error}</p>}</>} />;
}
