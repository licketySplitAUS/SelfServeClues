import { recoveryRequest } from '../../shared/recovery-request.mjs';

const status = process.argv[2];
if (!['success', 'failed'].includes(status) || !process.env.HISTORY_PREVIEW_ADMIN_KEY) throw Error('Backup status and credential required.');
await recoveryRequest('https://selfserve.r46.me/history-api/backup-status', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.HISTORY_PREVIEW_ADMIN_KEY }, body: JSON.stringify({ status, runURL: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` }) }, { timeout: 15000 });
console.log('Backup status recorded: ' + status);
