import { useState } from 'react';
import Diagnostics from './Diagnostics';
import PublicationControl from './PublicationControl';
import type { Snapshot } from './types';
export default function Admin({ onSnapshot, snapshot }: { onSnapshot: (snapshot: Snapshot) => void; snapshot?: Snapshot }) {
  const [key, setKey] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [word, setWord] = useState(''), [wordAction, setWordAction] = useState('exclude'), [reason, setReason] = useState('');
  const [puzzle, setPuzzle] = useState(''), [date, setDate] = useState(''), [letters, setLetters] = useState('');
  async function run(body: Record<string, unknown>, download = false) {
    setBusy(true); setMessage('Working…');
    try {
      const response = await fetch('/history-api/admin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: JSON.stringify(body) });
      if (download && response.ok) {
        const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
        link.href = url; link.download = 'babble-history-preview-backup.json.gz'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage('Backup downloaded. Keep it with the imported archive.'); return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Admin request failed');
      if (data.snapshot) onSnapshot(data.snapshot);
      setMessage(data.message || `${data.outcome}${data.words !== undefined ? `: ${data.words} words` : ''}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed'); }
    finally { setBusy(false); }
  }
  return <details className="admin" id="administration-controls" open><summary>Administration controls</summary>
    <p>The publication switch controls the public r46.me clues page. Puzzle administration below manages the saved clues and history. The key stays in this page’s memory.</p>
    <label>Preview admin key<input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label>
    <PublicationControl adminKey={key} />
    <fieldset disabled={busy || !key}>
      <button onClick={() => void run({ action: 'notify-test' })}>Send Discord flip test</button>
      <button onClick={() => void run({ action: 'notify-current' })}>Send current validation report to Discord</button>
      <div className="actions"><button onClick={() => void run({ action: 'check' })}>Check PlayBabble now</button><button onClick={() => void run({ action: 'check', accept: true })}>Check and accept current upstream grid</button><button onClick={() => void run({ action: 'rebuild' })}>Re-solve published preview grid</button></div>
      {snapshot && <details><summary>Advanced troubleshooting</summary>
        <p>Use this manual comparison if automatic validation cannot complete. Entered counts stay in this browser and do not change the saved automatic result.</p>
        <Diagnostics key={snapshot.current.puzzle} snapshot={snapshot} onSelect={value => { setWord(value); setWordAction('exclude'); document.getElementById('correction-word')?.focus(); }} />
      </details>}
      <h4>Word correction</h4>
      <label>Word<input id="correction-word" value={word} onChange={event => setWord(event.target.value)} /></label>
      <label>Action<select value={wordAction} onChange={event => setWordAction(event.target.value)}><option value="exclude">Exclude rejected word</option><option value="include">Include accepted word</option><option value="restore">Restore imported dictionary decision</option></select></label>
      <label>Reason<input value={reason} onChange={event => setReason(event.target.value)} /></label>
      <button disabled={!word.trim() || !reason.trim()} onClick={() => void run({ action: 'word', correction: { word, action: wordAction, reason } })}>Apply to preview and future puzzles</button>
      <h4>Manual grid for an exception</h4>
      <label>Puzzle number<input inputMode="numeric" value={puzzle} onChange={event => setPuzzle(event.target.value)} /></label>
      <label>Puzzle date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>25 letters, row by row (Q is one tile)<textarea value={letters} onChange={event => setLetters(event.target.value)} /></label>
      <p>The reason above is saved with a manual grid.</p>
      <button disabled={!puzzle || !date || !reason.trim()} onClick={() => void run({ action: 'manual', grid: { puzzle, date, letters, reason } })}>Publish manual preview grid</button>
      <hr /><div className="actions"><button onClick={() => void run({ action: 'rollback' })}>Restore previous preview</button><button onClick={() => void run({ action: 'export' }, true)}>Download preview backup</button></div>
    </fieldset>
    <p role="status">{message}</p>
  </details>;
}
