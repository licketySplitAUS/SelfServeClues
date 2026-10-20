import type { ReactNode } from 'react';
import type { Snapshot, Stats, Word } from './types';
const n = (value: number) => String(value);
const date = (value: string, year = false) => new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', ...(year ? { year: 'numeric' as const } : {}) }).format(new Date(value + 'T12:00:00Z'));
const Section = ({ title, children }: { title: string; children: ReactNode }) => <section className="history-stat"><h3>{title}</h3>{children}<a className="back" href="#top">Back to top</a><div className="rule" /></section>;
const WordRows = ({ rows, frequency = false }: { rows: Word[]; frequency?: boolean }) => <table><tbody>{rows.map((row, i) => <tr key={`${row.word}-${i}`}><td>{row.word}</td><td>{frequency ? `${n(row.count || 0)} x` : `${row.word.length},`}</td><td>{frequency ? `${row.word.length} letters` : row.score}</td></tr>)}</tbody></table>;
export default function Statistics({ snapshot, stats }: { snapshot: Snapshot; stats: Stats }) {
  const total = `Last ${n(stats.gameCount)} grids`;
  const counts = (title: string, rows: Record<string, { count: number; score: number }>, className?: string) => <Section title={title}><table className={className}><tbody>{Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)).map(([key, row]) => <tr key={key}><td>{key.toLowerCase()}:</td><td>{row.count}</td><td>{row.score} pts</td></tr>)}</tbody></table></Section>;
  const game = (value: Stats['largest']) => value && <><table><tbody><tr><td>{value.totalWords} words</td><td>{value.totalScore}</td></tr></tbody></table><p className="record-date">{date(value.date, true)}</p></>;
  return <div className="history-statistics">
    {counts('First 2 Letter Counts', snapshot.today.prefixes)}
    {counts('Single Letter Counts', snapshot.today.starts, 'single-letter-counts')}
    <Section title="Last 13 Grid Sizes"><table><tbody>{stats.recent.map((row, i) => <tr key={`${row.gameId}-${i}`}><td>{row.totalWords} words</td><td>{row.totalScore}</td><td>{date(row.date)}</td></tr>)}</tbody></table></Section>
    <Section title={`Grid Stats for ${total}`}><p>Largest Word Count</p>{game(stats.largest)}<p>Smallest Word Count</p>{game(stats.smallest)}<p>Average Word Count</p><p className="stat-value">{stats.legacyAverageWords} words</p><p>Unique Word Count</p><p className="stat-value">{stats.uniqueWords} words</p></Section>
    <Section title={`Most frequent words by size (${total})`}><WordRows rows={stats.frequent} frequency /></Section>
    <Section title={`Longest Top 13 words (${total})`}><WordRows rows={stats.longest} /></Section>
    <Section title={`Highest Scoring Top 13 words (${total})`}><WordRows rows={stats.highest} /></Section>
    <Section title={`Top 3 Starting Letters used (${total})`}><table><tbody>{stats.commonLetters.map(row => <tr key={row.letter}><td>{row.letter}</td><td>{row.count}</td></tr>)}</tbody></table></Section>
    <Section title={`Top 3 Starting Letters Least Used (${total})`}><table><tbody>{stats.rareLetters.map(row => <tr key={row.letter}><td>{row.letter}</td><td>{row.count}</td></tr>)}</tbody></table></Section>
    <Section title={`Total Word Counts (${total})`}><table><tbody>{stats.appearancesByLength.map(row => <tr key={row.length}><td>{row.length} letters</td><td>{row.count}</td></tr>)}</tbody></table></Section>
    <Section title={`Total No of Words seen in last ${stats.gameCount} / searched`}><table><tbody>{[...stats.dictionaryCoverage, stats.over12].map(row => <tr key={row.length}><td>{row.length} letters</td><td>{row.seen}</td><td>{row.searched}</td></tr>)}<tr><td colSpan={2}><b>Total Words</b></td><td><b>{stats.dictionaryCount}</b></td></tr></tbody></table></Section>
  </div>;
}
