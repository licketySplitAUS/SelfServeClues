import { useEffect, useState } from 'react';

type Publication = { enabled: boolean; liveEnabled: boolean | null; operationId: string; phase: string; message: string };

export default function PublicationControl({ adminKey }: { adminKey: string }) {
  const [status, setStatus] = useState<Publication | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const response = await fetch('/history-api/publication', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load publication status.');
      setStatus(await response.json()); setError('');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not load publication status.'); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (!status || !['deploying', 'unverified'].includes(status.phase)) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [status?.phase]);
  async function change(enabled: boolean) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/history-api/publication', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify({ enabled }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not change publication mode.');
      setStatus(previous => ({ ...data, liveEnabled: previous?.liveEnabled ?? null }));
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not change publication mode.'); }
    finally { setBusy(false); }
  }
  return <section className="publication-control"><h2>Public clues page</h2>
    <p>Controls what everyone sees at <a href="https://r46.me/babbleclues" target="_blank" rel="noreferrer">r46.me/babbleclues</a>.</p>
    <p role="status" aria-live="polite"><b>{busy ? 'Saving…' : status?.phase === 'deploying' ? 'Deploying…' : status?.phase === 'live' ? 'Live' : 'Status'}</b>: {status?.message || 'Loading publication status…'}</p>
    {status && <>
      <p>Currently live: <b>{status.liveEnabled === null ? 'not verified' : status.liveEnabled ? 'new clues tool' : 'legacy clues page'}</b></p>
      <label><input type="checkbox" role="switch" checked={status.enabled} disabled={!adminKey || busy || status.phase === 'deploying'} onChange={event => void change(event.target.checked)} /> Use new clues at r46.me/babbleclues</label>
      {['failed', 'delayed', 'unverified'].includes(status.phase) && <button disabled={!adminKey || busy} onClick={() => void change(status.enabled)}>Retry deployment</button>}
    </>}
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => void refresh()}>Reload publication status</button>
    <p>Saving starts deployment automatically. Before switching on, stop the old solver’s publishing. Switching off restores the last legacy page; restart the old solver to resume its daily updates.</p>
    <p><a href="https://r46.me/new-babbleclues" target="_blank" rel="noreferrer">Test the new tool on r46.me</a> · <a href="https://r46.me/legacy-babbleclues" target="_blank" rel="noreferrer">View the preserved legacy page</a></p>
  </section>;
}
