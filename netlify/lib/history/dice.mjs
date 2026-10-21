// Reference 5×5 dice from Stanford's CS106X Boggle handout, page 2.
// This is a hypothesis for Babble's generator, not an asserted Babble rule.
export const BIG_BOGGLE_DICE = [
  'AAAFRS', 'AAEEEE', 'AAFIRS', 'ADENNN', 'AEEEEM',
  'AEEGMU', 'AEGMNN', 'AFIRSY', 'BJKQXZ', 'CCNSTW',
  'CEIILT', 'CEILPT', 'CEIPST', 'DDLNOR', 'DDHNOT',
  'DHHLOR', 'DHLNOR', 'EIIITT', 'EMOTTT', 'ENSSSU',
  'FIPRSY', 'GORRVW', 'HIPRRY', 'NOOTUW', 'OOOTTU',
];

export function diceExplanation(word) {
  const upper = word.toUpperCase();
  const blocked = (code, reason) => ({ word, blocked: true, code, reason });
  if (/Q(?!U)/.test(upper)) return blocked('qu-tile', 'The reference Q tile supplies Qu together; this word needs a Q without its U.');
  const tiles = [...upper.replaceAll('QU', 'Q')];
  const rare = tiles.filter(letter => 'BJKQXZ'.includes(letter));
  if (rare.length > 1) return blocked('shared-rare-die', `${rare.map(letter => letter === 'Q' ? 'Qu' : letter).join(' + ')} need more than one face of the same B/J/K/Qu/X/Z die.`);
  const counts = {};
  for (const letter of tiles) counts[letter] = (counts[letter] || 0) + 1;
  for (const [letter, count] of Object.entries(counts)) {
    const available = BIG_BOGGLE_DICE.filter(die => die.includes(letter)).length;
    if (count > available) return blocked('letter-supply', `Needs ${count} ${letter} tiles, but only ${available} ${available === 1 ? 'die can' : 'dice can'} supply ${letter} in this reference set.`);
  }
  const candidates = tiles.map(letter => BIG_BOGGLE_DICE.flatMap((die, index) => die.includes(letter) ? [index] : [])).sort((a, b) => a.length - b.length);
  const used = new Set();
  const assign = position => position === candidates.length || candidates[position].some(index => {
    if (used.has(index)) return false;
    used.add(index);
    const fits = assign(position + 1);
    used.delete(index);
    return fits;
  });
  if (!assign(0)) return blocked('dice-combination', 'These letters compete for too few distinct dice in the reference set.');
  return { word, blocked: false, code: 'unexplained', reason: 'Not explained by these dice rules. Adjacency, dictionary differences or gaps in the recorded history may matter.' };
}

export function analyzeUnseenWords(words) {
  const entries = words.map(diceExplanation);
  const blockedCount = entries.filter(entry => entry.blocked).length;
  return { model: 'Reference Big Boggle 5×5 dice; Babble generator not verified', entries, blockedCount, unexplainedCount: entries.length - blockedCount };
}
