import { useState } from 'react';
import { downloadRecovery } from '../../shared/recovery-download.mjs';

export default function RecoveryPanel({ adminKey }: { adminKey: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function download(kind: string) {
    setBusy(true); setMessage('Preparing recovery download…');
    try {
      let blob: Blob, filename: string;
      if (kind === 'data') {
        const data = await downloadRecovery('', adminKey, (done, total) => setMessage(`Saving data: ${done} of ${total} objects…`));
        const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'));
        blob = await new Response(stream).blob(); filename = `babble-runtime-${new Date().toISOString().slice(0, 10)}.json.gz`;
      } else {
        const response = await fetch(`/history-api/recovery?${kind}`, { headers: { 'x-admin-key': adminKey } });
        if (!response.ok) throw new Error((await response.json()).error || 'Download failed.');
        blob = await response.blob(); filename = kind === 'format=html' ? 'babbleclues.html' : `babble-${kind.includes('delta') ? 'since-import' : 'current'}-staging.sql.gz`;
      }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMessage('Downloaded. Keep a copy outside Netlify. See the recovery guide for verification and restoration.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Download failed.'); }
    finally { setBusy(false); }
  }
  return <details><summary>Backup &amp; recovery</summary>
    <p>Save the runtime data regularly: puzzle revisions, corrections, shared grid and word list, publication setting, notification receipts and visit ledger. Code and imported history are in GitHub. Secrets and visitors’ browser progress need separate backups.</p>
    <fieldset disabled={busy || !adminKey}>
      <button onClick={() => void download('data')}>Download all runtime data</button>
      <button onClick={() => void download('format=sql')}>SQL Server: current puzzle</button>
      <button onClick={() => void download('format=sql&scope=delta')}>SQL Server: puzzles since import</button>
      <button onClick={() => void download('format=html')}>Download emergency clues page</button>
    </fieldset>
    <p>SQL downloads create recovery staging tables. The full historical SQL export and restore tools are in the <a href="https://github.com/licketySplitAUS/SelfServeClues/blob/main/docs/DISASTER-RECOVERY.md" target="_blank" rel="noreferrer">recovery guide</a>. These downloads do not change the live site.</p>
    <p role="status">{message}</p>
  </details>;
}
