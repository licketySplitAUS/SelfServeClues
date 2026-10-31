// A short lease prevents simultaneous forwards. Sent IDs remain for 14 days.
// Discord delivery and storage cannot be one transaction; a success followed
// by a storage failure remains an explicitly best-effort delivery boundary.
export function diagnosticDelivery(store, now = Date.now, keyFor = data => `reports/${data.occurredAt.slice(0, 10)}/${data.reportId}`) {
  return {
    async claim(data) {
      const key = keyFor(data), row = await store.getWithMetadata(key, { type: 'json' });
      if (row?.data?.state === 'sent') return { duplicate: true };
      if (row?.data?.state === 'sending' && now() - row.data.at < 30000) return { busy: true };
      const result = await store.setJSON(key, { state: 'sending', at: now() }, row?.etag ? { onlyIfMatch: row.etag } : { onlyIfNew: true });
      if (!result.modified) return { busy: true };
      return { key, etag: result.etag };
    },
    async finish(claim, sent) {
      const result = await store.setJSON(claim.key, { state: sent ? 'sent' : 'failed', at: now() }, { onlyIfMatch: claim.etag });
      if (!result.modified) throw new Error('Diagnostic delivery lease changed.');
    },
    async cleanup() {
      let removed = 0;
      const cutoff = new Date(now() - 14 * 86400000).toISOString().slice(0, 10);
      for await (const page of store.list({ prefix: 'reports/', paginate: true })) {
        for (const { key } of page.blobs) if (key.split('/')[1] < cutoff && removed < 500) { await store.delete(key); removed++; }
        if (removed >= 500) break;
      }
      return removed;
    }
  };
}
