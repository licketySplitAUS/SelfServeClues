import { getStore, getDeployStore } from '@netlify/blobs';
import { makePageCounter } from './page-counter.mjs';
import { env } from './env.mjs';

export async function readPageCount() {
  const options = { name: 'babble-page-views', consistency: 'strong' };
  const store = env('CONTEXT') === 'production' ? getStore(options) : getDeployStore(options);
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
