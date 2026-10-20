# Operations

[Documentation home](README.md) · [Architecture](ARCHITECTURE.md) · [Recovery](DISASTER-RECOVERY.md)

## Current project inventory

Verified 20 October 2026; identifiers are configuration, not credentials.

| Project | Netlify site ID | Primary domain |
|---|---|---|
| SelfServeClues | `a7d97b78-a9ac-4d12-a656-664023a4a104` | `selfserve.r46.me` |
| Babble legacy/public | `8766fe7d-9a97-4334-8f13-15edfc71a35a` | `r46.me` |

Source branch is `main` for both. Build settings in each repository’s `netlify.toml` matter even where a dashboard/API build-setting field is blank. Preserve those files.

| Nonsecret setting | Current / intended value | Meaning |
|---|---|---|
| `HISTORY_PREVIEW_SCHEDULE_ENABLED` | `true` on the current service | Enable the daily flip dispatcher |
| `HISTORY_PREVIEW_START_MINUTE` | `17` | Start at 00:17 US Central, not Sydney midnight |
| Admin → Babble chat announcement | Off at rollout | Saved setting; changes apply on subsequent checks without a redeploy |
| `NotifyBabblersOfClues` | `false` | Legacy initial fallback only, until the first Admin chat setting is saved |
| Admin publication selection | Legacy/off at this audit | Saved Blob selection, distinct from the chat flag |
| Node build version | `22` | Set by `netlify.toml`; local tools require 22.13+ |

For recovery, keep the scheduler disabled and switch chat off in Admin after restoring data. A restored Admin chat setting overrides the legacy environment variable. Re-enable only after data, domains and today’s result have been checked. Environment-variable changes still require a new deploy; the saved Admin chat switch does not. See Netlify’s [environment variable documentation](https://docs.netlify.com/build/environment-variables/overview/).

## Enable Babble chat announcements

Enter the Admin key, then use **Babble chat announcement → Announce validated clues in Babble chat**. Saving takes effect on subsequent notification checks without a deploy and does not itself post anything. The daily processor can then post **“Clues are up!”** after successful validation. The existing **Send current validation report to Discord** action also checks enabled chat announcements, so it can announce today's validated puzzle when used deliberately. A per-puzzle receipt prevents another announcement for that puzzle.

This setting is separate from the public-page launch switch. It is saved as `settings/chat-announcements` in the history store and included in the full runtime backup. If its storage cannot be read, the notification processor disables chat for that invocation while allowing the Discord report to proceed. Keep the switch off until ready for public announcements. Before the first Admin save, the old `NotifyBabblersOfClues` value supplies the initial setting; afterward the saved Admin value wins.

## Daily operation

1. The scheduled processor observes the flip, solves and validates the puzzle, updates saved history and sends the Discord report. A normally matched result needs no manual correction.
2. Discord distinguishes a successful validation, corrected bad words, unresolved differences and unavailable validation. Check the saved puzzle’s date if an alert says the flip did not complete.
3. Admin’s comparison displays the saved automatic result. **Advanced troubleshooting** is a manual fallback for entering observed counts; it does not override the official saved validation.
4. Back up runtime data after important corrections and on a regular offsite schedule. A Git commit backs up source, not today’s Blob writes.

## Troubleshooting

| Symptom | First action | What it changes |
|---|---|---|
| Old saved puzzle / missed flip | Check PlayBabble now; examine date/monitor | Fetch/check; new identity still guarded |
| Valid candidate waiting | Verify PlayBabble, then accept current upstream grid | Bypasses observation wait, not identity validation |
| Wrong dictionary decision | Verified Word correction with reason | Current/future solutions; past completed puzzles retained |
| Wrong saved result | Restore previous preview | Active history pointers; does not roll back source code |
| Manual official board needed | Enter number, date, 25 letters, reason | Saves auditable manual solution |
| Self Serve stale grid | Grab Grid | Refreshes shared board, then browser solves |
| Counter unavailable | Keep using clues; inspect counter storage/logs | Cosmetic service; do not reset its baseline casually |
| Publication says saved but not live | Check marker/deploy logs; retry failed deployment | Builds the public project; no instant route flip |
| Netlify unavailable | Use independently stored emergency HTML / SQL failover | Cannot use the Netlify-hosted Admin switch during outage |

Do not permanently exclude words based only on “not in this grid”, a request failure or the account’s remaining count. An explicit membership rejection is the evidence used by automatic correction.

## Deploy and verify

From SelfServeClues:

```powershell
npm test
npm run typecheck
npm run build
node tools/history/package-check.mjs
```

Deploy the committed source through the linked Netlify project or an authenticated CLI using the correct site. Verify `/history-api/current`, the clues UI and Admin after a backend change. A data-only backup test should not submit words, send messages or change the public routing selection. Keep the old solver running until the public replacement is deliberately launched, then stop the old publisher to avoid conflicting generated pages.

The public project’s build reads the Admin selection every time, including a legacy solver Git push. An unrelated push should therefore preserve the selected routing mode. `/clues-publication.json` is the deployed evidence; its operation ID must agree with the saved selection before Admin reports it live.

## Source entry points

| Area | Files |
|---|---|
| History orchestration | [`netlify/lib/history/service.mjs`](../netlify/lib/history/service.mjs) |
| Solver and scoring | [`solver.mjs`](../netlify/lib/history/solver.mjs) |
| Official validation/session handling | [`babble.mjs`](../netlify/lib/history/babble.mjs) |
| History storage and conditional publish | [`repository.mjs`](../netlify/lib/history/repository.mjs) |
| Statistics | [`stats.mjs`](../netlify/lib/history/stats.mjs) |
| Scheduling / notification policy | [`schedule.mjs`](../netlify/lib/history/schedule.mjs), [`notifications.mjs`](../netlify/lib/history/notifications.mjs) |
| Publication | [`publication.mjs`](../netlify/lib/publication.mjs), [`PublicationControl.tsx`](../src/history/PublicationControl.tsx) |
| Counter | [`page-counter.mjs`](../netlify/lib/page-counter.mjs) |
| Recovery APIs / integrity / exports | [`history-recovery.mjs`](../netlify/functions/history-recovery.mjs), [`recovery.mjs`](../netlify/lib/recovery.mjs), [`recovery-exports.mjs`](../netlify/lib/recovery-exports.mjs) |
| Operator recovery CLI | [`tools/recovery/recovery.mjs`](../tools/recovery/recovery.mjs), [`backup.ps1`](../tools/recovery/backup.ps1) |
| Import from original SQL reports | [`tools/history/import.mjs`](../tools/history/import.mjs) |

## Recovery drill checklist

Record the pack’s timestamp and source commits, verify its hashes, clone a bundle without GitHub, open the emergency file without network access, and load the SQL staging export into a disposable database. Separately restore to a fresh Netlify site with all writers disabled. Compare the current puzzle and historical figures before enabling traffic. Measure the actual time taken, then choose realistic recovery objectives. Repeat after storage-schema changes.

The new automated restore tests use simulated stores rather than production. The SQL export does not prove the old database’s procedures or Delphi generator still run. The original-domain DNS cutover and independent host have not been activated by this change.

See the [20 October recovery verification record](RECOVERY-DRILL.md) for the real backup, source-bundle, offline-solver and full SQL-export checks completed with this release.
