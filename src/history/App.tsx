import { useEffect, useState } from 'react';
import SelfServe from '../App';
import type { Snapshot } from './types';
import Statistics from './Statistics';
export default function HistoryApp() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  async function load() {
    try {
      let response = await fetch('/history-api/current', { cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) response = await fetch('/history-preview-data/snapshot.json');
      if (!response.ok) throw new Error('Could not load saved clues.');
      setSnapshot(await response.json()); setError('');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not load saved clues.'); }
  }
  useEffect(() => { void load(); }, []);
  if (!snapshot) return <main className="clues-loading" aria-busy={!error}>
    <div className="loading-tiles" aria-hidden="true">{'CLUES'.split('').map((letter, index) => <span key={index} style={{ animationDelay: `${index * 120}ms` }}>{letter}</span>)}</div>
    <h1>Lickety’s clues</h1><p role={error ? 'alert' : 'status'}>{error || 'Getting your clues ready…'}</p>
    {error ? <button onClick={() => { setError(''); void load(); }}>Try again</button> : <><div className="loading-track" aria-hidden="true"><span /></div><p className="loading-caption">A little wordplay is on its way</p></>}
  </main>;
  return <SelfServe publishedPuzzle={snapshot.current} dictionaryCount={snapshot.history.dictionaryCount} onRefresh={load}
    statistics={<Statistics snapshot={snapshot} stats={snapshot.history} />}
    sidebarExtra={error && <p role="alert">{error}</p>} />;
}
