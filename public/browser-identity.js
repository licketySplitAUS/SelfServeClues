(function(){
'use strict';
function installBrowserIdentity(win) {
  if (win.LicketyBrowserIdentity) return win.LicketyBrowserIdentity;
  const key = 'lickety_browser_id';
  const valid = id => typeof id === 'string' && /^CV-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
  let memoryId;
  function getId() {
    let id;
    try {
      const cookie = win.document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith(key + '='));
      if (cookie) id = decodeURIComponent(cookie.slice(key.length + 1));
    } catch { /* Local storage remains available as a fallback. */ }
    if (!valid(id)) { try { id = win.localStorage.getItem(key); } catch {} }
    if (!valid(id)) id = memoryId;
    if (!valid(id)) {
      if (typeof win.crypto?.randomUUID === 'function') id = 'CV-' + win.crypto.randomUUID();
      else if (typeof win.crypto?.getRandomValues === 'function') {
        const bytes = win.crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
        id = 'CV-' + hex.slice(0,8) + '-' + hex.slice(8,12) + '-' + hex.slice(12,16) + '-' + hex.slice(16,20) + '-' + hex.slice(20);
      }
    }
    if (!valid(id)) return undefined;
    memoryId = id;
    try { win.localStorage.setItem(key, id); } catch {}
    try {
      const host = win.location.hostname;
      const domain = host === 'r46.me' || host.endsWith('.r46.me') ? '; Domain=r46.me' : '';
      win.document.cookie = key + '=' + id + '; Path=/; Max-Age=31536000; SameSite=Lax' + domain + (win.location.protocol === 'https:' ? '; Secure' : '');
    } catch {}
    return id;
  }
  const api = { getId }; win.LicketyBrowserIdentity = api;
  getId(); // Establish the shared ID before a guide is opened in a new tab.
  if (/\/babble-expert(?:\.html)?\/?$/.test(win.location.pathname)) {
    const browserId = getId();
    if (browserId && typeof win.fetch === 'function') {
      const source = new URLSearchParams(win.location.search).get('from') === 'rainbow-button' ? 'rainbow-button' : 'direct';
      try {
        Promise.resolve(win.fetch('/api/expert-guide-visit', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ browserId, source, client: /Electron\/|BabbleExpert/i.test(win.navigator.userAgent) ? 'expert' : 'browser' }), keepalive: true })).catch(() => {});
      } catch { /* Reading the guide never depends on notifications. */ }
    }
  }
  return api;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { installBrowserIdentity };
if (typeof window !== 'undefined') installBrowserIdentity(window);
})();
