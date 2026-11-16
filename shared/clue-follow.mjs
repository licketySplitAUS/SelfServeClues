const selector = '.clues input.answer[data-answer-word]';
const wordOf = field => field?.dataset?.answerWord || '';
const visible = field => !field.disabled && field.getClientRects().length > 0;
const marked = doc => doc.querySelector('[data-babble-expert-active-clue]');
const preference = 'lickety_clue_centering_off';

export function readClueCenteringOff(cookie) {
  return String(cookie || '').split(';').some(part => part.trim() === `${preference}=1`);
}

export function clueCenteringCookie(off, hostname, secure) {
  const domain = hostname === 'r46.me' || hostname.endsWith('.r46.me') ? '; Domain=r46.me' : '';
  return `${preference}=${off ? '1' : '0'}; Max-Age=31536000; Path=/; SameSite=Lax${domain}${secure ? '; Secure' : ''}`;
}

// Remember the exact displayed copy before Off removes/hides the completed
// row. Other starting tiles can contain the same word in a different position.
export function captureClueFollow(doc, word, found = []) {
  if (!/^[A-Z]{4,25}$/.test(word) || doc.visibilityState === 'hidden') return null;
  const fields = Array.from(doc.querySelectorAll(`${selector}[data-answer-word="${word}"]`)).filter(visible);
  if (!fields.length) return null;
  const focused = doc.activeElement, selected = marked(doc);
  const selectedWord = wordOf(selected?.querySelector('input.answer[data-answer-word]'));
  if (selectedWord && selectedWord !== word && !found.includes(selectedWord)) return null;
  const centre = (doc.defaultView?.innerHeight || 0) / 2;
  const distance = field => {
    const rect = field.getBoundingClientRect();
    return Math.abs(rect.top + rect.height / 2 - centre);
  };
  const field = fields.find(field => field === focused || field.closest('tr') === selected)
    || fields.reduce((best, field) => distance(field) < distance(best) ? field : best);
  return { word, field, focused, selected };
}

export function centreNextClue(doc, anchor, found) {
  if (!anchor || doc.visibilityState === 'hidden') return null;
  // Resources/Next/Previous may already have selected and centred another
  // row. The hosted page must not compete with that deliberate navigation.
  const selected = marked(doc);
  if (selected && selected !== anchor.selected) return null;
  const focused = doc.activeElement;
  if (focused !== anchor.focused && wordOf(focused) && focused !== anchor.field) return null;
  if (doc.hasFocus()) {
    const editing = focused?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]),textarea,select,[contenteditable]:not([contenteditable="false"])');
    if (editing && !found.has(wordOf(focused)) && !(focused.id === 'add-word' && !focused.value)) return null;
  }
  const fields = Array.from(doc.querySelectorAll(selector));
  const index = fields.indexOf(anchor.field);
  // Alphabetical Off unmounts its completed row. Grid Off keeps stable rows
  // hidden, so its exact index still identifies the right starting tile.
  const split = index >= 0 ? index + 1 : fields.findIndex(field => wordOf(field) > anchor.word);
  const start = split < 0 ? fields.length : split;
  const next = fields.slice(start).concat(fields.slice(0, start))
    .find(field => !found.has(wordOf(field)) && visible(field));
  const row = next?.closest('tr');
  if (!row) return null;
  try {
    // Instant centring avoids accumulating smooth-scroll animations during
    // Expert transfers or Bulk Add. Never change focus, selection or values.
    row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    return row;
  } catch { return null; }
}
