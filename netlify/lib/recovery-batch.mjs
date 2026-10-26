import { readRecord, storeNames } from './recovery.mjs';

export const MAX_BATCH_RECORDS = 100;
export const MAX_BATCH_BODY = 65536;
export const BATCH_PROTOCOL = Object.freeze({ version: 1, maxRecords: MAX_BATCH_RECORDS });
function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }

export function validateBatch(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_BATCH_RECORDS) throw invalid('Request 1–100 backup records.');
  const seen = new Set();
  return rows.map(row => {
    if (!row || !storeNames.includes(row.store) || typeof row.key !== 'string' || !row.key || row.key.length > 2048 || typeof row.etag !== 'string' || !row.etag || row.etag.length > 256) throw invalid('Invalid backup batch record.');
    const id = `${row.store}\0${row.key}`;
    if (seen.has(id)) throw invalid('Duplicate backup batch record.');
    seen.add(id);
    return { store: row.store, key: row.key, etag: row.etag };
  });
}

// Bound internal storage concurrency and response size. A partial response is a
// verified prefix; the client requests the remainder without omitting records.
export async function readBatch(openStore, rows, { maxBytes = 2_000_000, maxSingleBytes = 4_000_000 } = {}) {
  const targets = validateBatch(rows), records = [];
  let bytes = 100;
  for (let offset = 0; offset < targets.length; offset += 4) {
    const settled = await Promise.allSettled(targets.slice(offset, offset + 4).map(row => readRecord(openStore, row.store, row.key, row.etag)));
    const failure = settled.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    for (const { value: record } of settled) {
      const size = Buffer.byteLength(JSON.stringify(record)) + 1;
      if (size > maxSingleBytes) throw invalid('Backup object exceeds the supported response size.', 413);
      if (records.length && bytes + size > maxBytes) return { records, consumed: records.length };
      records.push(record); bytes += size;
      if (bytes >= maxBytes) return { records, consumed: records.length };
    }
  }
  return { records, consumed: records.length };
}
