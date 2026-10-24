'use strict';
// Run with Electron. Exercises the built admin page against synthetic Discord
// history; no real bot, message content, or cloud writes are used.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
app.setPath('userData', require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'babble-discord-ui-')));
app.disableHardwareAcceleration();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = setTimeout(() => { console.error('Discord UI check timed out'); app.exit(1); }, 40000);
app.whenReady().then(async () => {
  const { previewServer } = await import('./serve.mjs');
  const { summarizeMessages, reportingChannels, testInstallations } = await import('../../netlify/lib/discord-stats.mjs');
  const channels = reportingChannels.slice(0, 2), now = Date.now();
  const message = (title, fields) => ({ timestamp: new Date(now - 10000).toISOString(), embeds: [{ title, fields: Object.entries(fields).map(([name, value]) => ({ name, value })) }] });
  const first = summarizeMessages([
    message('Babble Expert started', { 'Anonymous user': 'Joshua\nBE-MBQX-QRM7' }),
    message('Babble Expert started', { 'Anonymous user': 'Kevin\nBE-JQ9R-MUWL' }),
    message('Babble Expert session ended', { 'Anonymous user': 'Other\nBE-ABCD-EFGH', 'Time in program': '1h 2m 3s', Version: '3.2.12.0', Platform: 'win32 / x64' }),
    message('Page could not load', { 'Anonymous user': 'Other\nBE-ABCD-EFGH', Component: 'clues', 'Error code': '-105', 'Repeated incidents': '3' }),
  ], now - 86400000, now);
  const second = summarizeMessages([message('Babble Expert started', { 'Anonymous user': 'Other\nBE-ABCD-EFGH' })], now - 86400000, now);
  let mode = 'normal', pages = 0;
  const server = previewServer(), staticRequest = server.listeners('request')[0];
  server.removeAllListeners('request');
  server.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/history-api/discord-stats') return staticRequest(req, res);
    const json = (data, status = 200) => { if (!res.destroyed) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); } };
    if (req.headers['x-admin-key'] !== 'ui-test-key') return json({ error: 'Wrong key' }, 403);
    const action = url.searchParams.get('action');
    if (action === 'connection') return json({ bot: 'Lickety Statistics', channels: channels.map(channel => ({ ...channel, readable: true, state: 'ready', message: 'History readable' })) });
    if (action === 'start') { pages = 0; return json({ range: { from: new Date(now - 86400000).toISOString(), to: new Date(now).toISOString(), timeZone: 'Australia/Sydney' }, generatedAt: new Date(now).toISOString(), channels, testInstallations }); }
    pages++;
    if (mode === 'rate' && pages === 2) return json({ error: 'Please wait', retryAfter: 1 }, 429);
    if (mode === 'stop' && pages === 2) await sleep(2000);
    const done = mode === 'normal' || (mode === 'rate' && pages > 2);
    return json({ ...(url.searchParams.get('channel') === channels[0].id ? first : second), done, nextBefore: done ? null : '1561810196253376582', cached: false });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const win = new BrowserWindow({ show: false, width: 1150, height: 950, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, nodeIntegration: false, contextIsolation: true, spellcheck: false } });
  const run = async code => { try { return await win.webContents.executeJavaScript(code); } catch (error) { throw new Error(error.message + '\nScript: ' + code); } };
  const until = async code => { for (let i = 0; i < 180; i++) { if (await run(code)) return; await sleep(40); } throw Error('Timed out: ' + code); };
  const click = label => run(`Array.from(document.querySelectorAll('.discord-activity button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`);
  const metric = label => run(`Array.from(document.querySelectorAll('.discord-metrics>div')).find(el=>el.querySelector('span').textContent===${JSON.stringify(label)}).querySelector('strong').textContent`);
  const selectAudience = value => run(`(()=>{ const select=document.querySelectorAll('.discord-controls select')[1]; select.value=${JSON.stringify(value)}; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/history-admin.html`);
    await until(`!!document.querySelector('.discord-activity')`);
    assert.equal(await run(`Array.from(document.querySelectorAll('.discord-activity button')).every(button=>button.disabled)`), true);
    await run(`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(document.querySelector('input[type=password]'),'ui-test-key'); document.querySelector('input[type=password]').dispatchEvent(new Event('input',{bubbles:true}));`);
    await click('Check bot connection'); await until(`document.querySelector('.discord-activity').textContent.includes('History readable')`);
    await click('Generate statistics'); await until(`document.querySelector('.discord-activity [role=status]').textContent==='Report complete.'`);
    assert.equal(await metric('Discord posts'), '3'); assert.equal(await metric('Expert installations'), '1'); assert.equal(await metric('Total session time'), '1h 2m 3s');
    await selectAudience('tests'); await until(`document.querySelector('.discord-metrics').textContent.includes('Discord posts2')`);
    assert.equal(await metric('Expert installations'), '2');
    await selectAudience('all'); await until(`document.querySelector('.discord-metrics').textContent.includes('Discord posts5')`);
    assert.equal(await metric('Expert installations'), '3');
    await run(`for(const details of document.querySelectorAll('.discord-activity details')) details.open=true; document.querySelector('.discord-activity').scrollIntoView();`);
    assert.ok(await run(`document.querySelector('.discord-activity').textContent.includes('DNS lookup failed')`));
    assert.equal(await run(`document.documentElement.scrollWidth<=innerWidth`), true);
    const out = path.resolve(__dirname, '../../artifacts/discord-stats'); await fs.mkdir(out, { recursive: true });
    await sleep(120); await run(`window.scrollTo(0,document.querySelector('.discord-activity').getBoundingClientRect().top+scrollY-12)`); await sleep(120);
    await fs.writeFile(path.join(out, 'desktop.png'), (await win.webContents.capturePage()).toPNG());
    win.setSize(390, 844); await sleep(150); await run(`window.scrollTo(0,document.querySelector('.discord-activity').getBoundingClientRect().top+scrollY-12)`); await sleep(120);
    assert.equal(await run(`document.documentElement.scrollWidth<=innerWidth`), true, 'Mobile has no horizontal overflow');
    await fs.writeFile(path.join(out, 'mobile.png'), (await win.webContents.capturePage()).toPNG());
    mode = 'rate'; await click('Generate statistics'); await until(`document.querySelector('.discord-activity [role=status]').textContent.includes('resume automatically')`);
    await until(`document.querySelector('.discord-activity [role=status]').textContent==='Report complete.'`);
    assert.equal(await metric('Discord posts'), '9', 'Retrying a rate-limited page does not duplicate its counts');
    mode = 'stop'; await click('Generate statistics'); await until(`document.querySelector('.discord-metrics').textContent.includes('Discord posts4')`);
    await click('Stop'); await until(`document.querySelector('.discord-activity [role=status]').textContent.startsWith('Stopped.')`);
    assert.ok(await run(`document.querySelector('.discord-activity').textContent.includes('Partial report')`));
    assert.equal(await metric('Discord posts'), '4');
    await run(`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(document.querySelector('input[type=password]'),''); document.querySelector('input[type=password]').dispatchEvent(new Event('input',{bubbles:true}));`);
    await until(`!document.querySelector('.discord-metrics')`);
    console.log('PASS: admin lock, bot check, pagination and merging, test filters, rate-limit retry, Stop/partial report, credential clearing, desktop/mobile layout. Screenshots: ' + out);
    win.destroy(); server.close(); clearTimeout(deadline); app.exit(0);
  } catch (error) { console.error(error); server.close(); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
