# SelfServeClues implementation reference for agents

Paths are relative to the repository root. Read only sections relevant to the task. Reviewed against source on 29 October 2026; this describes code contracts, not verified live settings or provider health.

## Frontend and desktop compatibility

- Vite has three entry documents in `vite.config.ts`: `index.html`, `history-preview.html`, `history-admin.html`. Preserve them and the related route/asset proxies in Babble. `public/babble-expert.html` and `public/expert-guide/` are the hosted install guide, not the Electron app.
- Keep browser imports free of server-only modules. When a shared `.mjs` API changes, update its matching `.d.mts` declarations and affected runtime tests together; a frontend typecheck alone does not exercise the function implementation.
- `src/App.tsx` serves both Self Serve and saved published clues. Self Serve downloads the shared dictionary with a bundled CSV fallback, grabs the board, then solves in-browser. Published clues use server-saved words/scores and do not run validation for each visitor.
- `src/history/App.tsx` loads snapshots via `shared/clues-snapshot.mjs`. First-load failure can use browser-saved then bundled clues, with a visible dated warning. Later automatic failures retain the current good result; never silently replace live clues with the imported snapshot.
- `shared/live-clues.mjs` watches a small generation marker only while visible/online, coalesces requests and guards focus bursts. Fetch a snapshot only when generation changes. Keep `/history-api/version` lightweight; it reads the pointer without importing the archive/solver. Same-puzzle corrections reconcile saved valid words and preserve filters; a new puzzle retains the old puzzle's saved progress separately.
- `AddBabbleWord` returns string status codes (`0` invalid/not present, `1` added, `2` already found); `GetAllWords` returns newline-separated found words. Keep `showAll` and `AddBulkWord` compatibility exports and DOM hooks such as `data-answer-word`, answer fields, checkboxes and grid tiles. Old Expert's `showAll()` calls refresh answers without resetting All/On/Off.
- Ordinary browsers retain Bulk Add/Grab. Expert hides it through its preload while preserving bridge DOM; do not globally delete browser tools. Keep standalone fireworks and browser identity working; when Expert announces ownership, browser celebration/reporting defers.
- The standard clues layout is intentionally 718px with established board/sidebar proportions. Preserve printable `?print=1` output, left alignment, original assets and clear bold found words. Admin can use responsive layouts without redesigning public clues.
- Reference dice analysis is a hypothesis, not verified Babble dictionary/generator rules. Unseen-word results use canonical history plus runtime revisions/corrections, including today's grid; normal historical statistics intentionally exclude today.

## Puzzle, import and history contracts

- Preserve adjacent paths without tile reuse and a 25-character grid with `Q` representing a Qu tile. Scoring in `netlify/lib/history/solver.mjs`, `src/App.tsx` and Expert's clue creator must agree: Qu contributes five points, the accompanying U is skipped, and letter-sum is multiplied by word length minus three. Do not substitute Scrabble values.
- `tools/history/report.mjs` reads fixed-width SQL reports. Whitespace splitting loses multiword names and shifts fields; preserve NULL semantics and row-count validation.
- `tools/history/import.mjs` archives original rows, including custom/duplicate games. Canonical history selects the highest GameID per official puzzle, deduplicates words and preserves recorded historical scores. Keep audit discrepancies visible; never normalize away raw archival evidence.
- Import rewrites the baseline, archives, audit and bundled snapshot. It is not a routine build or verification command. `sourceVersion` fingerprints source reports; runtime state must match its baseline. Reimport requires a deliberate reconciliation/backup plan.
- `netlify/lib/history/service.mjs` derives statistics from baseline plus immutable puzzle revisions, replacing rather than double-counting a revised puzzle's contribution. `stats.mjs` excludes today's game from historical tables and intentionally retains repeated leaderboard occurrences matching legacy SQL.
- New history identity needs valid number/date/board and two observations at least 20 seconds apart. Acceptance can skip waiting, not identity validation. Reject older/implausible grids and preserve the last good snapshot on upstream errors. Manual grids/corrections require reasons.
- Write puzzle, state and snapshot records create-only, then CAS the control pointer with its ETag. Failed CAS leaves the old generation visible. Rollback changes pointers; it is not a source deploy rollback, dictionary wipe or restoration of lost external accounts.

## Store scope and effects

| Store/layer | Meaning |
| --- | --- |
| `babble-history-preview-v1` | Immutable puzzle/generation records; control pointer, corrections, chat settings/selections and delivery receipts |
| `babble-shared-data` | Self Serve's current grid/word override plus persisted Expert alias reservations |
| `babble-publication` | Desired legacy/new route selection and operation/launch status |
| `babble-page-views` | Append-only visit receipts/indexes and closed-day checkpoints |
| Other operational stores | Diagnostic delivery leases and backup health; not automatically included by the four-store recovery allowlist |

History repository reads use site-wide storage for production and deployment storage otherwise. Scope varies by endpoint: original grid/word-list handlers use `getStore`, while publication/counter handlers inspect deployment context. Do not assume every preview or local run is isolated. `productionNotifications()` also allows missing context; missing `CONTEXT` is not evidence that real notification credentials are safe locally. Verify each affected handler and use explicit test credentials/mocked stores.

HTTP method alone does not prove an operation is read-only: GET `/api/grab` can save a changed shared board; loading a normal clues page also triggers grab/visit activity. History check/rebuild and notify-current can contact authenticated PlayBabble or send enabled announcements. Use fixture endpoints for verification unless the task authorizes live effects.

The counter field in notifications reads the existing site-wide ledger without recording a visit. Preserve read-only lookup, bounded failure fallback and baseline; deployment-scoped empty data must not masquerade as the live total.

## Validation, announcements and publication

