import { getStore } from '@netlify/blobs';
import { makePageCounter } from './page-counter.mjs';

export async function readPageCount(openStore = getStore) {
  const options = { name: 'babble-page-views', consistency: 'strong' };
  // Notices report the live site's all-time total. CONTEXT is not guaranteed
  // to be a runtime env var; choosing a deploy store can silently return the
  // initial total from an empty ledger. This access is strictly read-only.
  const store = openStore(options);
  return makePageCounter({ store }).read();
}

// Read the existing total only. Sending a notice must never count as a visit.
// Keep notifications working even if counter storage is slow or unavailable.
export async function pageCounterField(readCount = readPageCount, timeoutMs = 2000) {
  let timer;
  try {
    const count = await Promise.race([
      Promise.resolve().then(readCount),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Counter timeout')), timeoutMs); }),
    ]);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid count');
    return { name: 'Clues page visits (all time)', value: count.toLocaleString('en-US'), inline: true };
  } catch {
    return { name: 'Clues page visits (all time)', value: 'Temporarily unavailable', inline: true };
  } finally { clearTimeout(timer); }
}
