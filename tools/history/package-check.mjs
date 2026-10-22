import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Use the installed Netlify CLI's real packaging engine without account login,
// telemetry, API calls, or deployments.
const cliRequire = createRequire(path.join(root, 'node_modules/netlify-cli/package.json'));
const { zipFunctions } = await import(pathToFileURL(cliRequire.resolve('@netlify/zip-it-and-ship-it')).href);
const directory = path.join(root, 'artifacts/history-packages');
await fs.mkdir(directory, { recursive: true });
const results = await zipFunctions(path.join(root, 'netlify/functions'), directory, {
  basePath: root, repositoryRoot: root,
  config: { 'history-*': { nodeBundler: 'esbuild' }, ...Object.fromEntries(['history-admin', 'history-current', 'history-process', 'history-recovery', 'history-unseen-words'].map(name => [name, { includedFiles: ['data/history/**'], includedFilesBasePath: root, nodeBundler: 'esbuild' }])) },
});
for (const result of results.filter(item => item.name.startsWith('history-'))) {
  assert.ok(result.size < 10000000, 'History function package remains small');
  console.log(JSON.stringify({ name: result.name, size: result.size, runtime: result.runtime, schedule: result.schedule, routes: result.routes, path: result.path }));
}
assert.ok(results.find(item => item.name === 'clues-version')?.size < 500000, 'Version checks must not bundle the dictionary or puzzle archive');
for (const name of ['history-chat-settings', 'history-publication', 'history-launch', 'history-tick', 'expert-diagnostics']) assert.ok(results.find(item => item.name === name)?.size < 500000, `${name} must remain lightweight`);
assert.equal(results.find(item => item.name === 'history-tick')?.schedule, '* 5-7 * * *');
assert.equal(results.find(item => item.name === 'history-launch')?.schedule, '* 5-6 22 10 *');
assert.equal(results.some(item => item.name === 'history-retry'), false);
assert.equal(results.some(item => item.name === 'history-flip-summary'), false);
console.log('PASS: Netlify function bundling, schedule and route extraction; no network or deployment performed.');