- `netlify/lib/history/babble.mjs` keeps upstream credentials/cookies invocation-local. Preserve exact puzzle identity across login/read/submission, sequential candidate checks and request/time budgets. Compare official fixed denominators, not the account's changing found/remaining counts.
- Only explicit `not_valid` membership rejection allows automatic permanent exclusion. Board-path rejection (`dne`), mismatched responses, network or login errors do not. Unavailable/mismatched validation remains visible and retries for an already published grid; publication alone does not mean validated.
- `history-tick` dispatches authenticated background `history-process`; the scheduled handler stays lightweight. The local `America/Chicago` window uses the configured start minute, tapered retries and a one-hour deadline. Keep DST coverage and stop extra upstream requests once current, except necessary validation retries.
- Chat announcements require the separate saved enabled setting and matched/corrected validation. Saved Admin settings override `NotifyBabblersOfClues`; saving settings does not post. Select and atomically save one message per puzzle date, preserve it on retries/library edits, and keep the send receipt after an ambiguous public send to avoid duplicates.
- Publication is a separate desired-state/build workflow: save mode/operation, request Babble's build hook, then verify `r46.me/clues-publication.json`. Saved/deploying/unverified/live are different states. The public build must read saved selection and fail if unavailable, not reset to legacy.
- The dated October 2026 `launchPlan`/`history-launch` is a consumed, expiring one-time launch, not the daily puzzle schedule. Do not re-arm it or copy its cron as a new launch mechanism.

## Identity, diagnostics and recovery

- Expert alias uniqueness comes from create-only name claims and installation pointers in `netlify/lib/alias-registry.mjs`, not hash modulus alone. Preserve reservations/assigned names and grow the pool without recycling claims. The legacy hash mapping remains a fallback. Use full installation IDs for identity/test exclusions.
- Reporting/diagnostics validators allow only predefined fields; suppress mentions, enforce payload bounds and preserve consent/version compatibility. Diagnostic leases are best-effort deduplication, not an exactly-once transaction with Discord. Keep cleanup bounded.
- Discord statistics read paginated history with a bounded five-minute warm cache of summaries, not raw message archives. Retain private no-store responses, authenticated access, rate-limit pause/resume and partial-result labels. Installations, browsers, post counts, app-open time and active solving time are not interchangeable. Use occurrence times for delayed diagnostics and normalize equivalent version suffixes.
- Recovery exports inventory the four allowlisted stores, pin object ETags, verify bytes/checksums/references and recheck history control. This is not a transaction across stores; later visits are outside the cutoff. Batched replies are ordered complete prefixes with `consumed`, not permission to drop remaining records. Keep bounded concurrency and compatibility with older unbatched inventories.
- Restore verifies/preflights all stores before writing, permits identical-content resume, uses create-only writes and publishes control last. The CLI requires a different target site and explicit apply/confirm flags. Rehearsal uses memory; it does not prove real-provider or SQL Server recovery.
- Full runtime backups, validated puzzle checkpoints, Git bundles, staging SQL and standalone emergency HTML solve different recovery needs. A checkpoint cannot restore the entire service. SQL export is staging data, not a native `.bak`. Emergency HTML does not provide the full Expert bridge or tomorrow's board.
- `HISTORY_BACKUP_KEY` permits recovery exports and backup-health reporting, not game/Admin mutation. Restored chat settings can override an environment fallback; keep all writers/chat off until a restored system is verified. Private `BabbleBackups` owns actual scheduled jobs; this repository's workflow YAML is only a template.

## Verification and documentation map

For a meaningful bug fix, reproduce the failure with the smallest suitable existing fixture/test where practical, then verify the correction. Prefer controllable clocks and condition waits to fixed delays. Keep checks about observable behaviour/contracts; do not hide failures by weakening expectations or multiplying cases that repeat the implementation.

Run `npm test`, `npm run typecheck` and `npm run build` as appropriate. For Functions/import/dependency changes also use `node tools/history/package-check.mjs`: it packages locally without deployment and checks archive inclusion, routes, schedules and lightweight handlers. If function configuration changes, update both this helper and `netlify.toml` consistently.

| Change | Focused checks |
| --- | --- |
| Solver/import/statistics/identity/CAS | `test/history.test.mjs`, `test/babble-validation.test.mjs`; `npm run history:verify` for imported-data/scoring work |
| Public UI, filter, automatic refresh | `test/live-clues.test.mjs`, `test/reliability.test.mjs`; build then `tools/history/ui-check.cjs` / `clue-filter-ui-check.cjs` |
| Publication and chat | `test/publication.test.mjs`, `test/chat-settings.test.mjs`, validation/history tests |
| Aliases, metrics, reporting | alias integration/anonymous-alias, page-counter/notices, notification, diagnostics and Discord-statistics tests |
| Recovery and backups | `test/recovery.test.mjs`, `test/recovery-batch.test.mjs`, `test/recovery-request.test.mjs`, `test/puzzle-checkpoint.test.mjs`, reliability tests |
| Discord Admin UI | Build then `tools/history/discord-stats-ui-check.cjs` with synthetic fixtures |

The `.cjs` UI checks require an Electron runtime, which SelfServeClues does not declare as a dependency. Use the installed runtime from Expert; do not assume `node` can execute those checks or add Electron to production dependencies. Clear inherited `ELECTRON_RUN_AS_NODE` for GUI execution. The fixture server serves built `dist/`, so rebuild after frontend edits.

Use `docs/README.md` to find operational/recovery guides. Some documents preserve older rollout states: README's hash-only alias description predates the registry; `docs/GITHUB-BACKUPS.md` and `docs/RECOVERY-DRILL.md` contain initial not-enabled/not-rehearsed statements. Consult newer root `OPERATIONS.md`, actual implementation and current run evidence before describing live status. Historical measurements/test counts are not current verification.
