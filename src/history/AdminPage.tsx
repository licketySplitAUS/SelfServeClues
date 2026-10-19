import { useEffect, useState } from 'react';
import type { Audit, Snapshot } from './types';
import Admin from './Admin';
export default function AdminPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [audit, setAudit] = useState<Audit | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(false), [refreshMessage, setRefreshMessage] = useState('');
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
      const unchanged = snapshot && next.updatedAt === snapshot.updatedAt && JSON.stringify(next.monitor) === JSON.stringify(snapshot.monitor) && next.schedulingEnabled === snapshot.schedulingEnabled;
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
      <p>This reloads the saved result. To look for a new grid, enter your admin key below and choose <a href="#administration-controls">Check PlayBabble now</a>.</p>
      <h2>What to do when something looks wrong</h2><ol>
        <li><b>Late grid or a failed check:</b> choose “Check PlayBabble now”. A repeat of the same grid leaves history unchanged. Once scheduling is enabled, it retries every five minutes and keeps the last good puzzle while waiting.</li>
        <li><b>A new grid is waiting:</b> verify it on PlayBabble. A second observation after 20 seconds can publish it, or choose “Check and accept current upstream grid” after checking it yourself. This does not skip identity validation.</li>
        <li><b>One rejected or missing word:</b> verify the word on PlayBabble, enter it in Word correction, choose Exclude or Include, give a reason, then apply. The puzzle and statistics rebuild automatically; future puzzles remember the correction.</li>
        <li><b>Find the extra word using stats:</b> log in to PlayBabble in your usual browser and look at its statistics. Under Compare PlayBabble stats below, enter its total, word-length counts and starting-letter counts. The differences show where to look. Filter the candidate list by length and starting letter, then select a word to fill Word correction. Verify the word before excluding it. A count difference alone cannot identify which word is wrong.</li>
        <li><b>Wrong grid or upstream broken:</b> use Manual grid with its official puzzle number, date, 25 tiles and a reason. Q represents one Qu tile.</li>
        <li><b>Undo a mistake:</b> Restore imported dictionary decision undoes a word override. Restore previous preview returns to the prior saved data generation. Download a backup after corrections and before a new preview deployment.</li>
      </ol>
      <p>Corrections change the current puzzle and future puzzles. Earlier completed puzzles retain their recorded results.</p>
      {snapshot.comparison && <section><h2>Last puzzle changes</h2><p>Previously {snapshot.comparison.previousWords} words / {snapshot.comparison.previousScore} points.</p><p>Added: {snapshot.comparison.added.join(', ') || 'none'}<br />Removed: {snapshot.comparison.removed.join(', ') || 'none'}</p></section>}
      <Admin snapshot={snapshot} onSnapshot={next => { setSnapshot(previous => ({ ...next, schedulingEnabled: previous?.schedulingEnabled })); setRefreshMessage('Saved status updated from the admin action.'); }} />
      <h2>Saved dictionary corrections</h2>{Object.entries(snapshot.corrections || {}).length ? <table><thead><tr><th>Word</th><th>Decision</th><th>Reason</th></tr></thead><tbody>{Object.entries(snapshot.corrections || {}).map(([word, row]) => <tr key={word}><td>{word}</td><td>{row.action}</td><td>{row.reason}</td></tr>)}</tbody></table> : <p>No new corrections. The imported rejected-word list still applies.</p>}
      <details><summary>Current solution (contains spoilers)</summary><pre>{snapshot.current.words.map(row => `${row.word}\t${row.score}`).join('\n')}</pre></details>
    </>}
    {audit && <details><summary>Historical import exceptions</summary><p>These are problems found in the old database, separate from today's puzzle. They have been preserved for review.</p><p>{audit.duplicatePuzzles.length} extra puzzle records; {audit.missingPuzzles.length} missing puzzle numbers; {audit.invalidGrids.length} malformed grids; {audit.mismatchedTotals.length} stored-total mismatches.</p><p>The preview uses one record per puzzle (highest GameID). Duplicates and gaps need review before replacing the original page.</p><a href="/history-preview-data/audit.json" target="_blank" rel="noreferrer">Download the full exception report</a></details>}
  </main>;
}
