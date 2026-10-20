export const validVisitId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const initial = { through: '2026-10-19', count: 4197761 };
const dayOf = date => date.toISOString().slice(0, 10);
const nextDay = day => dayOf(new Date(Date.parse(day + 'T00:00:00Z') + 86400000));

// This is an append-only event ledger, not a read-modify-write counter key.
// Each UUID has its own immutable receipt/index. Checkpoints are immutable,
// date-specific summaries of closed days, derived from those source records.
export function makePageCounter({ store, clock = () => new Date() }) {
  async function checkpoint() {
    const { blobs } = await store.list({ prefix: 'checkpoints/' });
    const key = blobs.map(row => row.key).sort().at(-1);
    const value = key ? await store.get(key, { type: 'json' }) : initial;
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.through) || !Number.isSafeInteger(value.count) || value.count < initial.count) throw new Error('Page counter checkpoint is invalid.');
    return value;
  }
  async function countDays(from, to) {
    let count = 0;
    for (let day = nextDay(from); day <= to; day = nextDay(day)) {
      const { blobs } = await store.list({ prefix: `visits/${day}/` });
      count += blobs.length;
    }
    return count;
  }
  async function read() {
    const prior = await checkpoint();
    return prior.count + await countDays(prior.through, dayOf(clock()));
  }
  async function record(visitId) {
    if (!validVisitId(visitId)) throw new Error('Invalid page visit ID.');
    const receiptKey = `receipts/${visitId}`;
    const proposed = { day: dayOf(clock()) };
    const saved = await store.setJSON(receiptKey, proposed, { onlyIfNew: true });
    const receipt = saved.modified ? proposed : await store.get(receiptKey, { type: 'json' });
    if (!receipt || !/^\d{4}-\d{2}-\d{2}$/.test(receipt.day)) throw new Error('Page visit receipt is unavailable.');
    // Retrying a partially completed request repairs its index in the same day.
    await store.setJSON(`visits/${receipt.day}/${visitId}`, {}, { onlyIfNew: true });
    return read();
  }
  async function seal() {
    const prior = await checkpoint();
    // Leave two UTC days open, longer than any request/retry can be in flight.
    const through = dayOf(new Date(+clock() - 2 * 86400000));
    if (through <= prior.through) return prior;
    const value = { through, count: prior.count + await countDays(prior.through, through) };
    await store.setJSON(`checkpoints/${through}`, value, { onlyIfNew: true });
    return value;
  }
  return { read, record, seal };
}
