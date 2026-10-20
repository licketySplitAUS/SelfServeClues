import type { Snapshot } from './types';

export default function ValidationComparison({ snapshot }: { snapshot: Snapshot }) {
  const validation = snapshot.current.validation;
  const official = validation?.official;
  const excluded = validation?.excluded || validation?.rejected || [];
  const row = (label: string, ours: number, theirs: number | undefined) => {
    const difference = theirs === undefined ? null : ours - theirs;
    return <tr key={label} className={difference ? 'difference' : ''}>
      <th scope="row">{label}</th><td>{ours}</td><td>{theirs ?? 'Not available'}</td>
      <td>{difference === null ? '—' : difference === 0 ? 'Matches' : difference > 0 ? `${difference} extra` : `${-difference} missing`}</td>
    </tr>;
  };
  const headings = <thead><tr><th scope="col">Statistic</th><th scope="col">Our clues</th><th scope="col">PlayBabble</th><th scope="col">Difference</th></tr></thead>;
  const lengths = [...new Set([...Object.keys(snapshot.today.counts), ...Object.keys(official?.lengths || {})])]
    .map(Number).filter(length => snapshot.today.counts[length]?.count || official?.lengths[length]).sort((a, b) => a - b);
  return <section className="validation-comparison">
    <h2>PlayBabble comparison</h2>
    <p>{validation?.message || 'This puzzle has not been checked against PlayBabble yet.'}</p>
    {validation && <p>Last automatic validation: <b>{validation.status}</b> · {new Date(validation.checkedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} (Sydney). Tested {validation.tested} candidate words in this check.</p>}
    <p>Bad words automatically excluded: <b>{excluded.join(', ') || 'none'}</b>.</p>
    {official ? <>
      <p>Saved counts for puzzle #{snapshot.current.puzzle}, {snapshot.current.date}. Differences compare the current clues with Babble’s fixed totals.</p>
      <table>{headings}<tbody>{row('Total words', snapshot.current.totalWords, official.total)}
        {lengths.map(length => row(`${length} letters`, snapshot.today.counts[length]?.count || 0, official.lengths[length] ?? 0))}
      </tbody></table>
      {Object.keys(official.starts).length > 0 && <details><summary>Counts by starting letter</summary>
        <table>{headings}<tbody>{Object.keys(official.starts).sort().map(letter => row(letter.toUpperCase(), snapshot.today.starts[letter]?.count || 0, official.starts[letter]))}</tbody></table>
      </details>}
      {Object.keys(official.prefixes).length > 0 && <details><summary>Counts by two-letter prefix</summary>
        <table>{headings}<tbody>{Object.keys(official.prefixes).sort().map(prefix => row(prefix, snapshot.today.prefixes[prefix]?.count || 0, official.prefixes[prefix]))}</tbody></table>
      </details>}
    </> : <p>No official counts have been saved yet. They will appear here after an automatic check succeeds.</p>}
  </section>;
}
