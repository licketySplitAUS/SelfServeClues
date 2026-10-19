import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.csv': 'text/csv' };
export function previewServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname.startsWith('/history-api/')) {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'Local static preview: cloud admin actions are disabled.' })); return;
      }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
      const body = await fs.readFile(file);
      response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = previewServer();
  server.listen(4175, '127.0.0.1', () => console.log('Separate history preview: http://127.0.0.1:4175/history-preview.html\nExisting Self Serve: http://127.0.0.1:4175/\nLocal cloud writes are disabled. Press Ctrl+C to stop.'));
}
