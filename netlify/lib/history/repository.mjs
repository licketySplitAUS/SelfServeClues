import { getStore, getDeployStore } from '@netlify/blobs';

// Intentionally separate from babble-shared-data used by the live clues page.
export function blobRepository() {
  const options = { name: 'babble-history-preview-v1', consistency: 'strong' };
  // Drafts get their own data, not the production trial store. Unknown/local
  // contexts also default to isolation. Neither store is the live clues store.
  const store = process.env.CONTEXT === 'production' ? getStore(options) : getDeployStore(options);
  return {
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
