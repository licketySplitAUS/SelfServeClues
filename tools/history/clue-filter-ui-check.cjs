'use strict';
// Exercise the real published-clues UI with local fixtures and a disposable
// profile. Never change a player's found words or contact production services.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'babble-clue-filter-')));
app.disableHardwareAcceleration();
const deadline = setTimeout(() => { console.error('Clue filter check timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const { previewServer } = await import('./serve.mjs');
  const server = previewServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  if (process.env.BABBLE_EXPERT_PRELOAD) ipcMain.handle('create-clues:enabled', () => false);
  const win = new BrowserWindow({ show: false, webPreferences: { preload: process.env.BABBLE_EXPERT_PRELOAD || undefined, offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    callback({ cancel: !['127.0.0.1', 'localhost'].includes(new URL(details.url).hostname) });
  });
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
    await select(0);
    const slotWords = await run(`Array.from(document.querySelectorAll('[data-answer-word]')).filter(field=>!field.closest('tr').classList.contains('done')).slice(0,3).map(field=>field.dataset.answerWord)`);
    const editSlot = async (word, value) => {
      await run(`(() => { const field=document.querySelector('[data-answer-word="${word}"]'); field.focus(); field.select(); })()`);
      await win.webContents.insertText(value);
    };
    const enter = async () => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      await run('0');
    };
    await editSlot(slotWords[0], slotWords[1].toLowerCase()); await enter();
    assert.equal(await run(`document.querySelector('[data-answer-word="${slotWords[0]}"]').closest('tr').querySelector('input[type=checkbox]').checked`), false, 'A different valid word does not tick this slot');
    await editSlot(slotWords[0], ` ${slotWords[0].toLowerCase()} `); await enter();
    await until(`document.querySelector('[data-answer-word="${slotWords[0]}"]').closest('tr').querySelector('input[type=checkbox]').checked`);
    assert.equal(await run('document.activeElement.dataset.answerWord'), slotWords[0], 'First Enter checks the word and keeps focus');
    await enter();
    assert.equal(await run('document.activeElement.dataset.answerWord'), slotWords[1], 'Second Enter selects the next unsolved slot');
    await editSlot(slotWords[1], slotWords[1].toLowerCase());
    await run(`document.querySelector('#add-word').focus()`);
    await until(`document.querySelector('[data-answer-word="${slotWords[1]}"]').closest('tr').querySelector('input[type=checkbox]').checked`);
    await select(2);
    await editSlot(slotWords[2], slotWords[2].toLowerCase()); await enter();
    await until(`!document.querySelector('[data-answer-word="${slotWords[2]}"]')`);
    await enter();
    assert.ok(await run(`!!document.activeElement.dataset.answerWord`), 'Second Enter continues after Off removes the completed row');
    await win.loadURL(`http://127.0.0.1:${server.address().port}/history-preview.html`);
    await until(`typeof window.GetAllWords==='function' && window.GetAllWords().toUpperCase().includes('${slotWords[0]}')`);
    assert.ok((await run('window.GetAllWords()')).toUpperCase().includes(slotWords[0]), 'Slot entries persist across reload');
    // Optional real legacy source from the sibling Babble checkout. Inject the
    // shared asset locally, as its production build transform would load it.
    if (process.env.BABBLE_LEGACY_CLUES) {
      await win.loadFile(process.env.BABBLE_LEGACY_CLUES);
      await run(fs.readFileSync(path.resolve(__dirname, '../../public/clue-slot-entry.js'), 'utf8'));
      const legacyWord = await run('decrypt(lWordArray[0])');
      await run(`document.myForm.edt1.focus(); document.myForm.edt1.select()`);
      await win.webContents.insertText(legacyWord.toUpperCase()); await enter();
      assert.equal(await run('document.myForm.check1.checked'), true, 'Real legacy slot checks its answer');
      assert.equal(await run('document.activeElement.name'), 'edt1');
      await enter();
      assert.equal(await run('document.activeElement.name'), 'edt2', 'Real legacy double Enter advances');
      assert.ok((await run('GetAllWords()')).includes(legacyWord), 'Legacy bridge exports the slot entry');
      await run('showOff(); document.myForm.edt2.focus(); document.myForm.edt2.select()');
      await win.webContents.insertText(await run('decrypt(lWordArray[1])')); await enter();
      assert.equal(await run('lShow'), 3, 'Legacy checking preserves Off view');
      await enter();
      assert.equal(await run('document.activeElement.name'), 'edt3', 'Legacy Off skips the hidden completed slot');
      console.log('PASS: real legacy source slot checking, export and double Enter in All and Off.');
    }
    console.log('PASS: filters, bulk merge and persistence; exact-slot answers check on Enter/blur, double Enter advances, and Off view continues after removing a completed row.');
    win.destroy(); server.close(); clearTimeout(deadline); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); server.close(); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
