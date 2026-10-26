import { useEffect, useMemo, useRef, useState } from 'react';

type Cohort = 'regular' | 'test' | 'unattributed';
type Counts = Record<string, number>;
type Installation = { name: string; posts: number; latestVersion?: string; versionAt?: string; lastSeenAt?: string; sessions?: number; sessionSeconds?: number };
type Diagnostic = { count: number; incidents: number; meaning: string; kind: 'problem' | 'recovery' | 'test'; installations?: string[]; firstOccurredAt?: string; lastOccurredAt?: string; lastReceivedAt?: string };
type Group = { cohort: Cohort; posts: number; reports: number; sessionSeconds: number; measuredSessions: number; diagnosticIncidents: number;
  installations: Record<string, Installation>; browsers: string[]; events: Counts; days: Counts; hours: number[];
  versions: Counts; platforms: Counts; countries: Counts; features: Counts; errors: Record<string, Diagnostic> };
type Channel = { id: string; name: string };
type Connection = { bot: string; channels: (Channel & { readable: boolean; state: string; message: string })[] };
type Start = { range: { from: string; to: string; timeZone: string }; channels: Channel[]; testInstallations: { id: string; name: string; device: string }[]; generatedAt: string };
type Report = Start & { groups: Group[]; coverage: (Channel & { done: boolean; error: string; counts: Counts })[]; hiddenReports: number; pages: number; cachedPages: number; complete: boolean };
const sumCounts = (a: Counts, b: Counts) => {
  const result = { ...a };
  for (const [key, count] of Object.entries(b)) Object.defineProperty(result, key, { value: (Object.hasOwn(result, key) ? result[key] : 0) + count, enumerable: true, writable: true, configurable: true });
  return result;
};
const earlier = (a?: string, b?: string) => !a ? b : !b ? a : a < b ? a : b;
const later = (a?: string, b?: string) => !a ? b : !b ? a : a > b ? a : b;
function merge(a: Group, b: Group): Group {
  const installations = { ...a.installations }, errors = { ...a.errors };
  for (const [id, actor] of Object.entries(b.installations)) {
    const previous = installations[id];
    const latest = (previous?.versionAt || '') > (actor.versionAt || '') ? previous : actor;
    installations[id] = { ...latest, posts: (previous?.posts || 0) + actor.posts,
      sessions: (previous?.sessions || 0) + (actor.sessions || 0), sessionSeconds: (previous?.sessionSeconds || 0) + (actor.sessionSeconds || 0),
      lastSeenAt: later(previous?.lastSeenAt, actor.lastSeenAt) };
  }
  for (const [key, error] of Object.entries(b.errors)) Object.defineProperty(errors, key, { value: { ...error, count: (Object.hasOwn(errors, key) ? errors[key].count : 0) + error.count,
    incidents: (Object.hasOwn(errors, key) ? errors[key].incidents : 0) + error.incidents,
    installations: [...new Set([...(errors[key]?.installations || []), ...(error.installations || [])])],
    firstOccurredAt: earlier(errors[key]?.firstOccurredAt, error.firstOccurredAt), lastOccurredAt: later(errors[key]?.lastOccurredAt, error.lastOccurredAt),
    lastReceivedAt: later(errors[key]?.lastReceivedAt, error.lastReceivedAt) }, enumerable: true, configurable: true, writable: true });
  return { ...a, posts: a.posts + b.posts, reports: a.reports + b.reports, sessionSeconds: a.sessionSeconds + b.sessionSeconds,
    measuredSessions: a.measuredSessions + b.measuredSessions, diagnosticIncidents: a.diagnosticIncidents + b.diagnosticIncidents, installations,
    browsers: [...new Set([...a.browsers, ...b.browsers])], hours: a.hours.map((count, hour) => count + b.hours[hour]), errors,
    events: sumCounts(a.events, b.events), days: sumCounts(a.days, b.days), versions: sumCounts(a.versions, b.versions),
    platforms: sumCounts(a.platforms, b.platforms), countries: sumCounts(a.countries, b.countries), features: sumCounts(a.features, b.features) };
}
const empty = (): Group => ({ cohort: 'unattributed', posts: 0, reports: 0, sessionSeconds: 0, measuredSessions: 0, diagnosticIncidents: 0,
  installations: {}, browsers: [], events: {}, days: {}, hours: Array(24).fill(0), versions: {}, platforms: {}, countries: {}, features: {}, errors: {} });
