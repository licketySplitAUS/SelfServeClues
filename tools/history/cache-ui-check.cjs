'use strict';
// Local Chromium HTTP-cache regression: two real Vite builds, a disposable
// profile, and synthetic API replies. This does not deploy or contact cloud APIs.
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { createHash } = require('node:crypto'), { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const cliRequire = createRequire(path.join(root, 'node_modules/netlify-cli/package.json'));
const config = cliRequire('smol-toml').parse(fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8'));
const defaultPolicy = 'public, max-age=0, must-revalidate';
function policy(url) {
  let value = defaultPolicy;
  for (const rule of config.headers || []) {
    if (rule.for === url || (rule.for.endsWith('/*') && url.startsWith(rule.for.slice(0, -1)))) {
      value = Object.entries(rule.values).find(([key]) => key.toLowerCase() === 'cache-control')?.[1] || value;
    }
  }
  return value;
}
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'babble-cache-check-')));
app.disableHardwareAcceleration();
const deadline = setTimeout(() => { console.error('Cache check timed out'); app.exit(1); }, 60000);
app.whenReady().then(async () => {
  const { build } = await import('vite');
  async function version(marker) {
    const result = await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'silent',
      build: { write: false, emptyOutDir: false }, plugins: [{ name: 'cache-regression-marker',
        transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/src/history/admin-main.tsx')) return code + `\nwindow.__cacheRegressionVersion=${JSON.stringify(marker)};\n`; },
      }] });
    const files = new Map(result.output.map(file => ['/' + file.fileName, Buffer.from(file.type === 'chunk' ? file.code : file.source)]));
    for (const name of files.keys()) if (name.startsWith('/assets/')) {
      assert.match(name, /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/u, 'Long-lived assets have content-fingerprinted filenames');
      assert.match(policy(name), /max-age=31536000.*immutable/u);
    }
    return files;
  }
  const first = await version('A'), second = await version('B');
  for (const url of ['/index.html', '/history-preview.html', '/history-admin.html', '/clues-celebration.js', '/browser-identity.js', '/clues-publication.json', '/history-api/current', '/history-api/publication', '/api/wordlist']) {
    assert.doesNotMatch(policy(url), /immutable|31536000/u, url + ' must not inherit long-lived asset caching');
  }
  let deployed = first, generation = 'A';
  const requests = new Map(), windows = [], errors = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    requests.set(url.pathname, (requests.get(url.pathname) || 0) + 1);
    if (url.pathname === '/history-api/current' && url.searchParams.has('cache-check')) {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' });
      return res.end(JSON.stringify({ generation }));
    }
    if (url.pathname.startsWith('/history-api/') || url.pathname.startsWith('/api/')) {
      res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ error: 'Offline cache fixture; cloud actions are disabled.' }));
    }
    const body = deployed.get(url.pathname);
    if (!body) { res.writeHead(404, { 'cache-control': 'no-store' }); return res.end('Not found'); }
    const tag = '"' + createHash('sha256').update(body).digest('hex') + '"';
    const headers = { 'cache-control': policy(url.pathname), etag: tag,
      'content-type': url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html' };
    if (req.headers['if-none-match'] === tag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, headers); res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cacheSession = session.fromPartition('persist:cache-regression');
  cacheSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(base + '/') && !details.url.startsWith('data:') }));
  async function open(expected) {
    const win = new BrowserWindow({ show: false, webPreferences: { session: cacheSession, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    windows.push(win);
    win.webContents.on('render-process-gone', (_event, detail) => errors.push(detail.reason));
    await win.loadURL(base + '/history-admin.html');
    const marker = await win.webContents.executeJavaScript('window.__cacheRegressionVersion');
    assert.equal(marker, expected);
    return win;
  }
  const assetCounts = () => new Map([...requests].filter(([url]) => url.startsWith('/assets/')));
  const probe = win => win.webContents.executeJavaScript("fetch('/history-api/current?cache-check=1',{cache:'no-store'}).then(response=>response.json())");
  try {
    const cold = await open('A'), coldAssets = assetCounts();
    assert.ok(coldAssets.size > 0, 'Cold load downloads real application assets');
    await cacheSession.cookies.set({ url: base, name: 'fixture-login', value: 'preserved' });
    await cold.webContents.executeJavaScript("localStorage.setItem('fixture-progress','retained')");
    const warm = await open('A');
    assert.deepEqual(assetCounts(), coldAssets, 'Warm navigation reuses immutable assets without network requests');
    assert.equal(await warm.webContents.executeJavaScript("localStorage.getItem('fixture-progress')"), 'retained');
    assert.equal((await probe(warm)).generation, 'A');
    deployed = second; generation = 'B';
    const updated = await open('B');
    assert.equal(await cold.webContents.executeJavaScript('window.__cacheRegressionVersion'), 'A', 'Existing open document is undisturbed');
    assert.ok([...assetCounts()].some(([url]) => !coldAssets.has(url)), 'Changed source produces and downloads a new hashed bundle');
    for (const [url, count] of coldAssets) if (second.has(url)) assert.equal(requests.get(url), count, 'Unchanged assets stay cached across the update');
    assert.equal((await probe(warm)).generation, 'B', 'Live no-store request sees a changed puzzle generation despite a fresh HTTP-cache entry');
    assert.equal(await updated.webContents.executeJavaScript("localStorage.getItem('fixture-progress')"), 'retained');
    assert.equal((await cacheSession.cookies.get({ name: 'fixture-login' }))[0].value, 'preserved');
    const afterUpdate = assetCounts(); await open('B');
    assert.deepEqual(assetCounts(), afterUpdate, 'Updated version also becomes a warm cache hit');
    assert.ok(requests.get('/history-admin.html') >= 4, 'HTML is revalidated on each navigation');
    const beforeBypass = assetCounts();
    const reloaded = new Promise(resolve => updated.webContents.once('did-finish-load', resolve));
    updated.webContents.reloadIgnoringCache(); await reloaded;
    assert.equal(await updated.webContents.executeJavaScript('window.__cacheRegressionVersion'), 'B');
    assert.ok([...assetCounts()].some(([url, count]) => count > (beforeBypass.get(url) || 0)), 'Explicit cache-bypass reload reaches the server');
    const beforeClear = assetCounts(); await cacheSession.clearCache();
    const cleared = await open('B');
    assert.ok([...assetCounts()].some(([url, count]) => count > (beforeClear.get(url) || 0)), 'Clear cached files causes assets to be downloaded again');
    assert.equal((await cacheSession.cookies.get({ name: 'fixture-login' }))[0].value, 'preserved');
    assert.equal(await cleared.webContents.executeJavaScript("localStorage.getItem('fixture-progress')"), 'retained');
    assert.deepEqual(errors, []);
    console.log('PASS: real Vite filenames change with content; cold/warm Chromium cache; fresh HTML after update; unchanged assets reused; live data refreshed; cookies/progress retained; warm updated version; explicit bypass and cache clearing; sensitive/unversioned paths excluded.');
    console.log('LIMIT: local server models netlify.toml headers and Netlify default HTML revalidation; production CDN/proxy behaviour requires verification after deployment.');
  } finally { for (const win of windows) win.destroy(); server.close(); clearTimeout(deadline); }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
