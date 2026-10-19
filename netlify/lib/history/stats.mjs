export const emptyAggregate = () => ({ games: 0, totalWords: 0, totalScore: 0, words: {} });

export function adjust(aggregate, game, direction = 1) {
  aggregate.games += direction;
  aggregate.totalWords += game.totalWords * direction;
  aggregate.totalScore += game.totalScore * direction;
  for (const item of game.words) {
    // Keep historical scores rather than silently recalculating legacy records.
    const key = `${item.word}|${item.score}`;
    const count = (aggregate.words[key] || 0) + direction;
    if (count < 0) throw new Error('History counters would become negative.');
    if (count) aggregate.words[key] = count; else delete aggregate.words[key];
  }
  return aggregate;
}

export const meta = ({ words, ...game }) => game;

export function summarize(aggregate, games, dictionary) {
  const rows = Object.entries(aggregate.words).map(([key, count]) => {
    const [word, score] = key.split('|');
    return { word, score: Number(score), length: word.length, count };
  });
  const byWord = new Map(), lengths = {}, starts = {}, dictionaryLengths = {};
  for (const row of rows) {
    byWord.set(row.word, (byWord.get(row.word) || 0) + row.count);
    lengths[row.length] = (lengths[row.length] || 0) + row.count;
    starts[row.word[0]] = (starts[row.word[0]] || 0) + row.count;
  }
  for (const word of dictionary) dictionaryLengths[word.length] = (dictionaryLengths[word.length] || 0) + 1;
  const uniqueLengths = {};
  for (const word of byWord.keys()) uniqueLengths[word.length] = (uniqueLengths[word.length] || 0) + 1;
  const frequent = [];
  for (const length of [...new Set(rows.map(row => row.length))].sort((a, b) => a - b)) {
    const list = rows.filter(row => row.length === length).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
    // The original page prints up to 13 tied winners per length, only if repeated.
    if (list[0]?.count > 1) frequent.push(...list.filter(row => row.count === list[0].count).slice(0, 13));
  }
  const orderedGames = [...games].sort((a, b) => b.puzzle - a.puzzle || b.gameId - a.gameId);
  const alphabet = Object.entries(starts).map(([letter, count]) => ({ letter, count }));
  const longest = [...rows].sort((a, b) => b.length - a.length || a.word.localeCompare(b.word));
  const highest = [...rows].sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
  // SQL's historical top 13 queries did not use DISTINCT: preserve occurrences.
  const occurrences = list => list.flatMap(row => Array.from({ length: Math.min(13, row.count) }, () => row)).slice(0, 13);
  const sizes = Object.keys(dictionaryLengths).map(Number).sort((a, b) => a - b);
  return {
    gameCount: aggregate.games, uniqueWords: byWord.size,
    averageWords: aggregate.games ? aggregate.totalWords / aggregate.games : 0,
    legacyAverageWords: aggregate.games ? Math.trunc(aggregate.totalWords / aggregate.games) : 0,
    largest: [...orderedGames].sort((a, b) => b.totalWords - a.totalWords)[0] || null,
    smallest: [...orderedGames].sort((a, b) => a.totalWords - b.totalWords)[0] || null,
    recent: orderedGames.slice(0, 13), frequent,
    longest: occurrences(longest), highest: occurrences(highest),
    commonLetters: [...alphabet].sort((a, b) => b.count - a.count || a.letter.localeCompare(b.letter)).slice(0, 3),
    rareLetters: [...alphabet].sort((a, b) => a.count - b.count || a.letter.localeCompare(b.letter)).slice(0, 3),
    appearancesByLength: Object.entries(lengths).map(([length, count]) => ({ length: Number(length), count })),
    dictionaryCoverage: sizes.filter(length => length <= 12).map(length => ({ length: String(length), seen: uniqueLengths[length] || 0, searched: dictionaryLengths[length] })),
    over12: { length: '>12', seen: Object.entries(uniqueLengths).reduce((n, [length, count]) => n + (Number(length) > 12 ? count : 0), 0), searched: sizes.reduce((n, length) => n + (length > 12 ? dictionaryLengths[length] : 0), 0) },
    dictionaryCount: dictionary.length,
  };
}

export function snapshotFor(aggregate, games, current, dictionary, extra = {}) {
  const history = structuredClone(aggregate);
  adjust(history, current, -1);
  const counts = {}, prefixes = {}, starts = {};
  for (const row of current.words) {
    for (const [map, key] of [[counts, row.word.length], [prefixes, row.word.slice(0, 2)], [starts, row.word[0]]]) {
      map[key] ||= { count: 0, score: 0 };
      map[key].count++; map[key].score += row.score;
    }
  }
  return { schemaVersion: 1, ...extra, current, today: { counts, prefixes, starts },
    history: summarize(history, games.filter(game => game.puzzle !== current.puzzle), dictionary) };
}
