# Babble chat mention alerts

The `babble-mentions` Netlify scheduled function checks the public PlayBabble
archive every five minutes. It searches **message text**, ignoring case, for
`lickety` (including `licketys`, `licketySplit` and `licketySplitAUS`) or
`babble expert` (allowing whitespace between the words). A username alone does
not trigger an alert. No Babble login or chat posting is involved.

Each Discord alert reads oldest first:

1. One message before the mention, when available.
2. The matching message, clearly marked with a magnifying glass.
3. The next three messages after the last nearby mention.

Overlapping context windows share one conversation alert. A new mention within
that window extends it through three messages after the new last mention.
Every entry includes the username, complete message and **Australia/Sydney**
date and time: AEDT in daylight saving, AEST otherwise. The archived clocks are
interpreted as US Central time, matching Babble's daily puzzle clock. The
archive lacks UTC offsets; during the repeated autumn hour, document order
determines which occurrence is possible, choosing the earlier instant if both
remain possible. The source archive link is always included.

Babble can leave a midnight post on the previous day's archive during the
grid change. After an observed 11 pm post, a following midnight-hour post is
dated the next Central day while retaining its original archive link. Other
backwards clock changes still fail validation and retain saved progress.

## Prompt alerts without waiting for a quiet chat

The first post goes out as soon as a poll finds the mention, usually within
five minutes plus upstream/platform delay. It includes any following messages
already present and says how many are still awaited. Subsequent polls **edit
that same Discord post** as replies arrive. Edits may not create a new Discord
notification. No replies are invented, and the monitor does not wait hours
before telling the operator about a mention.

If a conversation exceeds Discord's inline display limit, the post includes a
UTF-8 text attachment containing the entire conversation. There is no silent
message truncation. Chat Markdown is escaped and Discord pings are disabled.

## Hosting, state and load

- Cron: `*/5 * * * *`, in UTC, around the clock; 288 scheduled invocations/day.
- Normal poll: one GET of today's entire public archive. Discover its real
  puzzle/date URL from the homepage once per Central date. On rollover, fetch
  yesterday's final archive once so the last few minutes are not missed.
- Context can continue into the next puzzle day's messages. Cached logs and
  receipts retain today plus the previous two Central dates, pruned on checks.
  No ancient history is automatically imported on first startup: it scans
  today's existing chat, then follows new posts. An interruption can recover
  up to two missed dates, validating archive headings against derived IDs.
- The site-wide `babble-chat-mentions-v1` Blob store holds one private
  `monitor` document: recent public chat, archive identities, alert IDs,
  fingerprints, retry status and a short conditional invocation lease. This
  operational store is outside the existing four-store game recovery backup.
  Losing it can resend recent alerts; it does not affect clues or players.
- An unchanged poll does not call Discord. Each normal poll uses one Blob
  read and two conditional writes for the lease/checkpoint; alert delivery
  adds checkpoints. About 290 Babble page requests/day, roughly 8,700/month
  for a 30-day month. Existing Netlify invocation, compute and storage usage
  applies; there is no additional service or dependency subscription.

Each response is bounded to 2 MB and 2,000 posts, with a 20,000-character
per-message limit. Oversized or structurally changed pages are errors, never
silently shortened logs. Upstream requests time out within six seconds;
the worker budgets 24 seconds and at most three Discord mutations per run
to fit Netlify's 30-second scheduled-function limit. A large initial backlog
therefore drains over subsequent polls.

## Configuration and operation

Set **`DISCORD_MENTIONS_URL`** to the new incoming Discord webhook in Netlify's
**production** context, with **Functions** scope, then deploy. The exact name
is intentional: it does not use the other notification channel variables.
The code rejects non-Discord webhook hosts and never logs the secret.

The job activates when this webhook exists. Set **`BABBLE_MENTIONS_ENABLED`**
to `false` and redeploy to pause it. Preview, branch, development and missing
contexts cannot write the shared store or forward real messages. There is no
publicly invokable HTTP endpoint. Netlify's Functions page provides **Run now**.

Function logs contain only outcome/count summaries. `sent` and `updated` count
new posts and edits; `posts` is today's archive size; `uncertain` needs operator
attention. `chat-check-failed` backs off from five minutes to at most one hour,
retaining progress and retrying on later scheduled invocations. Discord rate
limits pause the entire webhook until its retry time. No tight retry loops.

Creating a post uses Discord's `wait=true` response to save its message ID.
Updates retry the same ID. An ambiguous new-send failure (timeout, connection
loss, 5xx or a missing response ID) cannot prove whether Discord accepted it.
Its `creating`/`uncertain` receipt is kept and **not blindly resent**. Check the
channel and receipt in the private Blob store: if the post exists, attach its
Discord `messageId` and change `status` to `sent`; if definitely absent, change
`status` to `retry`, clear `retryAt` and `nextPollAt`, then use **Run now**. Keep
the receipt key/mention IDs intact. Do not delete the entire monitor to retry
one alert. Storage and Discord are not an exactly-once transaction.

## Verification

```
node --test test/babble-mentions.test.mjs
node tools/mentions/backtest.mjs 8641/11/14/2026 8640/11/13/2026 8639/11/12/2026
node tools/history/package-check.mjs
```

The historical tool makes read-only archive requests, caches the fetched HTML
under ignored `artifacts/`, then replays each day one post at a time with
**in-memory storage and mocked Discord delivery**. It checks full final
context, incremental updates and repeated unchanged polls, and writes an
easy-to-read `artifacts/babble-mentions-backtest.md` report. It reads no secret
variables and cannot send real Discord messages.

The 12–14 November 2026 replay found:

| Babble date | Posts | Matching messages | Conversation alerts |
|---|---:|---:|---:|
| 12 November | 84 | 2 | 1 |
| 13 November | 227 | 1 | 1 |
| 14 November | 169 | 8 | 5 |

The supplied screenshot's 14 November 8:12 pm Central message appears as
**15 November 2026, 1:12 pm AEDT**. Its context includes the preceding 8:10 pm
message and the following 8:44 pm, 8:45 pm and 9:24 pm messages.

Platform references: [Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/),
[Discord webhook execution and editing](https://docs.discord.com/developers/resources/webhook),
[Babble's Central-time puzzle day](https://www.playbabble.com/help).
