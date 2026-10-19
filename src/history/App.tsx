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
  if (!snapshot) return <main className="page"><p role="status">{error || 'Loading clues…'}</p></main>;
  return <SelfServe publishedPuzzle={snapshot.current} dictionaryCount={snapshot.history.dictionaryCount} onRefresh={load}
    statistics={<Statistics snapshot={snapshot} stats={snapshot.history} />}
    sidebarExtra={<><h3>Clues Administration</h3><a href="/history-admin.html">Admin &amp; exceptions</a><p className="preview-note">History preview. Automatic updates are {snapshot.schedulingEnabled ? 'on' : 'off'}. The date above identifies the saved puzzle.</p>{error && <p role="alert">{error}</p>}</>} />;
}
