import { useEffect, useRef, useState } from 'react';
import SelfServe from '../App';
import type { Snapshot } from './types';
import Statistics from './Statistics';
import LoadingClues from '../LoadingClues';
import { watchClueUpdates } from '../../shared/live-clues.mjs';
export default function HistoryApp() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [updateNotice, setUpdateNotice] = useState('');
  const current = useRef<Snapshot | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(false);
  async function load(automatic = false, generation?: string | null) {
    if (inFlight.current) return inFlight.current;
    const task = (async () => {
      try {
        // All visitors requesting a given generation share its cached snapshot.
        const query = generation !== undefined ? '?generation=' + encodeURIComponent(generation || 'import') : '';
        let response = await fetch('/history-api/current' + query, { cache: generation !== undefined ? 'default' : 'no-store', signal: AbortSignal.timeout?.(15000) });
        if ((!response.ok || !response.headers.get('content-type')?.includes('application/json')) && !automatic) response = await fetch('/history-preview-data/snapshot.json');
        if (!response.ok) throw new Error('Could not load saved clues.');
        const next: Snapshot = await response.json();
        if (!next.current?.letters || !Array.isArray(next.current.words)) throw new Error('Invalid clues snapshot.');
        if (!mounted.current) return;
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
    statistics={<Statistics snapshot={snapshot} stats={snapshot.history} />}
    sidebarExtra={<>{updateNotice && <p role="status" aria-live="polite">{updateNotice}</p>}{error && <p role="alert">{error}</p>}</>} />;
}
