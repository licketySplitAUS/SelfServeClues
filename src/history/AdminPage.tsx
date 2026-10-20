import { useEffect, useState } from 'react';
import type { Audit, Snapshot } from './types';
import Admin from './Admin';
import ValidationComparison from './ValidationComparison';
import InceptionDate from '../InceptionDate';
export default function AdminPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [audit, setAudit] = useState<Audit | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(false), [refreshMessage, setRefreshMessage] = useState('');
  const start = snapshot?.startMinute ?? 0;
  const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  async function load(manual = false) {
    setLoading(true); setError('');
    if (manual) setRefreshMessage('Reloading saved status…');
    try {
      let response = await fetch(`/history-api/current${manual ? `?refresh=${Date.now()}` : ''}`, { cache: 'no-store' });
      let importedFallback = false;
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        if (manual) throw new Error('Could not reload saved status. The previously displayed result has been kept. Please try again.');
        response = await fetch('/history-preview-data/snapshot.json');
        importedFallback = true;
      }
      if (!response.ok) throw new Error('Could not load the saved snapshot.');
      const next: Snapshot = await response.json();
      const unchanged = snapshot && next.updatedAt === snapshot.updatedAt && JSON.stringify(next.monitor) === JSON.stringify(snapshot.monitor) && next.schedulingEnabled === snapshot.schedulingEnabled && next.startMinute === snapshot.startMinute;
      setSnapshot(next);
      if (importedFallback) setRefreshMessage('Showing the imported snapshot because the saved status is unavailable.');
      else if (manual) setRefreshMessage(`Saved status reloaded at ${new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney' })} (Sydney). ${unchanged ? 'No changes since the previous display.' : 'The display is up to date.'}`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not load status.'); setRefreshMessage(''); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); void fetch('/history-preview-data/audit.json').then(response => response.json()).then(setAudit).catch(() => {}); }, []);
  return <main className="admin-page" id="top"><a href="/history-preview.html">← Back to clues preview</a><h1>Clues admin &amp; exceptions</h1>
    <p>Bookmark this page, or click <b>Support</b> five times quickly on the clues preview. These controls manage the experiment; the original clues and live Self Serve data are separate.</p>
    {error && <p role="alert">{error}</p>}
    {snapshot && <>
      <h2>Current status</h2><div className={snapshot.monitor?.candidate || snapshot.monitor?.message && !snapshot.monitor.message.includes('published') && !snapshot.monitor.message.includes('still serves') ? 'review' : 'ok'}>
        <p><b>Puzzle #{snapshot.current.puzzle} — {snapshot.current.date}</b><br />{snapshot.current.totalWords} words · {snapshot.current.totalScore} points</p>
        <p>Automatic checks: <b>{snapshot.schedulingEnabled ? 'enabled' : 'disabled during preview testing'}</b><br />Last upstream check: {snapshot.monitor?.lastCheck ? new Date(snapshot.monitor.lastCheck).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) + ' (Sydney)' : 'No check recorded'}</p>
        <p>{snapshot.monitor?.message || snapshot.status}</p>
        {snapshot.monitor?.candidate && <p><b>Waiting for review:</b> puzzle #{snapshot.monitor.candidate.puzzle}, {snapshot.monitor.candidate.date}. Check its number, date and grid against PlayBabble before accepting.</p>}
      </div><button disabled={loading} onClick={() => void load(true)}>{loading ? 'Reloading…' : 'Reload saved status'}</button>
      <p role="status" aria-live="polite">{refreshMessage}</p>
      <ValidationComparison snapshot={snapshot} />
      <p>This reloads the saved result. To look for a new grid, enter your admin key below and choose <a href="#administration-controls">Check PlayBabble now</a>.</p>
      <p>Automatic schedule (US Central): every minute from {time(start)}–{time(start + 9)}, every five minutes from {time(start + 10)}–{time(start + 29)}, then every ten minutes from {time(start + 30)}–{time(start + 59)}. Checks stop once today's puzzle is validated, or at {time(start + 60)} if it has not flipped. Daylight saving is handled automatically.</p>
      <p>The Netlify environment variable <code>HISTORY_PREVIEW_START_MINUTE</code> sets the minutes after midnight to begin (0–59). Change it in Project configuration → Environment variables, then redeploy to apply. The preview keeps the previous puzzle until a new one is published; a new grid still needs two observations.</p>
      <p>Discord receives a flip-watch update, a publication update with word/point totals, or a manual-check alert if the hour ends without the new grid. Individual retries do not send messages. The solver logs in to PlayBabble, compares fixed totals, tests suspect words and remembers explicit dictionary rejections. Unresolved discrepancies and connection failures are reported and retried. Public chat requires successful validation and NotifyBabblersOfClues=true.</p>
      <h2>What to do when something looks wrong</h2><ol>
        <li><b>Late grid or a failed check:</b> choose “Check PlayBabble now”. A repeat of the same grid leaves history unchanged. Automatic retries run for one hour from {time(start)} US Central, keeping the last good puzzle while waiting. After {time(start + 60)}, check manually if it still has not flipped.</li>
        <li><b>A new grid is waiting:</b> verify it on PlayBabble. A second observation after 20 seconds can publish it, or choose “Check and accept current upstream grid” after checking it yourself. This does not skip identity validation.</li>
        <li><b>One rejected or missing word:</b> verify the word on PlayBabble, enter it in Word correction, choose Exclude or Include, give a reason, then apply. The puzzle and statistics rebuild automatically; future puzzles remember the correction.</li>
        <li><b>Find the extra word using stats:</b> check the saved PlayBabble comparison above first. If automatic validation cannot complete, expand Advanced troubleshooting under Administration controls to enter counts manually and filter candidate words. Verify a word on PlayBabble before excluding it.</li>
        <li><b>Wrong grid or upstream broken:</b> use Manual grid with its official puzzle number, date, 25 tiles and a reason. Q represents one Qu tile.</li>
        <li><b>Undo a mistake:</b> Restore imported dictionary decision undoes a word override. Restore previous preview returns to the prior saved data generation. Download a backup after corrections and before a new preview deployment.</li>
      </ol>
      <p>Corrections change the current puzzle and future puzzles. Earlier completed puzzles retain their recorded results.</p>
      {snapshot.comparison && <section><h2>Last puzzle changes</h2><p>Previously {snapshot.comparison.previousWords} words / {snapshot.comparison.previousScore} points.</p><p>Added: {snapshot.comparison.added.join(', ') || 'none'}<br />Removed: {snapshot.comparison.removed.join(', ') || 'none'}</p></section>}
      <Admin snapshot={snapshot} onSnapshot={next => { setSnapshot(previous => ({ ...next, schedulingEnabled: previous?.schedulingEnabled, startMinute: previous?.startMinute })); setRefreshMessage('Saved status updated from the admin action.'); }} />
      <h2>Saved dictionary corrections</h2>{Object.entries(snapshot.corrections || {}).length ? <table><thead><tr><th>Word</th><th>Decision</th><th>Reason</th></tr></thead><tbody>{Object.entries(snapshot.corrections || {}).map(([word, row]) => <tr key={word}><td>{word}</td><td>{row.action}</td><td>{row.reason}</td></tr>)}</tbody></table> : <p>No new corrections. The imported rejected-word list still applies.</p>}
      <details><summary>Current solution (contains spoilers)</summary><pre>{snapshot.current.words.map(row => `${row.word}\t${row.score}`).join('\n')}</pre></details>
    </>}
    {audit && <details><summary>Historical import exceptions</summary><p>These are problems found in the old database, separate from today's puzzle. They have been preserved for review.</p><p>{audit.duplicatePuzzles.length} extra puzzle records; {audit.missingPuzzles.length} missing puzzle numbers; {audit.invalidGrids.length} malformed grids; {audit.mismatchedTotals.length} stored-total mismatches.</p><p>The preview uses one record per puzzle (highest GameID). Duplicates and gaps need review before replacing the original page.</p><a href="/history-preview-data/audit.json" target="_blank" rel="noreferrer">Download the full exception report</a></details>}
    <InceptionDate />
  </main>;
}
