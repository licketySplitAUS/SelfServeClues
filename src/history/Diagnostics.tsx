import { useEffect, useState } from 'react';
import type { Snapshot } from './types';
type Official = Record<string, string>;
export default function Diagnostics({ snapshot, onSelect }: { snapshot: Snapshot; onSelect: (word: string) => void }) {
  const storageKey = `babble-history-official-${snapshot.current.puzzle}`;
  const [official, setOfficial] = useState<Official>(() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } });
  const [length, setLength] = useState(''), [start, setStart] = useState('');
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(official)); } catch { /* Optional local notes. */ } }, [storageKey, official]);
  const set = (key: string, value: string) => setOfficial(previous => ({ ...previous, [key]: value }));
  const diff = (key: string, actual: number) => official[key]?.trim() ? actual - Number(official[key]) : null;
  const delta = (value: number | null) => value === null ? '—' : value === 0 ? 'Matches' : value > 0 ? `${value} extra` : `${-value} missing`;
  const row = (key: string, label: string, actual: number) => <tr key={key} className={diff(key, actual) ? 'difference' : ''}><td>{label}</td><td>{actual}</td><td><input aria-label={`PlayBabble ${label}`} type="number" min="0" value={official[key] || ''} onChange={event => set(key, event.target.value)} /></td><td>{delta(diff(key, actual))}</td></tr>;
  const lengths = [...new Set([4, 5, 6, 7, 8, 9, ...snapshot.current.words.map(word => word.word.length)])].sort((a, b) => a - b);
  const words = snapshot.current.words.filter(row => (!length || row.word.length === Number(length)) && row.word.startsWith(start.toLowerCase()));
  return <section className="diagnostics"><h3>Manual PlayBabble comparison</h3>
    <p>Keep your normal PlayBabble login in another tab. Enter the statistics you see there for <b>puzzle #{snapshot.current.puzzle}, {snapshot.current.date}</b>. Blank fields mean unknown; enter 0 for a known zero. These comparison notes stay in this browser for this puzzle.</p>
    <table><thead><tr><th>Statistic</th><th>Our clues</th><th>PlayBabble</th><th>Difference</th></tr></thead><tbody>{row('total', 'total words', snapshot.current.totalWords)}{row('points', 'total points', snapshot.current.totalScore)}</tbody></table>
    <details open><summary>Counts by word length</summary><table><thead><tr><th>Length</th><th>Our clues</th><th>PlayBabble</th><th>Difference</th></tr></thead><tbody>{lengths.map(value => row(`length-${value}`, `${value} letters`, snapshot.today.counts[value]?.count || 0))}</tbody></table></details>
    <details><summary>Counts by starting letter</summary><p>Enter the combined count for each starting letter. Counts for one particular board tile may differ when that letter appears more than once.</p><table><thead><tr><th>Letter</th><th>Our clues</th><th>PlayBabble</th><th>Difference</th></tr></thead><tbody>{'abcdefghijklmnopqrstuvwxyz'.split('').map(value => row(`start-${value}`, value, snapshot.today.starts[value]?.count || 0))}</tbody></table></details>
    <h4>Narrow down candidate words (contains spoilers)</h4><label>Word length<select value={length} onChange={event => setLength(event.target.value)}><option value="">All lengths</option>{lengths.map(value => <option key={value} value={value}>{value} letters</option>)}</select></label><label>Beginning with<input value={start} maxLength={2} onChange={event => setStart(event.target.value.replace(/[^a-z]/gi, '').toLowerCase())} /></label>
    <p>{words.length} candidate words. “Review” fills the correction form; it does not remove anything.</p><details><summary>Show candidate words</summary><table><thead><tr><th>Word</th><th>Length</th><th>Points</th><th /></tr></thead><tbody>{words.map(row => <tr key={row.word}><td>{row.word}</td><td>{row.word.length}</td><td>{row.score}</td><td><button type="button" onClick={() => onSelect(row.word)}>Review {row.word}</button></td></tr>)}</tbody></table></details>
    <button type="button" onClick={() => setOfficial({})}>Clear comparison notes</button>
  </section>;
}