const ranked = (counts: Counts) => Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const newestVersionFirst = (a: string, b: string) => {
  if (!/^\d/.test(a) || !/^\d/.test(b)) return /^\d/.test(a) ? -1 : /^\d/.test(b) ? 1 : a.localeCompare(b);
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) { const difference = (right[i] || 0) - (left[i] || 0); if (difference) return difference; }
  return a.localeCompare(b);
};
const n = (value: number) => value.toLocaleString('en-AU');
const duration = (seconds: number) => { const total = Math.round(seconds); return `${Math.floor(total / 3600)}h ${Math.floor(total % 3600 / 60)}m ${total % 60}s`; };
const date = (value: string) => new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' });
function CountsTable({ title, counts, versions = false, chronological = false, unit = 'Posts' }: { title: string; counts: Counts; versions?: boolean; chronological?: boolean; unit?: string }) {
  const rows = versions ? Object.entries(counts).sort((a, b) => newestVersionFirst(a[0], b[0])) : chronological ? Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])) : ranked(counts);
  return <section><h3>{title}</h3>{Object.keys(counts).length ? <table><thead><tr><th scope="col">{title}</th><th scope="col">{unit}</th></tr></thead>
    <tbody>{rows.map(([label, count]) => <tr key={label}><th scope="row">{label}</th><td>{n(count)}</td></tr>)}</tbody></table> : <p>No matching reports.</p>}</section>;
}
export default function DiscordActivity({ adminKey }: { adminKey: string }) {
  const [period, setPeriod] = useState('7'), [start, setStart] = useState(''), [end, setEnd] = useState('');
  const [audience, setAudience] = useState('exclude-tests'), [report, setReport] = useState<Report | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => { active.current?.abort(); active.current = null; setBusy(false); setReport(null); setConnection(null); setError(''); setStatus(''); return () => active.current?.abort(); }, [adminKey]);
  const selected = (cohort: string) => audience === 'all' || (audience === 'tests' ? cohort === 'test' : cohort !== 'test');
  const totals = useMemo(() => (report?.groups || []).filter(group => audience === 'all' || (audience === 'tests' ? group.cohort === 'test' : group.cohort !== 'test')).reduce(merge, empty()), [report, audience]);
  async function get(params: URLSearchParams, signal: AbortSignal) {
    const response = await fetch('/history-api/discord-stats?' + params, { headers: { 'x-admin-key': adminKey }, cache: 'no-store', signal });
    const data = await response.json();
    if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
    if (!response.ok) throw Object.assign(new Error(data.error || 'Statistics request failed.'), { retryAfter: Number(data.retryAfter || response.headers.get('retry-after')), channelError: data.channelError });
    return data;
  }
  async function run(check = false) {
    const controller = new AbortController(); active.current?.abort(); active.current = controller;
    const signal = controller.signal;
    setBusy(true); setError(''); setStatus(check ? 'Checking bot and channel access…' : 'Starting report…');
    try {
      if (check) { setConnection(await get(new URLSearchParams({ action: 'connection' }), signal)); setStatus('Connection check finished.'); return; }
      const settings: Start = await get(new URLSearchParams({ action: 'start', period, start, end }), signal);
      const current: Report = { ...settings, groups: [], coverage: settings.channels.map(channel => ({ ...channel, done: false, error: '', counts: {} })), hiddenReports: 0, pages: 0, cachedPages: 0, complete: false };
      setReport(structuredClone(current));
      for (const channel of current.coverage) {
        let before = '';
        while (!signal.aborted) {
          setStatus(`Reading #${channel.name} · ${n(current.pages)} history pages read…`);
          try {
            const page: { groups: Group[]; hiddenReports: number; done: boolean; nextBefore: string | null; cached: boolean } = await get(new URLSearchParams({ action: 'page', channel: channel.id, from: settings.range.from, to: settings.range.to, ...(before ? { before } : {}) }), signal);
            for (const group of page.groups) {
              const index = current.groups.findIndex(previous => previous.cohort === group.cohort);
              if (index < 0) current.groups.push(group); else current.groups[index] = merge(current.groups[index], group);
              channel.counts = sumCounts(channel.counts, { [group.cohort]: group.posts });
            }
            current.pages++; if (page.cached) current.cachedPages++; current.hiddenReports += page.hiddenReports;
            channel.done = page.done;
            setReport(structuredClone(current));
            if (page.done || !page.nextBefore) break;
            before = page.nextBefore;
          } catch (problem) {
            const failure = problem as Error & { retryAfter?: number; channelError?: boolean };
            if (signal.aborted) throw failure;
            if (failure.retryAfter && failure.retryAfter > 0) {
              setStatus(`Discord requested a pause of ${failure.retryAfter} seconds. The report will resume automatically.`);
              await new Promise<void>((resolve, reject) => {
                const stop = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
                const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, Math.min(failure.retryAfter!, 3600) * 1000);
                signal.addEventListener('abort', stop, { once: true });
              });
            } else if (failure.channelError) { channel.error = failure.message; setReport(structuredClone(current)); break; }
            else throw failure;
          }
        }
      }
      if (!signal.aborted) { current.complete = current.coverage.every(channel => channel.done); setReport(structuredClone(current));
        setStatus(current.complete ? 'Report complete.' : 'Report finished with unavailable channels. Counts cover the history read successfully.'); }
    } catch (problem) {
      if (active.current !== controller) return;
      if (signal.aborted) setStatus('Stopped. Results below cover only the pages already read.');
      else { setError(problem instanceof Error ? problem.message : 'Could not generate statistics.'); setStatus('Report interrupted. Any results below are partial.'); }
    } finally { if (active.current === controller) { setBusy(false); active.current = null; } }
  }
  const days = Object.entries(totals.days).sort((a, b) => a[0].localeCompare(b[0]));
  const maxDay = Math.max(1, ...days.map(([, count]) => count));
  const actors = Object.entries(totals.installations).sort((a, b) => b[1].posts - a[1].posts);
  const installationVersions: Counts = {};
  for (const [, actor] of actors) { const key = actor.latestVersion || 'No version reported'; installationVersions[key] = (installationVersions[key] || 0) + 1; }
  const diagnosticProblems = Object.values(totals.errors).filter(row => row.kind === 'problem');
  const diagnosticRecoveries = Object.values(totals.errors).filter(row => row.kind === 'recovery');
  const affectedInstallations = new Set(diagnosticProblems.flatMap(row => row.installations || []));
  const excludedPosts = (report?.groups || []).filter(row => !selected(row.cohort)).reduce((sum, row) => sum + row.posts, 0);
  return <section className="discord-activity publication-control"><h2>Discord activity</h2>
    <p>Read reporting history directly from Discord. Dates and hours use Sydney time. Your admin key is required.</p>
    <div className="discord-controls"><label>Period<select value={period} disabled={busy} onChange={event => setPeriod(event.target.value)}><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All available history</option><option value="custom">Custom dates</option></select></label>
      {period === 'custom' && <><label>From<input type="date" value={start} disabled={busy} onChange={event => setStart(event.target.value)} /></label><label>Through<input type="date" value={end} disabled={busy} onChange={event => setEnd(event.target.value)} /></label></>}
      <label>Activity<select value={audience} onChange={event => setAudience(event.target.value)}><option value="exclude-tests">Exclude test installs</option><option value="tests">Test installs only</option><option value="all">All activity</option></select></label></div>
    <div className="actions"><button disabled={!adminKey || busy} onClick={() => void run()}>Generate statistics</button><button disabled={!adminKey || busy} onClick={() => void run(true)}>Check bot connection</button>{busy && <button onClick={() => active.current?.abort()}>Stop</button>}</div>
    <p role="status" aria-live="polite">{!adminKey ? 'Enter your admin key above to begin.' : status}</p>{error && <p role="alert">{error}</p>}
    {connection && <details open><summary>Bot connection: {connection.bot}</summary><table><thead><tr><th>Channel</th><th>Access</th></tr></thead><tbody>{connection.channels.map(channel => <tr key={channel.id}><th scope="row">#{channel.name}</th><td>{channel.message}</td></tr>)}</tbody></table></details>}
    {report && <>
      <p><b>{report.complete ? 'Complete history for this period' : 'Partial report'}</b><br />{date(report.range.from)} – {date(report.range.to)} (Sydney)<br />{report.coverage.filter(channel => channel.done).length}/{report.channels.length} channels complete · {n(report.pages)} pages read · {n(report.cachedPages)} cached pages</p>
      <p className="discord-note">Activity filter: {audience === 'all' ? 'All activity' : audience === 'tests' ? 'Test installs only' : 'Exclude test installs'} · {n(excludedPosts)} posts excluded from the history scanned.</p>
      {days.length > 0 && <p className="discord-note">Posts found in this selection: {days[0][0]} to {days[days.length - 1][0]} (Sydney). The requested date range can extend before reporting began.</p>}
      {report.hiddenReports > 0 && <p className="review">{n(report.hiddenReports)} webhook posts had no readable fields. Check Message Content Intent. Usage and error breakdowns may be incomplete.</p>}
      <div className="discord-metrics">{[['Discord posts', n(totals.posts)], ['Reporting posts', n(totals.reports)], ['Expert installations', n(actors.length)], ['Identified browsers', n(totals.browsers.length)], ['Average app-open session', totals.measuredSessions ? duration(totals.sessionSeconds / totals.measuredSessions) : 'No timed sessions'], ['Total reported app-open time', duration(totals.sessionSeconds)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <p className="discord-note">{n(totals.measuredSessions)} of {n(totals.events.Sessions || 0)} session reports have a readable duration. App-open time includes idle, background and sleep time; it is not active solving time. Sessions are attributed to the day their closing report arrived, even if they began earlier.</p>
      <p className="discord-note">Test installs: {report.testInstallations.map(test => `${test.name} (${test.device}) ${test.id}`).join(' · ')}. Exact known synthetic test labels are also filtered. Browser-only and system posts cannot be linked to an Expert installation. Installation and browser counts are separate, and do not represent distinct people. Post volume measures reporting frequency, not time played. First-name aliases are reserved per installation and shared by reporting and diagnostics.</p>
      <CountsTable title="Post types" counts={totals.events} />
      <details open><summary>Posts by day</summary>{days.length ? <table className="discord-days"><thead><tr><th>Date (Sydney)</th><th>Posts</th></tr></thead><tbody>{days.map(([day, count]) => <tr key={day}><th scope="row">{day}</th><td><span className="discord-bar" style={{ width: `${count / maxDay * 75}%` }} aria-hidden="true" />{n(count)}</td></tr>)}</tbody></table> : <p>No posts in this selection.</p>}</details>
      <details><summary>Posts by channel</summary><table><thead><tr><th>Channel</th><th>Posts</th><th>Coverage</th></tr></thead><tbody>{report.coverage.map(channel => <tr key={channel.id}><th scope="row">#{channel.name}</th><td>{n(Object.entries(channel.counts).filter(([cohort]) => selected(cohort)).reduce((total, [, count]) => total + count, 0))}</td><td>{channel.error || (channel.done ? 'Complete' : 'Partial')}</td></tr>)}</tbody></table></details>
      <details open><summary>Latest reported version by installation</summary><p>One version per identified installation, based on its latest dated version report in this period. Delayed diagnostics use their occurrence time. This does not confirm which version is installed now; unreported activity is unknown.</p><CountsTable title="Installation versions" counts={installationVersions} versions unit="Installations" /></details>
      <details><summary>Versions, platforms, countries and features</summary><p>These tables count posts with the relevant fields, not unique people or installations. Versions are listed newest first; equivalent three-part and four-part versions ending in .0 are combined.</p><CountsTable title="Versions" counts={totals.versions} versions /><CountsTable title="Platforms" counts={totals.platforms} /><CountsTable title="Countries" counts={totals.countries} /><CountsTable title="Features" counts={totals.features} /></details>
      <details><summary>Hours posts arrived (Sydney)</summary><p>Message delivery times, not hours spent playing. Delayed diagnostics and closing-session reports may refer to earlier activity.</p><CountsTable title="Hour" chronological counts={Object.fromEntries(totals.hours.map((count, hour) => [`${String(hour).padStart(2, '0')}:00`, count]))} /></details>
      <details><summary>Diagnostics · {n(totals.events.Diagnostics || 0)} reports / {n(totals.diagnosticIncidents)} reported occurrences</summary><p>{n(diagnosticProblems.reduce((sum, row) => sum + row.count, 0))} problem reports / {n(diagnosticProblems.reduce((sum, row) => sum + row.incidents, 0))} reported problem occurrences. {n(diagnosticRecoveries.reduce((sum, row) => sum + row.count, 0))} recovery notices. Problem reports identify {n(affectedInstallations.size)} affected installations; reports without an ID cannot be included in that count. Recovery and connection-test notices are not failures. Repeated counts are client-reported, not verified unique failures; older Windows updaters can count one failure twice.</p>{Object.keys(totals.errors).length ? <table><thead><tr><th>Diagnostic event</th><th>Kind</th><th>Installations</th><th>Reports</th><th>Occurrences</th></tr></thead><tbody>{Object.entries(totals.errors).sort((a, b) => b[1].count - a[1].count).map(([label, row]) => <tr key={label}><th scope="row">{label}<small>{row.meaning}</small>{row.firstOccurredAt && row.lastOccurredAt && <small>Occurred: {date(row.firstOccurredAt)} – {date(row.lastOccurredAt)} (Sydney)</small>}{row.lastReceivedAt && <small>Last received: {date(row.lastReceivedAt)} (Sydney)</small>}</th><td>{row.kind}</td><td>{n(row.installations?.length || 0)}</td><td>{n(row.count)}</td><td>{n(row.incidents)}</td></tr>)}</tbody></table> : <p>No diagnostic reports.</p>}</details>
      <details><summary>Installations by report volume</summary><table><thead><tr><th>Installation</th><th>Latest reported version</th><th>Timed sessions</th><th>App-open time</th><th>Posts</th></tr></thead><tbody>{actors.slice(0, 25).map(([id, actor]) => <tr key={id}><th scope="row">{actor.name}<small>{id}</small>{actor.lastSeenAt && <small>Last observed: {date(actor.lastSeenAt)}</small>}</th><td>{actor.latestVersion || 'Unknown'}{actor.versionAt && <small>Version observed: {date(actor.versionAt)}</small>}</td><td>{n(actor.sessions || 0)}</td><td>{actor.sessions ? duration(actor.sessionSeconds || 0) : 'No timed sessions'}</td><td>{n(actor.posts)}</td></tr>)}</tbody></table></details>
      <p className="discord-note">Includes messages still present in the selected channels. Unrecognised posts contribute to Other posts. Contact-message contents are not included. Stopping or inaccessible channels leaves a partial report. Warm server instances reuse calculated page summaries for up to five minutes; no message archive is saved.</p>
    </>}
  </section>;
}
