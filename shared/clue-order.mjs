const cookieName = 'lickety_clue_order';

export function readClueOrder(cookie) {
  const value = String(cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return value === 'grid' ? 'grid' : 'alphabetical';
}

export function clueOrderCookie(order, hostname, secure) {
  const domain = hostname === 'r46.me' || hostname.endsWith('.r46.me') ? '; Domain=r46.me' : '';
  return `${cookieName}=${order === 'grid' ? 'grid' : 'alphabetical'}; Max-Age=31536000; Path=/; SameSite=Lax${domain}${secure ? '; Secure' : ''}`;
}

// Compute against the full puzzle only when its letters/solution change, not
// when ticking a word or changing All/On/Off. Each tile uses its own path test.
export function groupCluesByGrid(grid, clues) {
  const letters = /^[A-Z]{25}$/.test(grid.toUpperCase()) ? grid.toUpperCase().split('') : Array(25).fill('·');
  const tiles = letters.map(letter => letter === 'Q' ? 'QU' : letter);
  const groups = letters.map((letter, index) => ({ index, row: Math.floor(index / 5) + 1, column: index % 5 + 1, letter: letter === 'Q' ? 'Qu' : letter, clues: [] }));
  const adjacent = tiles.map((_, index) => tiles.flatMap((_, other) => other !== index && Math.abs(Math.floor(index / 5) - Math.floor(other / 5)) <= 1 && Math.abs(index % 5 - other % 5) <= 1 ? [other] : []));
  const available = {};
  for (const letter of tiles.join('')) available[letter] = (available[letter] || 0) + 1;
  for (const clue of [...clues].sort((a, b) => a.word.localeCompare(b.word))) {
    const word = clue.word.toUpperCase(), needed = {};
    for (const letter of word) needed[letter] = (needed[letter] || 0) + 1;
    if (!/^[A-Z]{4,25}$/.test(word) || Object.keys(needed).some(letter => needed[letter] > (available[letter] || 0))) continue;
    // A failed state depends on the visited tiles, current tile and offset.
    // Memoization avoids revisiting the same failed route through repeated letters.
    const failed = new Set();
    function walk(index, offset, used) {
      if (!word.startsWith(tiles[index], offset)) return false;
      const next = offset + tiles[index].length;
      if (next === word.length) return true;
      const visited = used | (1 << index), key = (visited * 32 + index) * 32 + next;
      if (failed.has(key)) return false;
      if (adjacent[index].some(other => !(visited & (1 << other)) && walk(other, next, visited))) return true;
      failed.add(key); return false;
    }
    for (const group of groups) if (walk(group.index, 0, 0)) group.clues.push(clue);
  }
  return groups;
}
