# Design principles and tradeoffs

[Developer guide](DEVELOPER-GUIDE.md) · [Architecture](ARCHITECTURE.md) · [Build and release](BUILD-AND-RELEASE.md)

These principles describe constraints visible in the source and established product choices as of 29 October 2026. They are a design aid for future changes, rather than a claim that every old component already follows one uniform pattern.

## Familiar, readable play

Many players rely on a familiar Lickety layout and simple controls. Preserve its scale, assets, readable found words and puzzle space. Keep routine feedback compact, use plain language, and put operator detail in Admin or a dedicated dialog. All/On/Off must remain under player control when data refreshes. Found words should remain readable rather than faded or struck through.

The tradeoff is that a technically cleaner redesign can still be a product regression. Inspect the real compact/zoomed/embedded layouts, not just a wide browser screenshot. The shared clues implementation is [`src/App.tsx`](../src/App.tsx); Expert also has native view bounds and zoom to consider.

## Own logic in the layer that can keep it correct

The public Babble repository handles delivery and legacy transforms; SelfServeClues owns web/backend logic; Expert owns desktop orchestration. Expert separates its pure engine from page adapters and Electron wiring. This lets tests exercise decisions without a live browser or server and limits the effect of external DOM changes.

The public build transforms are intentionally idempotent because daily legacy generation can overwrite source HTML. Put durable shared additions in the transform instead of repeatedly hand-editing generated clues. Do not duplicate backend rules in public pages or bundle server secrets into the frontend.

## Preserve installed-client contracts

Hosted changes reach installed Expert versions without an installer update. Preserve the clue bridge functions and DOM hooks even when the visible UI evolves. `AddBabbleWord` returns string statuses `0`, `1`, `2`; `GetAllWords` is newline-delimited; `showAll` is a compatibility operation and must not unexpectedly reset filters. Current Expert parses hosted resource lists as data, while old versions execute their scripts.

Compatibility costs some legacy markup and adapter code. Remove it only with evidence about the clients and a migration plan. Tests and the [implementation reference](AGENT-REFERENCE.md) describe the contracts in more detail.

## Identity before automation

An asynchronous result belongs to the puzzle and page generation that produced it. Check exact grid identity, readiness and revision before transferring words or accepting delayed results. PlayBabble loads saved words after document load; an empty early snapshot must not trigger a full replay.

In the backend, require a stable candidate board before ordinary automatic acceptance. An operator may bypass the observation delay, but not validation of identity. In the browser, corrections to the same puzzle preserve valid progress; a new grid starts a different progress identity.

This adds guards and state, but prevents a worse class of errors: correct work being applied to the wrong puzzle. See [`service.mjs`](../netlify/lib/history/service.mjs), [`repository.mjs`](../netlify/lib/history/repository.mjs), and Expert's `engine.js` / `pages.js`.

## Model uncertainty honestly

Network failure, login expiry, missing board paths and explicit word rejection are different outcomes. Only an explicit dictionary-membership rejection supports global exclusion. Backend validation records `matched`, `corrected`, `mismatch` or `unavailable`; a published snapshot is not automatically a validated snapshot.

Expert uses green for confirmed acceptance, amber for duplicate/uncertain/Clues-only results, and red for explicit rejection. A timeout does not prove a submission was never processed. Reconcile observable state before replaying a potentially completed action. Chat is never blindly replayed.

The tradeoff is more visible outcome states and occasional retained uncertainty. False certainty would corrupt dictionaries, lose progress or send duplicate chat. See [`babble.mjs`](../netlify/lib/history/babble.mjs) and [`service.mjs`](../netlify/lib/history/service.mjs).

## Preserve the last usable state

Publish immutable puzzle/state/snapshot objects first, then advance the control pointer using its ETag. Concurrent writers cannot silently replace a newer pointer. Revisions replace prior aggregate contributions so statistics do not double-count a corrected puzzle. Fingerprint the imported baseline to avoid merging incompatible histories.

Frontend refresh failures keep the last good view. Dictionary refresh failures keep the validated cache. Desktop settings/journals use atomic local writes; corrupt journal data is preserved rather than overwritten silently. Recovery installs control pointers last.

This retains old or occasionally orphaned immutable objects and requires explicit rollback/retention decisions. The benefit is a recoverable chain of state rather than partially updated public data. See [`repository.mjs`](../netlify/lib/history/repository.mjs), [`shared/clues-snapshot.mjs`](../shared/clues-snapshot.mjs) and [Recovery](DISASTER-RECOVERY.md).

## Bound work and respect interaction

Keep polls single-flight, retry budgets finite, server calls timed, caches bounded and background work out of typing/scrolling paths. Current Resources uses indexed search and virtual rows, rather than rendering or rescanning the entire dictionary. Saved lists open immediately and refresh for a later opening instead of moving content under the pointer.

History refresh uses a small generation marker and fetches a full snapshot only when needed. Schedules taper polling after puzzle flip. Recovery batches reads with bounded concurrency. Avoid accidentally bundling the imported archive into tiny marker handlers; the packaging checker exists to catch that cost.

The tradeoff is some stale-but-labelled data and more careful invalidation. Measure the relevant path before adding polling, dependencies or full-list computation. See [`shared/live-clues.mjs`](../shared/live-clues.mjs), [`schedule.mjs`](../netlify/lib/history/schedule.mjs), [`recovery-batch.mjs`](../netlify/lib/recovery-batch.mjs).

## Minimize authority and collected data

Expert keeps sandboxing and context isolation, validates IPC senders/frames/documents and exposes named operations. Backend secrets stay server-side; admin and backup keys have different scopes. A preview or missing context is not a universal isolation boundary: check each endpoint.

Usage sharing is opt-in. Optional self-reported username linking is a separate choice. Journals remain local; routine diagnostics use allowlisted fields instead of raw exception messages, URLs, words or chat. Contact messages are deliberate user input. Stable aliases identify installation codes, not people; do not treat browser/installation counts as unique-player counts.

These boundaries require separate paths for reporting, contact and recovery rather than a single unrestricted API. See [`admin-auth.mjs`](../netlify/lib/admin-auth.mjs), [`alias-registry.mjs`](../netlify/lib/alias-registry.mjs), and Expert's `PRIVACY.md`.

## Separate desired state, delivery and side effects

The Admin public-page flag is desired state. A deployed operation marker proves which routing build arrived. Central solution publication, routing deployment, chat, Discord notifications and desktop release are separate operations with distinct failure handling. Discord failure must not undo a good puzzle publication. Ambiguous chat submission keeps its claim to avoid duplicate announcements.

Two Netlify sites are useful delivery boundaries but share a provider failure domain. Git is source history; runtime Blob backups are a separate responsibility. An emergency static page only becomes independent failover when it is available on another provider with a workable DNS plan.

Existing infrastructure and unsigned desktop distribution are deliberate operating choices. Revisit the cost/reliability tradeoff explicitly before introducing paid services or signing. See [`publication.mjs`](../netlify/lib/publication.mjs), [Build and release](BUILD-AND-RELEASE.md), and [Recovery](DISASTER-RECOVERY.md).
