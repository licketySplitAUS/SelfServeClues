import { useEffect, useState } from 'react';

type Setting = { enabled: boolean; announcementText: string; source: string; changedAt: string | null; message?: string };
export default function ChatAnnouncementControl({ adminKey }: { adminKey: string }) {
  const [setting, setSetting] = useState<Setting | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  async function refresh() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/history-api/chat-settings', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load chat setting.');
      setSetting(data);
      setDraft(data.announcementText);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not load chat setting.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function change(enabled: boolean, announcementText = setting?.announcementText, saveText = false) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/history-api/chat-settings', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify({ enabled, announcementText }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save chat setting.');
      setSetting(data);
      if (saveText) setDraft(data.announcementText);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not save chat setting. Reload to check the saved value.'); }
    finally { setBusy(false); }
  }
  return <section className="publication-control"><h2>Babble chat announcement</h2>
    <p>Post your saved announcement in Babble’s chat after the puzzle has been solved and its counts match Babble.</p>
    <p role="status" aria-live="polite">{busy ? 'Working…' : setting ? setting.message || `Announcements are ${setting.enabled ? 'on' : 'off'}.` : 'Loading chat setting…'}</p>
    {setting && <label><input type="checkbox" role="switch" checked={setting.enabled} disabled={!adminKey || busy} onChange={event => void change(event.target.checked)} /> Announce validated clues in Babble chat</label>}
    {setting && <>
      <label htmlFor="chat-announcement-text">Announcement text
        <input id="chat-announcement-text" type="text" value={draft} maxLength={250} disabled={!adminKey || busy} onChange={event => setDraft(event.target.value)} aria-describedby="chat-announcement-length" />
      </label>
      <p id="chat-announcement-length">{draft.length}/250 characters. One line.</p>
      <p>Preview: <b>{draft.trim() || 'Enter your announcement above.'}</b></p>
      <button disabled={!adminKey || busy || !draft.trim() || draft.trim() === setting.announcementText} onClick={() => void change(setting.enabled, draft, true)}>Save announcement text</button>
    </>}
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => void refresh()}>Reload chat setting</button>
    <p>Changes apply to subsequent announcement checks without a redeploy. Saving does not post immediately. The next scheduled check or “Send current validation report to Discord” can announce a validated puzzle; each puzzle is announced at most once. This switch is separate from making the public clues page live.</p>
  </section>;
}
