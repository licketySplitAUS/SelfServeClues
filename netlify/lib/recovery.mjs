import { createHash } from 'node:crypto';

export const storeNames = ['babble-history-preview-v1', 'babble-shared-data', 'babble-publication', 'babble-page-views'];
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Inventory is a bounded point-in-time set, not a transaction across stores.
// ETags reject changed/deleted objects; an ending control check pins the puzzle.
export async function inventory(openStore, details = {}) {
  const stores = {};
  for (const name of storeNames) {
    stores[name] = [];
    for await (const page of openStore(name).list({ paginate: true })) stores[name].push(...page.blobs);
    stores[name].sort((a, b) => a.key.localeCompare(b.key));
  }
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), ...details, stores };
}

export async function readRecord(openStore, name, key, etag) {
  if (!storeNames.includes(name) || typeof key !== 'string' || !key || key.length > 2048 || !etag) throw new Error('Invalid backup record request.');
  const value = await openStore(name).getWithMetadata(key, { type: 'arrayBuffer' });
  if (!value || value.etag !== etag) throw new Error('Data changed during backup. Start a new backup.');
  const bytes = Buffer.from(value.data);
  return { store: name, key, etag, metadata: value.metadata, sha256: digest(bytes), data: bytes.toString('base64') };
}

export function verifyBackup(backup) {
  if (backup?.schemaVersion !== 1 || !backup.inventory?.stores || !Array.isArray(backup.records)) throw new Error('Unsupported recovery backup.');
  const records = new Map();
  for (const row of backup.records) {
    if (!storeNames.includes(row.store) || typeof row.key !== 'string' || !row.key || row.key.length > 2048 || typeof row.data !== 'string' || digest(Buffer.from(row.data, 'base64')) !== row.sha256) throw new Error('Invalid record or checksum.');
    const id = `${row.store}\0${row.key}`;
    if (records.has(id)) throw new Error('Duplicate backup record.');
    records.set(id, row);
  }
  let count = 0;
  for (const name of storeNames) {
    if (!Array.isArray(backup.inventory.stores[name])) throw new Error(`Missing store inventory: ${name}`);
    for (const expected of backup.inventory.stores[name]) {
      const row = records.get(`${name}\0${expected.key}`);
      if (!row || row.etag !== expected.etag) throw new Error('Incomplete inventory.');
      count++;
    }
  }
  if (count !== records.size) throw new Error('Unexpected backup records.');
  const json = key => {
    const row = records.get(`babble-history-preview-v1\0${key}`);
    if (!row) throw new Error(`Missing history reference: ${key}`);
    return JSON.parse(Buffer.from(row.data, 'base64').toString());
  };
  const controlRow = records.get('babble-history-preview-v1\0control');
  let state = null, snapshot = null;
  if (controlRow) {
    const control = json('control');
    for (const version of [control, control.previous].filter(Boolean)) {
      if (version.stateKey) {
        const saved = json(version.stateKey);
        for (const key of Object.values(saved.revisions || {})) json(key);
      }
      if (version.snapshotKey) json(version.snapshotKey);
    }
    if (control.stateKey) state = json(control.stateKey);
    if (control.snapshotKey) snapshot = json(control.snapshotKey);
    if (state && state.sourceVersion !== backup.inventory.baselineVersion) throw new Error('Baseline version mismatch.');
    if (state && snapshot && (state.current.puzzle !== snapshot.current.puzzle || state.current.letters !== snapshot.current.letters)) throw new Error('Published puzzle references disagree.');
  }
  return { count, state, snapshot };
}

// Restore is create-only, with identical-content resume. Preflight ALL records
// before the first write, and publish control last. Never overwrite live data.
export async function restoreBackup(backup, openStore, apply = false) {
  verifyBackup(backup);
  const pending = [];
  for (const name of storeNames) {
    const wanted = new Map(backup.records.filter(row => row.store === name).map(row => [row.key, row]));
    for await (const page of openStore(name).list({ paginate: true })) for (const { key } of page.blobs) {
      const row = wanted.get(key);
      const old = row && await openStore(name).getWithMetadata(key, { type: 'arrayBuffer' });
      if (!old || digest(Buffer.from(old.data)) !== row.sha256 || JSON.stringify(old.metadata || {}) !== JSON.stringify(row.metadata || {})) throw new Error(`Restore target contains different data: ${name}/${key}`);
    }
    for (const row of wanted.values()) pending.push(row);
  }
  pending.sort((a, b) => Number(a.store === storeNames[0] && a.key === 'control') - Number(b.store === storeNames[0] && b.key === 'control'));
  if (apply) for (const row of pending) {
    const store = openStore(row.store);
    const result = await store.set(row.key, Buffer.from(row.data, 'base64'), { metadata: row.metadata || {}, onlyIfNew: true });
    if (!result.modified) {
      const old = await store.getWithMetadata(row.key, { type: 'arrayBuffer' });
      if (!old || digest(Buffer.from(old.data)) !== row.sha256 || JSON.stringify(old.metadata || {}) !== JSON.stringify(row.metadata || {})) throw new Error('Target changed during restore; stop all writers before resuming.');
    }
  }
  return { records: pending.length, applied: apply };
}
