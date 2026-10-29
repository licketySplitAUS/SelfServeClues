# SelfServeClues: agent guide

## Scope and priorities

This is `licketySplitAUS/SelfServeClues`: Vite/React/TypeScript clues and Admin, plus Netlify Functions for shared grids, history/validation, publication, reporting and recovery. Runtime persistence is Netlify Blobs.

`Babble` owns public `r46.me` pages/routing; `BabbleExpert` owns Electron/installers. Fix the owning layer and read its guide before edits there. Website/backend changes usually need no desktop rebuild; preserve older installed clients and honour requests to leave Expert unreleased.

Preserve Lickety's assets, scale and readability; keep operator details in Admin. Reduce manual work/cost through bounded scheduling, incremental computation and batched exports. Explain cost drivers without promising unverified free-plan capacity.

## Commands and checks

Use Node >=22.13 and the committed lockfile. Install with `npm ci` when needed. Preserve the reviewed `tools/patch-braces.mjs` postinstall mitigation; reassess it with dependency changes.

| Task | Command |
| --- | --- |
| Local frontend and Functions | `npm run dev` |
| Unit/service suite / one file | `npm test` / `node --test test/publication.test.mjs` |
| TypeScript / frontend build | `npm run typecheck` / `npm run build` |
| Offline function packaging/routes/schedules | `node tools/history/package-check.mjs` |
| Verify imported history | `npm run history:verify` |
| Static fixture preview after build | `npm run history:preview` |
| Rehearse full backup in memory | `node tools/recovery/rehearse.mjs <runtime.json.gz>` |

Extend suitable existing tests; cover behaviour and meaningful failure paths. Prefer injected clocks/fixtures over arbitrary sleeps. Run affected tests, typecheck/build for frontend/shared changes, packaging for Functions/config/dependencies, and broader checks for storage/solver/auth/publication. Inspect affected UI. Electron UI checks need a separate runtime; docs need no app tests.

A static preview does not verify real Functions. Keep dev servers on loopback and use fixtures/test credentials. Read effects before invoking import/recovery tools; import rewrites tracked baseline data and restore can write cloud data.

## Navigation and task-specific reading

| Area | Start here |
| --- | --- |
| Shared public clues / history / Admin | `src/App.tsx`, `src/history/`, `src/styles.css` |
| Snapshot loading, live refresh, recovery clients | `shared/` |
| Routes and reusable backend logic | `netlify/functions/`, `netlify/lib/` |
| Solver, validation, history/CAS, statistics, schedule | `netlify/lib/history/` |
| Imported baseline / public dictionary and assets | `data/history/`, `public/` |
| Tests, import/packaging/UI tools, backups | `test/`, `tools/history/`, `tools/recovery/` |

Use relevant sections of [implementation reference](docs/AGENT-REFERENCE.md) for contracts and tests, `docs/README.md` for system guides, and root `OPERATIONS.md` for newer reliability work. Historical rollout states/test counts do not establish production state.

## Code Review Rules

For reviews, report actionable defects with a concrete trigger and file/line evidence, not style preferences. Check changed code against these contracts:

- Self Serve solves in-browser; history-backed clues serve a saved centrally validated solution. Their dictionary overrides are separate.
- Preserve Qu/scoring, valid puzzle identity, stable observations and reasoned corrections. Only explicit dictionary membership rejection can permanently exclude a word; network/login/board-path errors cannot.
- Preserve immutable puzzle/generation records, baseline fingerprints, conditional control updates and idempotent receipts. Derived statistics must not double-count revised puzzles.
- Preserve `AddBabbleWord`, `GetAllWords`, `showAll`, `AddBulkWord` and desktop DOM hooks. Keep All/On/Off, per-visitor progress, browser Bulk Add/Grab, printable output and generation-based refresh. Embedded celebrations defer to Expert.
- Publication selection, actual public deployment, daily schedule and chat announcements are separate states. Saved Admin chat settings override the environment fallback. Schedules use `America/Chicago`, not Sydney time; the old dated launch is not a daily trigger.
- Keep aliases persistently reserved, identify installations by full ID, and distinguish visits/installations/browsers/app-open duration in statistics. Notification counters read the site-wide ledger without incrementing visits.

## Data and execution boundaries

Keep secrets server-side, outside `VITE_*`, logs and commits. Preserve admin authentication and the limited backup-key scope. Inspect store/context selection per endpoint: not every preview is isolated, missing context does not guarantee notifications are off, and GET `/api/grab` can write. Use mocks or explicit test credentials.

Git contains source/imported history, not subsequent Blob writes. Preserve separate runtime backups, batched ETag-pinned reads, checksums and control-last create-only restore. Target daily backups within 24 hours of flip; verify actual private `BabbleBackups` runs rather than trusting a workflow template.

Finish routine local implementation/checks autonomously. Preserve unrelated edits; inspect branch/upstream state before reconciliation. Live data changes, restores, publication, deployments and real messages require task authorization; reuse authorization for the current task. Old approvals do not authorize new work. Production-branch pushes can auto-deploy; check the integration before promising a source-only push.

Find relevant symbols first; reuse saved logs and batch edits before rebuilding. Follow React/TypeScript/`.mjs` patterns; explain non-obvious reasons in comments. Assess dependency bundle/cold-start cost. Browser code must not import server-only modules; `shared/` supports both runtimes. Inspect final changes/new files for scope drift. Report checks/limits per repository; distinguish local, pushed, live and installer changes.

Reviewed 29 October 2026. Update this guide alongside changed commands/contracts. Retain recurring, non-obvious rules; remove superseded guidance. Later explicit instructions take precedence.
