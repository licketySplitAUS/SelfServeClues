(function () {
  'use strict';
  if (window.licketySlotEntry) return;
  window.licketySlotEntry = true;
  let entered = null;
  const isSlot = field => field && field.matches('input.answer[data-answer-word], input[name^="edt"]');
  const slots = () => Array.from(document.querySelectorAll('input.answer[data-answer-word], input[name^="edt"]'));
  function answer(field) {
    if (field.dataset.answerWord) return field.dataset.answerWord.toLowerCase();
    const match = /^edt(\d+)$/.exec(field.name);
    return match && window.lWordArray && typeof window.decrypt === 'function'
      ? window.decrypt(window.lWordArray[Number(match[1]) - 1] || '') : '';
  }
  function check(field) {
    const word = field.value.trim().toLowerCase();
    // A valid word in a different slot must not tick this clue.
    if (!word || word !== answer(field) || typeof window.AddBabbleWord !== 'function') return;
    window.AddBabbleWord(word);
    if (window.lShow === 2) window.showNone();
    else if (window.lShow === 3) window.showOff();
    else if (typeof window.showAll === 'function') window.showAll();
  }
  function advance(field) {
    const fields = slots();
    const index = fields.indexOf(field);
    // Off view removes React rows; continue from the completed word's order.
    const split = index >= 0 ? index + 1 : fields.findIndex(input => answer(input) > answer(field));
    const start = split < 0 ? fields.length : split;
    const ordered = fields.slice(start).concat(fields.slice(0, start));
    const next = ordered.find(input => !input.disabled && input.getClientRects().length &&
      !input.closest('tr')?.querySelector('input[type="checkbox"]')?.checked);
    if (next) { next.focus(); next.select(); }
  }
  document.addEventListener('input', event => { if (isSlot(event.target)) entered = null; });
  document.addEventListener('focusin', event => { if (event.target !== entered) entered = null; });
  document.addEventListener('change', event => { if (isSlot(event.target)) check(event.target); });
  document.addEventListener('keydown', event => {
    const field = event.target === document.body && entered &&
      (!entered.isConnected || !entered.getClientRects().length) ? entered : event.target;
    if (event.key !== 'Enter' || event.isComposing || !isSlot(field)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (entered === field) { entered = null; advance(field); }
    else { entered = field; check(field); }
  }, true);
  // Legacy pages submit the separate Add Word box on every keypress.
  document.addEventListener('keypress', event => {
    if (event.key === 'Enter' && isSlot(event.target)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
})();
