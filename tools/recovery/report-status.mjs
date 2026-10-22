const status = process.argv[2];
if (!['success', 'failed'].includes(status) || !process.env.HISTORY_PREVIEW_ADMIN_KEY) throw Error('Backup status and credential required.');
const response = await fetch('https://selfserve.r46.me/history-api/backup-status', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': process.env.HISTORY_PREVIEW_ADMIN_KEY }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ status, runURL: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` }) });
if (!response.ok) throw Error('Backup status could not be recorded: HTTP ' + response.status);
console.log('Backup status recorded: ' + status);
