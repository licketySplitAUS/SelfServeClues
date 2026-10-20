import { randomUUID } from 'node:crypto';
import { validIdentity } from './history/solver.mjs';

const sql = value => value == null ? 'NULL' : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : `N'${String(value).replaceAll("'", "''")}'`;
const insert = (table, rows) => rows.length ? `INSERT INTO BabbleRecovery.${table} VALUES\n${rows.map(row => '(' + row.map(sql).join(',') + ')').join(',\n')};\n` : '';

// SQL Server staging only. Never mutate the legacy dbo tables or invent IDs.
export function* sqlExport(games, corrections = {}, exportID = randomUUID()) {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(exportID)) throw new Error('Invalid export ID');
  yield `-- Babble recovery staging export ${exportID}\n-- Select a recovery database before running. No dbo tables are modified.\nSET NOCOUNT ON;\nSET XACT_ABORT ON;\nIF SCHEMA_ID(N'BabbleRecovery') IS NULL EXEC(N'CREATE SCHEMA BabbleRecovery');\nIF OBJECT_ID(N'BabbleRecovery.Games', N'U') IS NULL CREATE TABLE BabbleRecovery.Games (ExportID nvarchar(64) NOT NULL, SourceGameID int NULL, BabbleGameNo int NOT NULL, Name nvarchar(300) NULL, StartDateTime date NOT NULL, Grid varchar(25) NOT NULL, TotalWords int NOT NULL, TotalScore int NOT NULL, PRIMARY KEY (ExportID,BabbleGameNo));\nIF OBJECT_ID(N'BabbleRecovery.Words', N'U') IS NULL CREATE TABLE BabbleRecovery.Words (ExportID nvarchar(64) NOT NULL, BabbleGameNo int NOT NULL, word varchar(50) NOT NULL, wordSize int NOT NULL, wordScore int NOT NULL, startRow int NULL, startCol int NULL, PRIMARY KEY (ExportID,BabbleGameNo,word));\nIF OBJECT_ID(N'BabbleRecovery.Corrections', N'U') IS NULL CREATE TABLE BabbleRecovery.Corrections (ExportID nvarchar(64) NOT NULL, word varchar(50) NOT NULL, Action varchar(20) NOT NULL, Reason nvarchar(300) NULL, ChangedAt nvarchar(40) NULL, PRIMARY KEY (ExportID,word));\nBEGIN TRANSACTION;\n-- Same-file reruns replace this export batch only.\nDELETE FROM BabbleRecovery.Words WHERE ExportID=${sql(exportID)};\nDELETE FROM BabbleRecovery.Games WHERE ExportID=${sql(exportID)};\nDELETE FROM BabbleRecovery.Corrections WHERE ExportID=${sql(exportID)};\n`;
  const seen = new Set();
  for (const game of games) {
    // Two canonical legacy records have corrupt tile strings. Preserve those
    // verbatim for archival recovery; they cannot be used to solve a puzzle.
    if (!Number.isSafeInteger(game.puzzle) || game.puzzle < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(game.date || '') || typeof game.letters !== 'string' || game.letters.length > 25 || seen.has(game.puzzle) || !Array.isArray(game.words)) throw new Error('Invalid or duplicate puzzle in SQL export.');
    seen.add(game.puzzle);
    const words = [...new Map(game.words.map(row => [row.word, row])).values()];
    for (const row of words) if (!/^[a-z]{4,50}$/.test(row.word) || !Number.isSafeInteger(row.score) || row.score < 0 || [row.startRow, row.startCol].some(n => n != null && !Number.isSafeInteger(n))) throw new Error('Invalid word in SQL export.');
    yield insert('Games', [[exportID, game.gameId ?? null, game.puzzle, game.name || `Puzzle ${game.puzzle}`, game.date, game.letters, words.length, words.reduce((n, row) => n + row.score, 0)]]);
    for (let i = 0; i < words.length; i += 500) yield insert('Words', words.slice(i, i + 500).map(row => [exportID, game.puzzle, row.word, row.word.length, row.score, row.startRow ?? null, row.startCol ?? null]));
  }
  const rows = Object.entries(corrections).map(([word, row]) => {
    if (!/^[a-z]{4,50}$/.test(word) || !['include', 'exclude'].includes(row.action)) throw new Error('Invalid correction.');
    return [exportID, word, row.action, row.reason?.slice(0, 300), row.changedAt];
  });
  for (let i = 0; i < rows.length; i += 500) yield insert('Corrections', rows.slice(i, i + 500));
  yield 'COMMIT TRANSACTION;\n';
}

const html = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function emergencyPage(game) {
  if (!validIdentity(game) || !Array.isArray(game.words)) throw new Error('No complete puzzle for the emergency page.');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Babble clues · ${game.date}</title>
<style>body{max-width:760px;margin:2rem auto;padding:0 1rem;background:#f1d998;color:#251d17;font:18px Georgia,serif}main{background:white;padding:1.5rem;border-radius:12px}a{color:#a32617}table{border-collapse:collapse;margin:1rem 0}td{background:#f9dc20;border:3px solid white;text-align:center;font:bold 24px sans-serif;width:44px;height:44px}.clue{display:flex;gap:.5rem;align-items:center;margin:.4rem 0}.clue span{width:85px}.clue:has(input:checked){opacity:.45}.clue input[type=text]{width:130px;font-size:18px}small{display:block;margin-top:1.5rem}@media print{body{background:white;margin:0}details{display:none}}</style>
<main><h1>Babble clues</h1><p>Puzzle #${game.puzzle} · ${game.date} · ${game.words.length} words · ${game.words.reduce((n, row) => n + row.score, 0)} points</p><p>Emergency snapshot. This file does not fetch a new puzzle. Saved validation: ${html(game.validation?.status || 'not recorded')}.</p><table aria-label="Puzzle grid">${Array.from({ length: 5 }, (_, r) => '<tr>' + [...game.letters.slice(r * 5, r * 5 + 5)].map(c => `<td>${c === 'Q' ? 'Qu' : c}</td>`).join('') + '</tr>').join('')}</table>
<p><a href="javascript:window.print()">Print clues</a></p>${[...game.words].sort((a, b) => a.word.localeCompare(b.word)).map(row => `<label class="clue"><span>${html(row.word.slice(0, 2))}${row.word.length},${row.score}</span><input type="checkbox" aria-label="Mark ${html(row.word.slice(0, 2))}, ${row.word.length} letters"><input type="text" value="${html(row.word.slice(0, 2))}" aria-label="Answer"></label>`).join('')}<details><summary>Answers (spoilers)</summary><p>${game.words.map(row => html(row.word)).sort().join(', ')}</p></details><small>Since 18/04/06 · Lickety’s Babble clues. Checks and answers in this emergency page reset when it is refreshed.</small></main></html>`;
}
