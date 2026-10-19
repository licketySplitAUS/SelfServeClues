import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

// SQL Server text reports use fixed-width columns. Names contain spaces, so
// splitting on whitespace would silently shift dates, grids and totals.
export async function readReport(file, visit) {
  let header, columns, count = 0, reported = null, lineNo = 0;
  for await (const line of createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })) {
    lineNo++;
    if (!header) { if (line.trim()) header = line.replace(/^\uFEFF/, ''); continue; }
    if (!columns) {
      if (!/^[- ]+$/.test(line) || !line.includes('---')) throw new Error(`${file}:${lineNo}: missing fixed-width separator`);
      columns = [...line.matchAll(/-+/g)].map(match => ({ name: header.slice(match.index, match.index + match[0].length).trim(), start: match.index, width: match[0].length }));
      continue;
    }
    if (!line.trim()) continue;
    const footer = line.match(/^\((\d+) rows?\(s\) affected\)$/) || line.match(/^\((\d+) rows? affected\)$/);
    if (footer) { reported = Number(footer[1]); continue; }
    if (reported !== null) throw new Error(`${file}:${lineNo}: data after row-count footer`);
    const row = Object.fromEntries(columns.map(({ name, start, width }) => [name, line.slice(start, start + width).trim()]));
    await visit(row, lineNo); count++;
  }
  if (!columns || !count) throw new Error(`${file}: empty or invalid report`);
  if (reported !== null && count !== reported) throw new Error(`${file}: parsed ${count} rows but report declares ${reported}`);
  return count;
}
