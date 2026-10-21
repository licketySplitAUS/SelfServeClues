import { useEffect, useState } from 'react';

type Setting = { enabled: boolean; messages: string[]; revision: string | null; source: string; changedAt: string | null; message?: string };
const pageSize = 20;
export default function ChatAnnouncementControl({ adminKey }: { adminKey: string }) {
  const [setting, setSetting] = useState<Setting | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [draft, setDraft] = useState<string[]>([]), [newMessage, setNewMessage] = useState(''), [bulk, setBulk] = useState('');
  const [page, setPage] = useState(0), [query, setQuery] = useState('');
  const dirty = !!setting && JSON.stringify(draft) !== JSON.stringify(setting.messages);
  const unlocked = !!adminKey && !busy && !!setting;
  const filtered = draft.map((text, index) => ({ text, index })).filter(row => row.text.toLowerCase().includes(query.toLowerCase()));
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const shownPage = Math.min(page, lastPage);
  const visible = filtered.slice(shownPage * pageSize, (shownPage + 1) * pageSize);
  async function refresh() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/history-api/chat-settings', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load messages.');
      setSetting(data); setDraft(data.messages); setPage(0); setQuery('');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not load messages.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function save(enabled: boolean, messages: string[], saveDraft = false) {
    if (!setting) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/history-api/chat-settings', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify({ enabled, messages, revision: setting.revision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save messages.');
      setSetting(data);
      if (saveDraft) setDraft(data.messages);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not save messages. Your edits are still here.'); }
    finally { setBusy(false); }
  }
  function addMessage() {
    const text = newMessage.trim();
    if (!text) return;
    if (draft.includes(text)) { setError('That message is already in the list.'); return; }
    setDraft([...draft, text]); setNewMessage(''); setQuery(''); setPage(Math.floor(draft.length / pageSize)); setError('');
  }
  function importMessages(replace: boolean) {
    const lines = bulk.split(/\r\n|\n|\r/).map(text => text.trim()).filter(Boolean);
    if (!lines.length) { setError('Paste or load at least one message, one per line.'); return; }
    const bad = lines.findIndex(text => text.length > 250 || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(text));
    if (bad >= 0) { setError(`Message ${bad + 1} must be a single line of 250 characters or fewer. Nothing was imported.`); return; }
    setDraft([...new Set([...(replace ? [] : draft), ...lines])]); setBulk(''); setQuery(''); setPage(0); setError('');
  }
  return <section className="publication-control chat-messages"><h2>Babble chat announcements</h2>
    <p>One message is picked at random from the saved list for each puzzle day, after the clues have been validated. A message may be picked again on another day.</p>
    <p role="status" aria-live="polite">{busy ? 'Working…' : setting ? setting.message || `Announcements are ${setting.enabled ? 'on' : 'off'}. ${setting.messages.length} saved messages.` : 'Loading messages…'}</p>
    {setting && <>
      <label><input type="checkbox" role="switch" checked={setting.enabled} disabled={!unlocked || (!setting.enabled && !setting.messages.length)} onChange={event => void save(event.target.checked, setting.messages)} /> Announce validated clues in Babble chat</label>
      <fieldset disabled={!unlocked}>
        <h3>Message library</h3>
        <p>{draft.length} messages in this list{dirty ? ' · Unsaved changes — click Save message list below.' : ''}. Each message can contain up to 250 characters. There is no fixed message-count limit.</p>
        <label htmlFor="new-chat-message">Add a message<input id="new-chat-message" value={newMessage} maxLength={250} onChange={event => setNewMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addMessage(); } }} /></label>
        <button type="button" disabled={!newMessage.trim()} onClick={addMessage}>Add message</button>
        <label htmlFor="find-chat-message">Find messages<input id="find-chat-message" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        <ol className="chat-message-list" start={shownPage * pageSize + 1}>
          {visible.map(({ text, index }) => <li key={index}>
            <label htmlFor={`chat-message-${index}`}>Message {index + 1}<input id={`chat-message-${index}`} value={text} maxLength={250} onChange={event => setDraft(draft.map((message, row) => row === index ? event.target.value : message))} /></label>
            <small>{text.length}/250 characters</small>{' '}
            <button type="button" aria-label={`Remove message ${index + 1}`} onClick={() => setDraft(draft.filter((_, row) => row !== index))}>Remove</button>
          </li>)}
        </ol>
        {!filtered.length && <p>{draft.length ? 'No messages match your search.' : 'Your list is empty. Add a message or import a list below.'}</p>}
        {filtered.length > pageSize && <nav aria-label="Message list pages"><button type="button" disabled={shownPage === 0} onClick={() => setPage(shownPage - 1)}>Previous</button> Page {shownPage + 1} of {lastPage + 1} <button type="button" disabled={shownPage === lastPage} onClick={() => setPage(shownPage + 1)}>Next</button></nav>}
        <details><summary>Import many messages</summary>
          <p>Paste one message per line, or load a text file. Blank lines and exact duplicates are ignored. Imports stay as a draft until you save.</p>
          <label>Load a text file<input type="file" accept=".txt,text/plain" onChange={event => { const input = event.currentTarget; const file = input.files?.[0]; if (file) void file.text().then(text => { setBulk(text); setError(''); input.value = ''; }).catch(() => setError('Could not read that file. Try pasting its text instead.')); }} /></label>
          <label htmlFor="chat-message-import">One message per line<textarea id="chat-message-import" rows={8} value={bulk} onChange={event => setBulk(event.target.value)} /></label>
          <button type="button" disabled={!bulk.trim()} onClick={() => importMessages(false)}>Append imported messages</button>
          <button type="button" disabled={!bulk.trim()} onClick={() => importMessages(true)}>Replace draft with imported messages</button>
        </details>
        <button type="button" disabled={!dirty || draft.some(text => !text.trim()) || (setting.enabled && !draft.length)} onClick={() => void save(setting.enabled, draft, true)}>Save message list</button>
        {setting.enabled && !draft.length && <p>Add a message, or turn announcements off before saving an empty list.</p>}
        <p>Saving, importing and removing messages do not post to chat. A daily choice is kept for retries even if you later edit the library; an already announced puzzle is not posted again.</p>
      </fieldset>
    </>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void refresh()}>Reload saved message list</button>
    <p>{dirty ? 'Reloading discards unsaved edits. ' : ''}The announcement switch is separate from making the public clues page live. The next scheduled check or “Send current validation report to Discord” can announce a validated puzzle when this switch is on.</p>
  </section>;
}
