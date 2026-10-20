import './loading.css';

export default function LoadingClues({ error = '', onRetry }: { error?: string; onRetry?: () => void }) {
  return <main className="clues-loading" aria-busy={!error}>
    <div className="loading-tiles" aria-hidden="true">{'CLUES'.split('').map((letter, index) => <span key={index} style={{ animationDelay: `${index * 120}ms` }}>{letter}</span>)}</div>
    <h1>Lickety’s clues</h1><p role={error ? 'alert' : 'status'}>{error || 'Getting your clues ready…'}</p>
    {error ? <button onClick={onRetry}>Try again</button> : <><div className="loading-track" aria-hidden="true"><span /></div><p className="loading-caption">A little wordplay is on its way</p></>}
  </main>;
}
