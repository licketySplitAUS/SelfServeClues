'use strict';
// Exercise the real published-clues UI with local fixtures and a disposable
// profile. Never change a player's found words or contact production services.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'babble-clue-filter-')));
app.disableHardwareAcceleration();
const deadline = setTimeout(() => { console.error('Clue filter check timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const { previewServer } = await import('./serve.mjs');
  const server = previewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const run = code => win.webContents.executeJavaScript(code);
  const until = async code => {
    for (let i = 0; i < 150; i++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 40)); }
    throw Error('Timed out: ' + code);
  };
  const select = index => run(`document.querySelectorAll('input[name=view]')[${index}].click()`);
  const input = (selector, value) => run(`(() => { const field=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(${selector === '#add-word' ? 'HTMLInputElement' : 'HTMLTextAreaElement'}.prototype,'value').set.call(field,${JSON.stringify(value)}); field.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const add = async word => { await input('#add-word', word); await run(`document.querySelector('.addword').click()`); };
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/history-preview.html`);
    await until(`document.querySelectorAll('[data-answer-word]').length===197`);
    const words = await run(`Array.from(document.querySelectorAll('[data-answer-word]')).slice(0,5).map(field=>field.dataset.answerWord)`);
    await select(2);
    await add(words[0]);
    await until(`document.querySelectorAll('[data-answer-word]').length===196`);
    assert.equal(await run(`document.querySelectorAll('input[name=view]')[2].checked`), true, 'Off stays selected after adding a word');
    assert.equal(await run(`!!document.querySelector('[data-answer-word="${words[0]}"]')`), false, 'Newly found clue disappears');
    await run('window.showAll()');
    assert.equal(await run(`document.querySelectorAll('input[name=view]')[2].checked`), true, 'Installed Expert legacy counter refresh preserves Off');
    await add(words[0]); await until(`document.querySelector('.entrymessage').textContent.includes('already added')`);
    await add('zzzzzzzzzz'); await until(`document.querySelector('.entrymessage').textContent.includes('not in this puzzle')`);
    assert.equal(await run(`document.querySelectorAll('input[name=view]')[2].checked`), true, 'Duplicate and invalid entries preserve Off');
    await input('textarea[name=bulkWords]', words.slice(1,3).join('\n'));
    await run(`window.AddBulkWord()`);
    await until(`document.querySelectorAll('[data-answer-word]').length===194`);
    assert.equal(await run(`document.querySelectorAll('input[name=view]')[2].checked`), true, 'Bulk Add preserves Off');
    await select(1); await until(`document.querySelectorAll('[data-answer-word]').length===3`);
    await add(words[3]); await until(`document.querySelectorAll('[data-answer-word]').length===4`);
    assert.equal(await run(`document.querySelectorAll('input[name=view]')[1].checked`), true, 'On stays selected and shows the newly found clue');
    await select(0); await until(`document.querySelectorAll('[data-answer-word]').length===197`);
    await add(words[4]); await until(`document.querySelectorAll('.clues tr.done').length===5`);
    assert.equal(await run(`document.querySelectorAll('input[name=view]')[0].checked`), true, 'All stays selected');
    await select(2); await until(`document.querySelectorAll('[data-answer-word]').length===192`);
    await run('window.showAll()');
    assert.equal(await run(`document.querySelectorAll('input[name=view]')[2].checked`), true, 'Legacy refresh does not reset a filtered list');
    await select(0); await until(`document.querySelectorAll('[data-answer-word]').length===197`);
    assert.equal(await run(`document.querySelectorAll('input[name=view]')[0].checked`), true, 'The All radio still explicitly shows all clues');
    // Reproduce separate-browser progress: 129 shared words plus one word
    // entered only here. Importing 132 shared words must add three, retaining
    // that local-only word; duplicate/unmatched lines must not inflate totals.
    await run('localStorage.clear()');
    await win.loadURL(`http://127.0.0.1:${server.address().port}/history-preview.html`);
    await until(`document.querySelectorAll('[data-answer-word]').length===197`);
    const sourceWords = await run(`Array.from(document.querySelectorAll('[data-answer-word]')).slice(0,133).map(field=>field.dataset.answerWord)`);
    await run(`${JSON.stringify(sourceWords.slice(0,129))}.forEach(word=>window.AddBabbleWord(word))`);
    await add(sourceWords[132]);
    await until(`document.querySelectorAll('.clues tr.done').length===130`);
    const imported = [...sourceWords.slice(0,132), sourceWords[0], 'zzzzzzzzzz'].join('\n');
    await input('textarea[name=bulkWords]', imported); await run('window.AddBulkWord()');
    await until(`document.querySelectorAll('.clues tr.done').length===133`);
    assert.ok(await run(`document.body.textContent.includes('134 words checked, and 3 new words added.')`));
    const exported = await run('window.GetAllWords()');
    assert.equal(new Set(exported.trim().split('\n')).size, 133);
    assert.ok(exported.toUpperCase().includes(sourceWords[132]), 'Bulk Add retains a word entered only in this browser');
    await input('textarea[name=bulkWords]', imported); await run('window.AddBulkWord()');
    await until(`document.body.textContent.includes('134 words checked, and 0 new words added.')`);
    assert.equal(await run(`document.querySelectorAll('.clues tr.done').length`), 133, 'Repeated imports do not double-count words');
    await win.loadURL(`http://127.0.0.1:${server.address().port}/history-preview.html`);
    await until(`document.querySelectorAll('.clues tr.done').length===133`);
    await select(2);
    const nextWord = await run("document.querySelector('[data-answer-word]').dataset.answerWord");
    await run(`window.AddBabbleWord(${JSON.stringify(nextWord)}); window.showAll()`);
    await until(`document.querySelectorAll('[data-answer-word]').length===63`);
    assert.equal(await run(`document.querySelectorAll('input[name=view]')[2].checked`), true, 'Expert 3.3 AddBabbleWord + showAll preserves Off in the same call');
    console.log('PASS: filters survive entry; bulk imports merge 130 found to 133 with three new words, preserve browser-only progress, ignore duplicate/unmatched lines, remain idempotent and persist across reload.');
    win.destroy(); server.close(); clearTimeout(deadline); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); server.close(); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
