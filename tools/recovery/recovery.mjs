import fs from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync, createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { getStore } from '@netlify/blobs';
import { downloadRecovery } from '../../shared/recovery-download.mjs';
import { verifyBackup, restoreBackup, digest } from '../../netlify/lib/recovery.mjs';
import { sqlExport, emergencyPage } from '../../netlify/lib/recovery-exports.mjs';
import { solveGrid, validIdentity } from '../../netlify/lib/history/solver.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [command, ...args] = process.argv.slice(2);
function option(name, fallback) { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; }
const load = async file => JSON.parse(gunzipSync(await fs.readFile(file)));
async function exclusive(file, data) { await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true }); await fs.writeFile(file, data, { flag: 'wx' }); }
async function backup() {
  const origin = option('origin', 'https://selfserve.r46.me');
  if (!/^https:\/\//.test(origin)) throw new Error('Use an HTTPS origin.');
  const key = process.env.HISTORY_PREVIEW_ADMIN_KEY || (option('key-file') && (await fs.readFile(option('key-file'), 'utf8')).trim());
  if (!key) throw new Error('Set HISTORY_PREVIEW_ADMIN_KEY or supply --key-file (never put the key in arguments).');
  const data = await downloadRecovery(origin.replace(/\/$/, ''), key, (done, total) => { if (done % 25 === 0 || done === total) process.stderr.write(`Backup ${done}/${total}\n`); });
  const result = verifyBackup(data);
  const output = option('out');
  if (!output) throw new Error('Specify --out <runtime.json.gz>.');
  await exclusive(output, gzipSync(JSON.stringify(data), { level: 9 }));
  console.log(`Verified ${result.count} objects; saved ${output}. Secret values are excluded.`);
}
function* allGames(backup, baseline) {
  const state = verifyBackup(backup).state;
  if (baseline.sourceVersion !== backup.inventory.baselineVersion) throw new Error('Use the imported baseline matching this backup.');
  const dynamic = state?.puzzles || {};
  const selected = new Map(baseline.games.filter(game => !dynamic[game.puzzle]).map(game => [game.gameId, game]));
  for (const file of readdirSync(path.join(root, 'data/history/archives')).filter(file => file.endsWith('.json.gz')).sort()) {
    for (const raw of JSON.parse(gunzipSync(readFileSync(path.join(root, 'data/history/archives', file))))) {
      const meta = selected.get(raw.gameId);
      if (meta) { yield { ...meta, words: raw.words }; selected.delete(raw.gameId); }
    }
  }
  if (selected.size) throw new Error('Some baseline games were missing from the archives.');
  yield* Object.values(dynamic);
}
async function exportSQL(data, output, scope) {
  if (!['current', 'delta', 'all'].includes(scope) || !output) throw new Error('SQL export requires --scope current|delta|all and --out <file.sql.gz>.');
  const { state, snapshot } = verifyBackup(data);
  const baseline = JSON.parse(gunzipSync(await fs.readFile(path.join(root, 'data/history/baseline.json.gz'))));
  const games = scope === 'all' ? allGames(data, baseline) : scope === 'delta' ? Object.values(state?.puzzles || {}) : [snapshot?.current || baseline.current];
  await pipeline(Readable.from(sqlExport(games, state?.corrections || {})), createGzip({ level: 9 }), createWriteStream(output, { flags: 'wx' }));
}
async function pack() {
  const input = option('input'), output = path.resolve(option('out', 'recovery-backups/' + new Date().toISOString().replaceAll(/[:.]/g, '-')));
  if (!input) throw new Error('Specify --input <runtime.json.gz>.');
  const data = await load(input); verifyBackup(data);
  const packedBaseline = JSON.parse(gunzipSync(await fs.readFile(path.join(root, 'data/history/baseline.json.gz'))));
  if (packedBaseline.sourceVersion !== data.inventory.baselineVersion) throw new Error('Use the source checkout matching this backup baseline.');
  // A fresh directory prevents mixing files from different exports.
  await fs.mkdir(output, { recursive: false });
  await fs.copyFile(input, path.join(output, 'runtime.json.gz'));
  await fs.cp(path.join(root, 'data/history'), path.join(output, 'imported-history'), { recursive: true });
  await fs.cp(path.join(root, 'docs'), path.join(output, 'docs'), { recursive: true });
  const sources = [{ name: 'SelfServeClues', directory: root }];
  for (const [name, flag] of [['Babble', 'legacy-repo'], ['BabbleExpert', 'expert-repo']]) if (option(flag)) sources.push({ name, directory: path.resolve(option(flag)) });
  const repositories = [];
  for (const source of sources) {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source.directory, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: source.directory, encoding: 'utf8' }).trim().length > 0;
    // Bundles include committed objects/refs only; never untracked credentials.
    execFileSync('git', ['bundle', 'create', path.join(output, `${source.name}.bundle`), '--all'], { cwd: source.directory, stdio: 'pipe' });
    repositories.push({ name: source.name, head, uncommittedChangesExcluded: dirty });
  }
  await exportSQL(data, path.join(output, 'all-canonical-grids.sql.gz'), 'all');
  const { snapshot } = verifyBackup(data);
  const baseline = JSON.parse(gunzipSync(await fs.readFile(path.join(root, 'data/history/baseline.json.gz'))));
  await fs.writeFile(path.join(output, 'babbleclues.html'), emergencyPage(snapshot?.current || baseline.current));
  await fs.writeFile(path.join(output, 'README.txt'), `BABBLE RECOVERY PACK\nCreated ${new Date().toISOString()}\n\nStart with docs/DISASTER-RECOVERY.md.\nruntime.json.gz: all inventoried runtime objects; excludes new visits after inventory.\nimported-history/: original imported baseline and annual raw archives.\n*.bundle: committed Git histories; clone with git clone SelfServeClues.bundle SelfServeClues\nall-canonical-grids.sql.gz: SQL Server recovery STAGING tables, not a native .bak.\nbabbleclues.html: standalone current-puzzle clues, no external requests.\n\nNOT INCLUDED: secret values, DNS/registrar account, Netlify account/project configuration, SQL Server schema/procedures/jobs/.bak, untracked Delphi source and browser progress. Save these separately. Keep this pack private and copy it to an independent device/provider.\n`);
  const files = {};
  async function walk(folder) {
    for (const item of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, item.name);
      if (item.isDirectory()) await walk(file);
      else files[path.relative(output, file).replaceAll('\\', '/')] = digest(await fs.readFile(file));
    }
  }
  await walk(output);
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), baselineVersion: data.inventory.baselineVersion, exportedAt: data.inventory.exportedAt, repositories, files }, null, 2));
  console.log(`Recovery pack: ${output}\n${Object.keys(files).length} files checksummed. Copy this folder off this drive.`);
}
async function main() {
  if (command === 'backup') return backup();
  if (command === 'pack') return pack();
  if (command === 'verify-pack') {
    const folder = path.resolve(option('input')), manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json')));
    if (manifest.schemaVersion !== 1 || !manifest.files || !manifest.files['runtime.json.gz'] || !manifest.files['imported-history/baseline.json.gz'] || !manifest.files['SelfServeClues.bundle']) throw new Error('Incomplete recovery pack manifest.');
    for (const [name, hash] of Object.entries(manifest.files)) {
      const target = path.resolve(folder, name);
      if (!target.startsWith(folder + path.sep) || digest(await fs.readFile(target)) !== hash) throw new Error(`Invalid file/checksum: ${name}`);
    }
    const runtime = await load(path.join(folder, 'runtime.json.gz'));
    verifyBackup(runtime);
    const baseline = JSON.parse(gunzipSync(await fs.readFile(path.join(folder, 'imported-history/baseline.json.gz'))));
    if (baseline.sourceVersion !== runtime.inventory.baselineVersion || manifest.baselineVersion !== baseline.sourceVersion) throw new Error('Pack baseline does not match runtime data.');
    console.log(`Verified ${Object.keys(manifest.files).length} files and runtime references.`); return;
  }
  const input = option('input');
  if (!input) throw new Error('Commands: backup, pack, verify, verify-pack, sql, static, restore. See docs/DISASTER-RECOVERY.md.');
  const data = await load(input), result = verifyBackup(data);
  if (command === 'solve') {
    const baseline = JSON.parse(gunzipSync(await fs.readFile(path.join(root, 'data/history/baseline.json.gz'))));
    if (baseline.sourceVersion !== data.inventory.baselineVersion) throw new Error('Use the baseline matching this backup.');
    const grid = { puzzle: Number(option('puzzle')), date: option('date'), letters: (option('letters', '')).replace(/\s/g, '').toUpperCase() };
    if (!validIdentity(grid) || !option('out')) throw new Error('Solve requires --puzzle <number> --date YYYY-MM-DD --letters <25 tiles> --out <clues.html>.');
    const dictionary = new Set(baseline.dictionary);
    for (const [word, row] of Object.entries(result.state?.corrections || {})) {
      if (row.action === 'exclude') dictionary.delete(word); else if (row.action === 'include') dictionary.add(word);
    }
    const words = solveGrid(grid.letters, [...dictionary]);
    if (!words.length) throw new Error('No words found; check the grid.');
    const game = { ...grid, gameId: grid.puzzle, words, totalWords: words.length, totalScore: words.reduce((n, row) => n + row.score, 0), solvedAt: new Date().toISOString(), validation: { status: 'UNVERIFIED offline solution — compare official totals before publishing' } };
    await exclusive(option('out'), emergencyPage(game));
    await exclusive(option('out') + '.game.json', JSON.stringify(game, null, 2));
    if (option('sql-out')) await pipeline(Readable.from(sqlExport([game], result.state?.corrections || {})), createGzip(), createWriteStream(option('sql-out'), { flags: 'wx' }));
    console.log(`Offline solution: ${words.length} words, ${game.totalScore} points. Not officially validated. Keep the .game.json for reconciliation.`); return;
  }
  if (command === 'verify') { console.log(JSON.stringify({ records: result.count, baselineVersion: data.inventory.baselineVersion, exportedAt: data.inventory.exportedAt, puzzle: result.snapshot?.current?.puzzle })); return; }
  if (command === 'sql') { await exportSQL(data, option('out'), option('scope', 'current')); return; }
  if (command === 'static') { await exclusive(option('out', 'babbleclues.html'), emergencyPage(result.snapshot?.current || JSON.parse(gunzipSync(await fs.readFile(path.join(root, 'data/history/baseline.json.gz')))).current)); return; }
  if (command === 'restore') {
    const siteID = option('site');
    if (!/^[a-f0-9-]{36}$/.test(siteID || '') || !process.env.NETLIFY_AUTH_TOKEN) throw new Error('Supply --site <target UUID> and NETLIFY_AUTH_TOKEN.');
    // Restore to a NEW site only. The source site must never be overwritten.
    if (siteID === data.inventory.siteID) throw new Error('Restore to a new site, not the source production site.');
    const apply = args.includes('--apply');
    if (apply && option('confirm-site') !== siteID) throw new Error('Apply requires --confirm-site <same target UUID>.');
    console.log(await restoreBackup(data, name => getStore({ name, siteID, token: process.env.NETLIFY_AUTH_TOKEN, consistency: 'strong' }), apply)); return;
  }
  throw new Error('Unknown command.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
