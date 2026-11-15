import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { archiveURL, parseChat, mentionGroups, discordAlert, localTime, runMentions } from '../../netlify/lib/babble-mentions.mjs';

// Read-only upstream requests. All webhook calls and Blob writes are simulated.
// No environment variables, production stores or Discord credentials are used.
const arguments_ = process.argv.slice(2);
if (!arguments_.length) throw Error('Usage: node tools/mentions/backtest.mjs puzzle/month/day/year [...]');
const report = ['# Babble mention monitor: historical replay', '', 'Discord and Blob writes were simulated. Each archive was replayed one post at a time; repeated unchanged polls were also checked.', ''];
const results = [];
for (const argument of arguments_) {
  const match = argument.match(/^(\d+)\/(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw Error('Use puzzle/month/day/year, without a host or query string');
  const day = { puzzle: Number(match[1]), date: `${match[4]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` };
  const url = archiveURL(day);
  const cache = path.resolve(`artifacts/chat-archive-${day.date}.html`);
  let html;
  try { html = await fs.readFile(cache, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!html) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { connection: 'close' } });
        assert.equal(response.status, 200); html = await response.text(); break;
      } catch (error) { if (attempt) throw error; }
    }
    assert.ok(Buffer.byteLength(html) <= 2000000);
    await fs.mkdir(path.dirname(cache), { recursive: true }); await fs.writeFile(cache, html);
  }
  const rows = parseChat(html, day), groups = mentionGroups(rows), $ = load(html);
  const elements = $('.log .post').toArray(), latest = new Map();
  let prefix = 0, state = null, etag = 0, sends = 0, edits = 0;
  const store = {
    async getWithMetadata() { return state ? { data: structuredClone(state), etag: String(etag) } : null; },
    async setJSON(_key, data, options) {
      assert.ok(options.onlyIfNew ? !state : options.onlyIfMatch === String(etag));
      state = structuredClone(data); return { modified: true, etag: String(++etag) };
    },
  };
  const fetchImpl = async (target, options) => {
    target = String(target);
    if (target.startsWith('https://discord.com/')) {
      const payload = JSON.parse(options.body);
      const id = options.method === 'POST' ? String(++sends) : target.match(/\/messages\/(\d+)/)[1];
      if (options.method === 'PATCH') edits++;
      latest.set(id, payload); return Response.json({ id });
    }
    if (target.endsWith('.com/')) return new Response(`<a href="/${argument}#chat_log">chat</a>`);
    const document = load(html);
    document('.log .post').slice(prefix).remove(); return new Response(document.html());
  };
  for (prefix = 1; prefix <= elements.length; prefix++) {
    const now = new Date(rows[prefix - 1].at);
    const summary = await runMentions({ store, webhook: 'https://discord.com/api/webhooks/123/offline-test', now, fetchImpl });
    assert.equal(summary.outcome, 'checked');
    const mutations = sends + edits;
    await runMentions({ store, webhook: 'https://discord.com/api/webhooks/123/offline-test', now, fetchImpl });
    assert.equal(sends + edits, mutations, 'An unchanged poll must not create or edit alerts');
  }
  assert.equal(sends, groups.length, 'One Discord message per conversation, even when later context extends it');
  for (const group of groups) {
    const receipt = state.alerts[group.id];
    assert.ok(receipt?.messageId);
    assert.deepEqual(latest.get(receipt.messageId), discordAlert(group).payload);
  }
  const summary = { date: day.date, puzzle: day.puzzle, posts: rows.length, mentions: rows.filter(row => row.mention).length, conversations: groups.length, simulatedCreates: sends, simulatedUpdates: edits };
  results.push(summary); console.log(JSON.stringify(summary));
  report.push(`## ${day.date}: puzzle ${day.puzzle}`, '', `${rows.length} posts; ${summary.mentions} matching posts; ${groups.length} conversation alerts. ${sends} simulated creates, ${edits} simulated updates; unchanged polls produced no duplicates.`, '', `[Original log](${url}#chat_log)`, '');
  for (const [index, group] of groups.entries()) {
    report.push(`### Conversation ${index + 1}`, '', `${group.replies} of 3 following messages available.`, '');
    for (const row of group.messages) report.push(`**${row.mention ? '[MENTION] ' : ''}${row.username} · ${localTime(row.at)}**`, '', ...row.text.split('\n').map(line => '> ' + line), '');
  }
}
const output = path.resolve('artifacts/babble-mentions-backtest.md');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, report.join('\n'));
console.log(`PASS: historical replay, complete context, in-place updates and duplicate suppression. Report: ${output}`);
