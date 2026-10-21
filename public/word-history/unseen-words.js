"use strict";
const byId = id => document.getElementById(id);
if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('embedded');
let result = null;
let busy = false;
const dateLabel = value => new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
function resize() {
  if (window.parent !== window) window.parent.postMessage({ type: 'lickety-unseen-height', height: Math.ceil(document.querySelector('main').getBoundingClientRect().height) + 12 }, '*');
}
function filterWords() {
  if (!result) return;
  const query = byId('word-filter').value.trim().toLowerCase();
  const matches = result.words.filter(word => word.includes(query));
  const items = matches.map(word => { const item = document.createElement('li'); item.textContent = word; return item; });
  byId('words').replaceChildren(...items);
  byId('filter-status').textContent = query ? `${matches.length.toLocaleString()} of ${result.count.toLocaleString()} words match “${query}”.` : '';
  resize();
}
async function loadWords() {
  if (busy) return;
  busy = true;
  byId('retry').hidden = true;
  byId('summary').textContent = 'Loading the recorded grid history…';
  try {
    const response = await fetch('/history-api/unseen-four-letter-words', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load the list.');
    if (!Array.isArray(data.words) || data.words.some(word => typeof word !== 'string' || !/^[a-z]{4}$/.test(word)) || data.count !== data.words.length || !Number.isInteger(data.gridCount) || !Number.isInteger(data.dictionaryWords)) throw new Error('The history response could not be read.');
    result = data;
    byId('summary').textContent = data.count ? `${data.count.toLocaleString()} four-letter dictionary words have no recorded appearance.` : 'Every four-letter word in the current dictionary has appeared in the recorded grids.';
    byId('coverage').textContent = `${data.gridCount.toLocaleString()} recorded grids · ${data.dictionaryWords.toLocaleString()} four-letter dictionary words${data.firstDate && data.lastDate ? ` · ${dateLabel(data.firstDate)} to ${dateLabel(data.lastDate)}` : ''}. Includes published puzzle #${data.currentPuzzle}.`;
    byId('word-filter').disabled = false;
    byId('download').disabled = false;
    filterWords();
  } catch {
    byId('summary').textContent = 'The word history could not be loaded. Check your internet connection and try again.';
    byId('retry').hidden = false;
  } finally { busy = false; resize(); }
}
byId('word-filter').addEventListener('input', filterWords);
byId('retry').addEventListener('click', loadWords);
byId('download').addEventListener('click', () => {
  if (!result) return;
  const heading = `Four-letter words not yet seen in lickety’s recorded grids\n${result.gridCount} recorded grids, through puzzle #${result.currentPuzzle} (${result.lastDate || 'date unavailable'})\n${result.count} words from ${result.dictionaryWords} four-letter dictionary entries\n\n`;
  const url = URL.createObjectURL(new Blob([heading, result.words.join('\n'), '\n'], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'lickety-unseen-four-letter-words.txt';
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(document.querySelector('main'));
void loadWords();
