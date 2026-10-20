import { getStore, getDeployStore } from '@netlify/blobs';
import { env } from './babble.mjs';

// Intentionally separate from babble-shared-data used by the live clues page.
export function blobRepository(context) {
  const options = { name: 'babble-history-preview-v1', consistency: 'strong' };
  // Drafts get their own data, not the production trial store. Unknown/local
  // contexts also default to isolation. Neither store is the live clues store.
  const production = (context?.deploy?.context || env('CONTEXT')) === 'production';
  const store = production ? getStore(options) : getDeployStore(options);
  return {
    async migrateFromDeploy(deployID) {
      if (!production || !/^[a-f0-9]{24}$/.test(deployID)) throw new Error('Migration requires a production deployment and a valid source deploy ID.');
      if (await store.get('control')) throw new Error('The production store already has data; migration cannot overwrite it.');
      const source = getDeployStore({ ...options, deployID });
      const control = await source.get('control', { type: 'json' });
      if (!control?.snapshotKey || !control.stateKey) throw new Error('Source deploy has no published preview data.');
      let copied = 0;
      for await (const page of source.list({ paginate: true })) for (const { key } of page.blobs) {
        if (key === 'control') continue;
        const data = await source.get(key, { type: 'json' });
        await store.setJSON(key, data, { onlyIfNew: true }); copied++;
      }
      const result = await store.setJSON('control', control, { onlyIfNew: true });
      if (!result.modified) throw new Error('Another operation published first. Existing production data was kept.');
      return { outcome: 'migrated', copied };
    },
    async claimNotification(key) {
      return (await store.setJSON(`notifications/${key}`, { claimedAt: new Date().toISOString() }, { onlyIfNew: true })).modified;
    },
    async releaseNotification(key) { await store.delete(`notifications/${key}`); },
    async control() {
      const record = await store.getWithMetadata('control', { type: 'json' });
      return record ? { value: record.data, etag: record.etag } : { value: null, etag: null };
    },
    async commit(value, etag) {
      const result = await store.setJSON('control', value, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
      if (!result.modified || !result.etag) throw new Error('Another update won the race. Retry; no partial result was published.');
    },
    async read(key) {
      const value = await store.get(key, { type: 'json' });
      if (!value) throw new Error(`Missing preview record: ${key}`);
      return value;
    },
    async write(key, value) {
      const result = await store.setJSON(key, value, { onlyIfNew: true });
      if (!result.modified || !result.etag) throw new Error('Could not save immutable preview record.');
    },
  };
}
