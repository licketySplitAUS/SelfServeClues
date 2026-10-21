import { load } from 'cheerio';
import { parseGrid, sameGrid } from './solver.mjs';
import { chatMessage } from './chat-message.mjs';

export const env = name => globalThis.Netlify?.env?.get(name) ?? process.env[name];
const origin = 'https://www.playbabble.com';

// Cookies stay in this invocation. Never store a password, cookie or upstream HTML.
export function babbleClient({ fetchImpl = fetch, username = env('BABBLE_USERNAME'), password = env('BABBLE_PASSWORD') } = {}) {
  const cookies = new Map();
  const deadline = Date.now() + 24000;
  async function request(path, fields, redirects = 0) {
    if (Date.now() >= deadline || redirects > 5) throw new Error('Babble request budget exhausted; validation will retry.');
    const response = await fetchImpl(new URL(path, origin), {
      method: fields ? 'POST' : 'GET', redirect: 'manual', cache: 'no-store',
      signal: AbortSignal.timeout(Math.min(7000, Math.max(1, deadline - Date.now()))),
      headers: { 'user-agent': 'LicketysCluesValidator/1.0', cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      ...(fields ? { body: new URLSearchParams(fields).toString() } : {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], split = pair.indexOf('=');
      if (split > 0) cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    if (response.status >= 300 && response.status < 400) {
      const target = new URL(response.headers.get('location'), origin);
      if (target.origin !== origin) throw new Error('Unexpected Babble login redirect.');
      return request(target.pathname + target.search, undefined, redirects + 1);
    }
    if (!response.ok) throw new Error(`Babble returned HTTP ${response.status}.`);
    return response.text();
  }
  return {
    async login() {
      if (!username || !password) throw new Error('BABBLE_USERNAME and BABBLE_PASSWORD must be configured.');
      await request('/log_in');
      await request('/action/log_in', { email: username, password, return_url: '/' });
      const html = await request('/');
      if (!/logged in as/i.test(load(html).text())) throw new Error('Babble login failed. Check the configured credentials.');
      return html;
    },
    page: () => request('/'),
    async submit(word, puzzle) {
      let data;
      try { data = JSON.parse(await request('/action/add_word', { word, puzzleid: String(puzzle) })); }
      catch { throw new Error('Babble word response could not be confirmed.'); }
      if (data.word?.toLowerCase() !== word) throw new Error('Babble word response did not identify the submitted word.');
      if (data.error === 'not_valid') return 'rejected';
      if (data.error === 'duplicate') return 'accepted';
      if (!data.error && Number(data.letters) === word.length && Number.isFinite(Number(data.points))) return 'accepted';
      // "dne" means no board path; it is not evidence for a global dictionary ban.
      throw new Error(`Babble did not confirm dictionary membership (${String(data.error || 'unknown response').slice(0, 40)}).`);
    },
    async chat(puzzle, message) {
      await request('/action/add_chat_message', { message: chatMessage(message), puzzleid: String(puzzle) });
    },
  };
}

export function readOfficial(html, expected) {
  if (!sameGrid(parseGrid(html), expected)) throw new Error('Babble puzzle changed during validation.');
  const $ = load(html), lengths = {}, starts = {}, prefixes = {};
  $('[id^="stats_word_total_"]').each((_, el) => {
    const length = Number($(el).attr('id').replace('stats_word_total_', ''));
    const count = Number($(el).text().trim());
    if (length >= 4 && Number.isInteger(count) && count >= 0) lengths[length] = count;
  });
  $('[id^="stats_total_"]').each((_, el) => {
    const tile = $(el).attr('id').replace('stats_total_', '');
    const letter = $(`#${tile}`).text().trim().match(/^[a-z]/i)?.[0]?.toLowerCase();
    const count = Number($(el).text().trim());
    if (letter && Number.isInteger(count) && count >= 0) starts[letter] = (starts[letter] || 0) + count;
  });
  // Some Babble accounts expose two-letter rows; use fixed totals, never remaining counts.
  $('tr').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    const match = text.match(/^([a-z]{2})\s*:?\s*\d+\s*\/\s*(\d+)$/i);
    if (match) prefixes[match[1].toLowerCase()] = Number(match[2]);
  });
  if (!Object.keys(lengths).length) throw new Error('Babble word-size totals were unavailable; no words were excluded.');
  const total = Object.values(lengths).reduce((a, b) => a + b, 0);
  const displayed = $('#tile_stats').text().match(/(\d+)\s+words total/i);
  if (displayed && Number(displayed[1]) !== total) throw new Error('Babble statistics were inconsistent.');
  return { total, lengths, starts, prefixes };
}

export function differences(words, official) {
  const count = (key, get) => words.filter(row => get(row.word) === key).length;
  const compare = (map, get) => Object.fromEntries(Object.keys(map).map(key => [key, count(key, get) - map[key]]).filter(([, n]) => n));
  // Include lengths our solver found even if Babble omits its zero row.
  const lengths = { ...official.lengths };
  for (const row of words) lengths[row.word.length] ??= 0;
  return { total: words.length - official.total, lengths: compare(lengths, word => String(word.length)),
    starts: compare(official.starts, word => word[0]), prefixes: compare(official.prefixes, word => word.slice(0, 2)) };
}
export const countsMatch = diff => diff.total === 0 && ['lengths', 'starts', 'prefixes'].every(key => !Object.keys(diff[key]).length);

export async function validateSolution(grid, words, { client = babbleClient(), budgetMs = 14000, previous } = {}) {
  const checkedAt = new Date().toISOString(), rejected = [], tested = [];
  const verified = new Set(previous?.verified || []);
  let official, before, remaining = words;
  try {
    official = readOfficial(await client.login(), grid);
    before = differences(words, official);
    if (!countsMatch(before)) {
      const deadline = Date.now() + budgetMs;
      // Compare size, first letter and two-letter groups before posting. All calls
      // are sequential, and totals are captured before accepted words change progress.
      const candidates = words.filter(({ word }) => before.lengths[word.length] > 0 || before.starts[word[0]] > 0 || before.prefixes[word.slice(0, 2)] > 0);
      const priority = word => Number(before.lengths[word.length] > 0) + Number(before.starts[word[0]] > 0) + 2 * Number(before.prefixes[word.slice(0, 2)] > 0);
      candidates.sort((a, b) => priority(b.word) - priority(a.word) || a.word.slice(0, 2).localeCompare(b.word.slice(0, 2)));
      for (const { word } of candidates) {
        if (verified.has(word)) continue;
        if (Date.now() >= deadline) break;
        const result = await client.submit(word, grid.puzzle); tested.push(word);
        if (result === 'rejected') rejected.push(word); else verified.add(word);
        remaining = words.filter(row => !rejected.includes(row.word));
        if (countsMatch(differences(remaining, official))) break;
      }
      const after = readOfficial(await client.page(), grid);
      if (JSON.stringify(after) !== JSON.stringify(official)) throw new Error('Babble fixed totals changed during validation.');
    }
    const delta = differences(remaining, official), matched = countsMatch(delta);
    return { status: matched ? (rejected.length ? 'corrected' : 'matched') : 'mismatch', checkedAt, official, before,
      differences: delta, rejected, verified: [...verified], tested: tested.length, message: matched ? `Matches PlayBabble: ${official.total} words; all word-size totals${Object.keys(official.starts).length ? ' and starting-letter totals' : ''}${Object.keys(official.prefixes).length ? ' and two-letter totals' : ''} agree.` : 'Unresolved word-count discrepancy. Automatic checks will retry; no unconfirmed words were excluded.' };
  } catch (error) {
    return { status: 'unavailable', checkedAt, ...(official ? { official, before } : {}), rejected: [], verified: [...verified], tested: tested.length,
      message: error.message.startsWith('Babble') || error.message.startsWith('BABBLE') ? error.message : 'Babble validation could not complete. Automatic checks will retry.' };
  }
}
