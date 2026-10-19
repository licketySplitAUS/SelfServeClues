// Values match BabbleController.pas / the imported SQL scores. Qu contributes
// Q(3) + U(2) as one tile; J/X/Z are 6, unlike Scrabble's values.
const values = { A: 1, B: 3, C: 2, D: 2, E: 1, F: 4, G: 3, H: 2, I: 1, J: 6, K: 5, L: 1, M: 2, N: 1, O: 1, P: 2, Q: 5, R: 1, S: 1, T: 1, U: 2, V: 4, W: 5, X: 6, Y: 3, Z: 6 };

export function scoreWord(word) {
  word = word.toUpperCase();
  let score = 0;
  for (let i = 0; i < word.length; i++) {
    score += values[word[i]] || 0;
    if (word[i] === 'Q' && word[i + 1] === 'U') i++;
  }
  return score * (word.length - 3);
}

// Equivalent board and Qu rules to Self Serve, with a trie so the daily job
// visits valid prefixes rather than tracing every dictionary word separately.
export function solveGrid(letters, dictionary) {
  if (!/^[A-Z]{25}$/.test(letters)) throw new Error('A grid must contain exactly 25 letters.');
  const trie = Object.create(null);
  for (const text of dictionary) {
    const word = text.toLowerCase();
    if (!/^[a-z]{4,50}$/.test(word)) continue;
    let node = trie;
    for (const letter of word) node = node[letter] ||= Object.create(null);
    node.word = word;
  }
  const result = new Map();
  const visit = (index, node, used, start) => {
    if (used & (1 << index)) return;
    const tile = letters[index].toLowerCase();
    node = node[tile];
    if (tile === 'q') node = node?.u;
    if (!node) return;
    if (node.word && !result.has(node.word)) result.set(node.word, {
      word: node.word, score: scoreWord(node.word), startRow: Math.floor(start / 5) + 1, startCol: start % 5 + 1,
    });
    used |= 1 << index;
    const row = Math.floor(index / 5), col = index % 5;
    for (let r = Math.max(0, row - 1); r <= Math.min(4, row + 1); r++) {
      for (let c = Math.max(0, col - 1); c <= Math.min(4, col + 1); c++) visit(r * 5 + c, node, used, start);
    }
  };
  for (let i = 0; i < 25; i++) visit(i, trie, 0, i);
  return [...result.values()].sort((a, b) => a.word.localeCompare(b.word));
}

export function validIdentity(grid) {
  if (!grid || !Number.isSafeInteger(grid.puzzle) || grid.puzzle < 1 || !/^[A-Z]{25}$/.test(grid.letters)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(grid.date || '')) return false;
  const date = new Date(grid.date + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === grid.date;
}

export function parseGrid(html) {
  const letters = [...html.matchAll(/\/images\/([a-z])\.gif/gi)].slice(0, 25).map(match => match[1].toUpperCase()).join('');
  const match = html.match(/\/(\d+)\/(\d{2})\/(\d{2})\/(\d{4})(?:#chat_log|\/chat_log)/i);
  const grid = { letters, puzzle: Number(match?.[1]), date: match ? `${match[4]}-${match[2]}-${match[3]}` : null };
  if (!validIdentity(grid)) throw new Error('PlayBabble did not supply a valid puzzle number, date and grid.');
  return grid;
}

export const sameGrid = (a, b) => !!a && !!b && a.puzzle === b.puzzle && a.date === b.date && a.letters === b.letters;
