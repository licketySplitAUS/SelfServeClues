// Public endpoints only: never send or print the backup credential.
import { lookup } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
for (const host of ['selfserve.r46.me', 'selfserveclues.netlify.app']) {
  console.log('DNS', host, await lookup(host, { all: true }).catch(error => ({ error: error.code })));
  const url = `https://${host}/history-api/current`;
  await Promise.all([
    (async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
        await response.arrayBuffer();
        console.log('Node', host, response.status, response.headers.get('x-nf-request-id'));
      } catch (error) { console.log('Node', host, error.cause?.code || error.name, error.cause?.message || error.message); }
    })(),
    (async () => {
      try {
        const result = await run('curl', ['--silent', '--show-error', '--output', '/dev/null', '--max-time', '12', '--write-out', 'status=%{http_code} remote=%{remote_ip} connect=%{time_connect} total=%{time_total}', url], { windowsHide: true });
        console.log('curl', host, result.stdout);
      } catch (error) { console.log('curl', host, error.stdout, error.stderr); }
    })(),
  ]);
}
