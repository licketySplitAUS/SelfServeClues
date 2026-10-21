"use strict";
const guides = {"windows": [["Download Babble Expert", "Click the yellow button below. Wait for the download to finish before moving on.", "Download for Windows", "The file is called BabbleExpert-Windows-Setup.exe. Keep this guide open while you install.", "download", "BabbleExpert-Windows-Setup.exe"], ["Open the downloaded file", "Open File Explorer (the yellow folder on your taskbar), then choose Downloads. Double-click BabbleExpert-Windows-Setup.exe.", "", "If your browser already shows the finished download, you can click it there instead. If installation starts without a warning, skip to step 5.", "downloads", "BabbleExpert-Windows-Setup.exe"], ["If Windows stops you, click “More info”", "If you see “Windows protected your PC”, look for the small More info link. Click it once.", "", "This is the unrecognised-app prompt. If your computer reports a virus or threat instead, stop and contact lickety.", "more", "More info"], ["Check the name, then click “Run anyway”", "Check that the app is BabbleExpert-Windows-Setup.exe. If you trust this download, click Run anyway.", "", "An unsigned app may show “Unknown publisher”. If Run anyway is missing, open “My screen looks different / I’m stuck” below.", "run", "Run anyway"], ["Let it install — then enjoy Babble Expert", "The installer normally runs automatically. Wait for Babble Expert to open. Later, click Start, type Babble Expert, then choose Open.", "", "You’re ready! Scroll down to watch lickety’s videos. If Windows asks for permission, check the installer name before approving.", "ready", "Babble Expert"]], "mac": [["Download Babble Expert", "Click the yellow button below. Wait for the download to finish before moving on.", "Download for Mac", "The file is called BabbleExpert-macOS.dmg. Keep this guide open while you install.", "download", "BabbleExpert-macOS.dmg"], ["Open the download", "Open Finder (the smiling face in your Dock), then choose Downloads. Double-click BabbleExpert-macOS.dmg.", "", "A small window containing Babble Expert and an Applications folder should appear.", "downloads", "BabbleExpert-macOS.dmg"], ["Drag Babble Expert into Applications", "Hold the mouse button down on the Babble Expert icon. Move it onto the Applications folder, then let go. Wait for copying to finish.", "", "If you are updating an older copy, quit Babble Expert first. Choose Replace if asked to replace that older copy.", "drag", "Applications"], ["Open your Applications folder", "In Finder, click Applications in the sidebar. Double-click Babble Expert.", "", "Open the copy in Applications, rather than the copy inside the download window. If it opens, skip to step 8.", "applications", "Babble Expert"], ["If your Mac blocks it, close the message", "You may see “Apple could not verify…” or “developer cannot be verified”. Click Done or Cancel to close that message.", "", "Keep the app: don’t choose Move to Bin or Move to Trash. A message saying the app is damaged or will harm your computer needs help from lickety instead.", "blocked", "Done / Cancel"], ["Find “Open Anyway” in your Mac’s settings", "Click the Apple menu at the top left, then System Settings. Choose Privacy & Security and scroll down to the Security section.", "", "After you have tried opening the app, look for a message about Babble Expert and its Open Anyway button. Older Macs use System Preferences → Security & Privacy → General.", "settings", "Open Anyway"], ["Approve just Babble Expert", "Beside the message about Babble Expert, click Open Anyway. Enter your Mac login password or use Touch ID if asked. Click Open in the final confirmation.", "", "This creates an exception for this app. Leave your other security settings on. Never type your password into this web page or send it by email.", "confirm", "Open"], ["You’re ready to Babble", "Babble Expert should now open. Next time, open it normally from your Applications folder.", "", "You can eject the Babble Expert disk image in Finder after installation. Scroll down for lickety’s videos.", "ready", "Babble Expert"]]};
const $ = selector => document.querySelector(selector);
let os = location.hash === '#mac' ? 'mac' : 'windows';
let current = 0;
let showAll = false;
function render(focus = false) {
  const steps = guides[os];
  document.querySelectorAll('[data-os]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.os === os)));
  $('#guide-label').textContent = `${os === 'mac' ? 'Mac' : 'Windows'} installation guide`;
  $('#steps').classList.toggle('all-steps', showAll);
  $('#steps').innerHTML = steps.map(([title, body, action, tip], index) => `<article class="step" id="step-${index}" tabindex="-1" aria-labelledby="title-${index}" ${!showAll && index !== current ? 'hidden' : ''}>
    <p class="step-count">${os === 'mac' ? 'MAC' : 'WINDOWS'} · STEP ${index + 1} OF ${steps.length}</p><h3 id="title-${index}">${title}</h3><p>${body}</p>
    ${action ? `<a class="button" href="https://github.com/licketySplitAUS/BabbleExpert/releases/latest/download/${os === 'mac' ? 'BabbleExpert-macOS.dmg' : 'BabbleExpert-Windows-Setup.exe'}">↓ ${action}</a>` : ''}
    ${index > 0 ? `<img src="/expert-guide/${os}-${index + 1}.png" width="1536" height="1024" loading="lazy" decoding="async" alt="Recreated ${os === 'mac' ? 'Mac' : 'Windows'} screen: ${title.replaceAll('"', '&quot;')}. ${tip.replaceAll('"', '&quot;')}"><button type="button" class="enlarge" data-picture="${os}-${index + 1}">Enlarge picture ⤢</button><p class="caption">Recreated screen using Babble Expert’s details — your screen may look different.</p>` : ''}<p class="tip">${tip}</p></article>`).join('');
  $('#step-nav').innerHTML = steps.map(([title], index) => `<button type="button" data-step="${index}" aria-label="Step ${index + 1}: ${title.replaceAll('"', '&quot;')}" ${index === current ? 'aria-current="step"' : ''}>${index + 1}</button>`).join('');
  $('#previous').disabled = current === 0;
  $('#next').disabled = current === steps.length - 1;
  $('#position').textContent = `Step ${current + 1} of ${steps.length}`;
  $('.step-controls').hidden = showAll;
  $('#show-all').textContent = showAll ? 'One step at a time' : 'Show all steps';
  $('#show-all').setAttribute('aria-pressed', String(showAll));
  if (focus) {
    const target = $(`#step-${current}`);
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
}
document.querySelectorAll('[data-os]').forEach(button => button.addEventListener('click', () => { os = button.dataset.os; current = 0; render(); }));
$('#step-nav').addEventListener('click', event => { const button = event.target.closest('[data-step]'); if (button) { current = Number(button.dataset.step); render(true); } });
$('#previous').addEventListener('click', () => { current = Math.max(0, current - 1); render(true); });
$('#next').addEventListener('click', () => { current = Math.min(guides[os].length - 1, current + 1); render(true); });
$('#show-all').addEventListener('click', () => { showAll = !showAll; render(); });
$('#print').addEventListener('click', async () => {
  const button = $('#print');
  button.disabled = true;
  button.textContent = 'Preparing pictures…';
  try {
    const images = [...document.querySelectorAll('#steps img')];
    await Promise.all(images.map(image => {
      image.loading = 'eager';
      return image.decode();
    }));
    window.print();
  } catch {
    button.textContent = 'Pictures could not load — try again';
    return;
  } finally {
    button.disabled = false;
  }
  button.textContent = 'Print guide';
});
document.querySelectorAll('[data-fullscreen]').forEach(button => {
  const frame = button.closest('.video').querySelector('iframe');
  if (!frame.requestFullscreen) { button.hidden = true; return; }
  button.addEventListener('click', async () => {
    try { await frame.requestFullscreen(); }
    catch { button.textContent = 'Use the player’s full-screen button'; }
  });
});
render();

$('#steps').addEventListener('click', event => {
  const button = event.target.closest('[data-picture]');
  if (!button) return;
  const original = button.closest('.step').querySelector('img');
  $('#large-picture').src = original.src;
  $('#large-picture').alt = original.alt;
  $('#picture-dialog').showModal();
});
$('#close-picture').addEventListener('click', () => $('#picture-dialog').close());
