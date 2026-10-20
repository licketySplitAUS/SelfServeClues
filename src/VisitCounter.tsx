import { useEffect, useState } from 'react';
import InceptionDate from './InceptionDate';

// One request per loaded document, including React's development StrictMode
// remount. A real browser refresh creates a new visit ID and increments again.
let countedVisit: Promise<number> | undefined;
function recordVisit() {
  return countedVisit ||= (async () => {
    const visitId = crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch('/api/page-counter', { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitId }) });
        if (!response.ok) throw new Error('Counter unavailable');
        const data = await response.json();
        if (!Number.isSafeInteger(data.count) || data.count < 0) throw new Error('Invalid counter');
        return data.count as number;
      } catch { if (attempt === 1) throw new Error('Counter unavailable'); }
    }
    throw new Error('Counter unavailable');
  })();
}

export default function VisitCounter() {
  const [count, setCount] = useState<number | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    recordVisit().then(value => { if (active) setCount(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  const groups = count === null ? [] : new Intl.NumberFormat('en-US').format(count).split(',');
  return <div className="visit-counter">
    <p className="counter-caption">Page views</p>
    {count === null ? <p className="counter-status" role="status">{failed ? 'Counter temporarily unavailable' : 'Loading visits…'}</p> :
      <output className="odometer" aria-label={`${count.toLocaleString('en-AU')} page views`}>
        {groups.map((group, index) => <span className="odometer-group" key={index} aria-hidden="true">
          {group.split('').map((digit, position) => <span className="odometer-digit" key={position}>{digit}</span>)}
        </span>)}
      </output>}
    <InceptionDate />
  </div>;
}
