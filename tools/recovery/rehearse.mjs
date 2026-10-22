// Restore a downloaded backup into an isolated in-memory store and verify it.
// No Netlify writes are performed by this rehearsal.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { restoreBackup, verifyBackup } from '../../netlify/lib/recovery.mjs';
const backup = JSON.parse(gunzipSync(fs.readFileSync(process.argv[2])));
const stores = new Map();
const open = name => {
  if (!stores.has(name)) stores.set(name, new Map());
  const rows = stores.get(name);
  return {
    async *list() { yield { blobs: [...rows.keys()].map(key => ({ key })) }; },
    getWithMetadata: async key => rows.get(key) || null,
    set: async (key, value, options) => {
      if (rows.has(key)) return { modified: false };
      rows.set(key, { data: Buffer.from(value), metadata: options.metadata || {} });
      return { modified: true };
    }
  };
};
const verified = verifyBackup(backup);
await restoreBackup(backup, open, false);
const restored = await restoreBackup(backup, open, true);
await restoreBackup(backup, open, true); // Identical-content resume must be safe.
if (restored.records !== verified.count) throw Error('Restored inventory differs.');
console.log(`PASS isolated restore and idempotent resume: ${restored.records} records.`);
