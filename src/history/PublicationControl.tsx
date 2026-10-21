import { useEffect, useState } from 'react';

type Launch = { scheduledAt: string; puzzleCheckAt: string; state: string; triggeredAt?: string };
const centralTime = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const sydneyTime = (iso: string) => new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
type Publication = { launch?: Launch; enabled: boolean; liveEnabled: boolean | null; operationId: string; phase: string; message: string };

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
    if (!status || (!['deploying', 'unverified'].includes(status.phase) && status.launch?.state !== 'scheduled')) return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [status?.phase, status?.launch?.state]);
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
  async function launchAction(action: 'schedule-launch' | 'cancel-launch') {
    setBusy(true); setError('');
    try {
      const response = await fetch('/history-api/publication', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the launch schedule.');
      await refresh();
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not save the launch schedule.'); }
    finally { setBusy(false); }
  }
  return <section className="publication-control"><h2>Public clues page</h2>
    <p>Controls what everyone sees at <a href="https://r46.me/babbleclues" target="_blank" rel="noreferrer">r46.me/babbleclues</a>.</p>
    <p role="status" aria-live="polite"><b>{busy ? 'Saving…' : status?.phase === 'deploying' ? 'Deploying…' : status?.phase === 'live' ? 'Live' : 'Status'}</b>: {status?.message || 'Loading publication status…'}</p>
    {status && <>
      <p>Currently live: <b>{status.liveEnabled === null ? 'not verified' : status.liveEnabled ? 'new clues tool' : 'legacy clues page'}</b></p>
      <label><input type="checkbox" role="switch" checked={status.enabled} disabled={!adminKey || busy || status.phase === 'deploying' || status.launch?.state === 'scheduled'} onChange={event => void change(event.target.checked)} /> Use new clues at r46.me/babbleclues</label>
      {['failed', 'delayed', 'unverified'].includes(status.phase) && <button disabled={!adminKey || busy} onClick={() => void change(status.enabled)}>Retry deployment</button>}
    </>}
    {status?.launch && <div className="review">
      <h3>New clues — one-time GO LIVE</h3>
      <p><b>{centralTime(status.launch.scheduledAt)}</b><br />{sydneyTime(status.launch.scheduledAt)} (Sydney)</p>
      <p>Launch status: <b>{({ 'not-scheduled': 'Not scheduled', scheduled: 'Scheduled — automatic switch is armed', triggered: 'Triggered — one-time switch has been consumed', cancelled: 'Cancelled', missed: 'Missed — check deployment and switch manually' } as Record<string, string>)[status.launch.state] || status.launch.state}</b></p>
      {status.launch.triggeredAt && <p>Switch triggered: {centralTime(status.launch.triggeredAt)}</p>}
      <p>First new puzzle check: <b>{centralTime(status.launch.puzzleCheckAt)}</b>. Clues appear after the grid is confirmed and validated; retries run automatically.</p>
      <p>The original page stays live until midnight. At the GO LIVE time, the automatic switch starts deployment, which takes a few minutes. This launch runs once, even if Admin is closed, and does not repeat on following days.</p>
      {status.launch.state === 'not-scheduled' && Date.now() < Date.parse(status.launch.scheduledAt) && <button disabled={!adminKey || busy || status.enabled} onClick={() => void launchAction('schedule-launch')}>Schedule this one-time launch</button>}
      {status.launch.state === 'scheduled' && <button disabled={!adminKey || busy} onClick={() => void launchAction('cancel-launch')}>Cancel scheduled launch</button>}
    </div>}
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => void refresh()}>Reload publication status</button>
    <p>Saving starts deployment automatically. The pending launch locks the manual switch until it is cancelled. Before switching on manually, stop the old solver’s publishing. Switching off restores the last legacy page; restart the old solver to resume its daily updates.</p>
    <p><a href="https://r46.me/new-babbleclues" target="_blank" rel="noreferrer">Test the new tool on r46.me</a> · <a href="https://r46.me/legacy-babbleclues" target="_blank" rel="noreferrer">View the preserved legacy page</a></p>
  </section>;
}
