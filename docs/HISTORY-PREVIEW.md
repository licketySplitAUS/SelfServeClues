# Isolated clues and history preview

The experimental page is **`/history-preview.html`**. The original `/` entry and live `babble-shared-data` store remain separate.
`src/App.tsx` is now shared by both entries, with optional published-puzzle props.
A draft can be deployed for review without replacing the published site.
Do not replace the VM process yet.

## Run locally

```powershell
npm.cmd run history:verify
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run history:preview
```

Open **http://127.0.0.1:4175/history-preview.html**. The local server serves the
imported snapshot and deliberately disables cloud admin calls. The original
page is still at `/` (its Netlify APIs require Netlify Dev, as before).

## Imported data and audit

The read-only originals are in `M:\Backups\Babble\DB Extracts`. To reimport:

```powershell
npm.cmd run history:import -- "M:\Backups\Babble\DB Extracts"
```

The parser reads SQL Server **fixed-width** report columns and checks each
declared row count. It does not treat `.rpt` as comma-separated data.
Source SHA-256 digests are recorded. Files produced:

- `data/history/archives/YYYY.json.gz`: every original game, including custom
  games, duplicate puzzles, original totals, word scores and starting cells.
- `data/history/baseline.json.gz`: canonical game index, dictionary including
  rejected words, all-time frequency counters and current imported puzzle.
- `data/history/audit.json`: anomalies and both legacy and canonical statistics.
- `public/history-preview-data/snapshot.json`: small public page payload.
- `public/history-preview-data/audit.json`: public reconciliation report.

The supplied extracts contain 7,424 games, 1,309,176 game-word rows and 172,456
dictionary rows (172,231 active; 225 excluded by `NotInBabble`). All stored
game totals agree with their word rows. There are 155 extra puzzle records,
234 missing puzzle numbers within the imported range, and three malformed grids.
The current imported puzzle is 8608, dated 2026-10-19, with 197 words / 2,400 pts.

**This is a comparison policy, not an approved historical cleanup:** the
canonical view uses the highest GameID for each official puzzle number and
counts each word once per game. It has 7,265 historical puzzles excluding
today. The frozen legacy view in the admin import report counts all official source records
and has 7,420 historical games. Canonical historical unique words are 55,241;
legacy unique words are 55,309. Resolve the duplicate records before choosing
which figures should become the public defaults. No historical grid is invented
to fill a missing number, and malformed historical grids remain in the audit.

Historical word scores are preserved. The new solver uses the Delphi values:
J/X/Z are 6; Qu is one tile scoring 5 (Q=3 plus U=2). The live React
solver was corrected and published independently with J/X/Z = 6.
`history:verify` compares the complete current solved word set and scores with
the import. It also checks that archived records reproduce the public summary.

Most-frequent-by-length retains the SQL's up-to-13 tied winners, ignoring
singletons. Historical longest/highest leaderboards retain occurrences rather
than silently becoming DISTINCT rankings. The public preview keeps the original integer average display. Today's word-length table includes every length.

## Cloud preview, when ready to deploy

The Vite multi-page build retains `index.html` and adds `history-preview.html`.
Only `history-*` function bundles include `data/history/**` (about 7.4 MB
compressed including the full original archive). No history or dictionary
archive is downloaded by a normal page visit; the current page snapshot is
approximately 19 KB before compression, plus cached JS/CSS.

The new endpoints use a separate URL prefix:

- `GET /history-api/current`: one saved snapshot; short browser/CDN cache.
- `POST /history-api/admin`: authenticated preview-only administration.
- `history-tick`: US Central flip-time scheduled function with an explicit opt-in guard.

Set a new secret **`HISTORY_PREVIEW_ADMIN_KEY`** in Netlify before trying admin
actions. A missing key fails closed. The admin form keeps the key only in memory.
This secret is unrelated to the live word-list key. Flip notices use the existing Discord webhook; nothing is posted into PlayBabble chat.

All writes use **`babble-history-preview-v1`**, never the live Blob store.
Draft and unknown contexts use a deploy-specific store (`getDeployStore`); only
an explicitly production-context deployment uses the separate site-wide trial
store. Export draft data before redeploying: a new draft has a fresh isolated store.
Statistics are derived caches rebuilt from the fixed baseline plus all complete
post-import puzzle records, not mutable running counters stored as authoritative
data. Each publication writes immutable puzzle/state/snapshot records, then atomically
switches a small control pointer with an ETag conditional write. A race or partial
write leaves the old published generation visible. Old generations are retained
for rollback. Strong consistency is used for control and revision reads.

The first observation of a new/changed grid is a candidate. A later invocation
must see the same puzzle/date/letters after at least 20 seconds, or an authenticated
admin can check and accept it immediately. Puzzle numbers and dates come from
the upstream page, not an inferred Sydney flip time. Repeated letters under a
new number are allowed; regressions, invalid dates and malformed grids do not
replace the saved result. The last good puzzle remains clearly dated. Monitor
messages describe late/error responses without destroying it.

The scheduler is disabled by default in code and is explicitly enabled for the
production-hosted experiment as of 19 October 2026. Set
**HISTORY_PREVIEW_SCHEDULE_ENABLED=true** in the production environment and
redeploy to apply. Branch/deploy previews do not run automatic schedules.

Checks use America/Chicago (US Central), including daylight saving.
**HISTORY_PREVIEW_START_MINUTE=17** sets the minutes after midnight to start.
Valid values are whole numbers 0?59; the default when unset is 0. Invalid
values fail closed instead of publishing early. Change this variable under
Netlify Project configuration ? Environment variables and redeploy to apply.

With the current value 17:
- 00:17?00:26: every minute.
- 00:27?00:46: every five minutes (27, 32, 37, 42).
- 00:47?01:16: every ten minutes (47, 57, 01:07).
- At 01:17 the check window closes. Longer delays require a manual admin check.

The one-hour retry window moves with the configured start. New grids still
need two observations, so the usual publication follows the second check.
No scheduled solve or upstream fetch happens before the configured start.

Cron wakes once per minute during the possible UTC hours (05?07); the local
time guard selects the retry minutes and deadline. Other wakeups read no
storage and fetch nothing. Once the saved puzzle is dated today in Central
time, remaining attempts skip the upstream request. Until then an unresponsive
or stale site retains the last good result and is retried at the next scheduled
attempt. No function sleeps while waiting. There are at most 17 upstream
attempts per day; a normal rollover usually needs two. The deadline notification
is handled by the same history-tick function and never fetches upstream.
Only the separate preview history store changes; the original live grid/word-list
workflow remains separate.

Authenticated actions include checking/accepting upstream, re-solving the current
preview puzzle, manual puzzle entry with a reason, and word include/exclude/restore.
Word changes re-solve only the current puzzle and future puzzles; earlier puzzles
retain their recorded solutions. A puzzle revision subtracts its old contribution
before adding its replacement. Repeat checks cannot double-count history.

## Backup and recovery

The admin backup downloads gzip JSON containing the active control/state,
all active post-import puzzle revisions, corrections and current snapshot.
Keep it with `data/history` and the original reports in a second location.
The baseline's source fingerprint is checked before applying cloud updates;
reimporting a different database will not silently mix it with existing cloud
history. A deliberate merge/import procedure is required in that situation.

Rollback restores the previous published preview generation, including its
dictionary corrections and frequency state, or the imported snapshot if there
was only one cloud generation. Immutable orphaned generations after failed
conditional commits are harmless; cleanup can be added after the trial.

This first version includes a backup export, not an automatic off-site backup
schedule or a cloud backup-restore importer. Add those before retiring the VM.
Initial/full historical rebuilds run through local tools (or an external build
runner), not a paid background function. The flip-time job only processes the
current puzzle plus small aggregate/index records.

## Acceptance before switching over

1. Review the duplicate-puzzle policy against the audit and original SQL page.
2. Deploy a preview with the scheduler disabled and a separate admin secret.
3. Exercise current-grid checks, a deliberately rejected word, restoration,
   manual entry, repeated checks, malformed/delayed upstream and rollback.
4. Enable only the experimental scheduler, compare daily word sets/scores and
   statistics for at least a week, and check function metrics on Legacy Free.
5. Add automatic off-site backup and test restore before retiring the VM.

Stay on **Legacy Free**. No new database service, paid add-on, AI API, production
deployment per puzzle, or paid background function is needed for this preview.

## Familiar Self Serve design and admin workflow (19 October 2026)

The scoring correction (J/X/Z = 6) was published independently in commit
`ee22bb8`. The history preview now renders the same `src/App.tsx` page frame,
assets, input controls, Bulk Add/Grab and Babble Expert bridge as Self Serve.
Its optional published-puzzle props avoid the original grid/word-list endpoints.
Historical statistics extend the middle column using original section names,
tables, rules and Back to top links. Largest/smallest records include full dates.
The original page's word-length table now also supports words longer than nine.

`/history-admin.html` is a directly accessible, bookmarkable admin page linked
from the preview sidebar. It includes current puzzle/status, the last check,
pending grid, instructions, import exceptions, saved corrections, revision
changes and backup controls. Its secret stays in memory and is required by
the server for writes; merely viewing this page does not authorize changes.

Mark's normal workflow uses PlayBabble's logged-in statistics, not a complete
solved word list. In Compare PlayBabble stats, enter the official total/counts
by length or starting letter. Differences and candidate filters narrow the
search. Individual-tile counts must be combined for repeated starting letters.
Review fills a word correction without applying it. Once confirmed on Babble,
exclude/include the word with a reason; current clues/statistics rebuild and
future puzzles retain that dictionary decision. Comparisons are local browser
notes keyed by puzzle. Server-side validation now uses the Netlify secrets described below.
A totals difference cannot safely identify which word is rejected, so words
are never automatically removed by guessing. The complete-list reconciliation
experiment was removed after clarification of Mark's workflow.

Before replacement: review visual parity and import duplicate policy, exercise
word correction and late-grid recovery, establish off-site backup/restore,
then enable and observe scheduled publishing over several grid changes.
Promote the history version to Self Serve first, retain the original r46.me
clues page until comparisons pass, then switch the existing original URL while
preserving its navigation and Babble Expert bridge. Keep Legacy Free unchanged.

## Stable access and hidden shortcut

The separate trial pages are also available on the Self Serve production host:
`https://selfserve.r46.me/history-preview.html` and
`https://selfserve.r46.me/history-admin.html`. The main `/` page still uses its
original live grid/word-list endpoints. This publishes access to the experiment,
not a replacement of the usual clues page. The original r46.me clues site is
unaffected. The production-context history store is the separate site-wide
`babble-history-preview-v1`; its scheduler is now enabled with the flip-time window above.

Click **Support** in “Please Support Babble and upgrade to Pro.” five times
within two seconds. From normal Self Serve it opens the trial clues page;
from trial clues it opens admin. The word's visual style is unchanged, and
slower clicks reset the count. This is only a navigation shortcut: server-side
admin actions still require the secret key, which remains out of source control.
The same local preview key is configured for the production-hosted trial admin.

The visible Clues Administration/sidebar preview notice has been removed.
Use the five-click Support shortcut to reach admin. The admin status button is
now Reload saved status: it displays loading/completion feedback, bypasses the
CDN cache with a fresh query, and explicitly reports unchanged data. A failed
manual reload keeps the current result and reports the error; it never silently
replaces current status with the imported fallback. Initial offline loading can
still use that fallback, with a visible explanation. Checking PlayBabble remains
a separate authenticated action linked directly from the status explanation.

Both normal Self Serve and the history preview include “Printable Clues
(no boxes). Click here” above the puzzle heading. It opens the corresponding
page with `?print=1` in a separate tab and uses that page's solver/saved snapshot.
The plain printable view includes puzzle number/date and all clues, grouped by
prefix, without filters, completion marks, answer fields, board or sidebars.
Its Print/Back toolbar is hidden by print media CSS. No separate legacy static
HTML file or additional Netlify endpoint is needed.


## Discord flip updates

The existing server-only DISCORD_WEBHOOK_URL is reused. Messages announce the
watch beginning, successful publication (puzzle/date/words/points), or the end
of the one-hour window without a new grid. Daily per-event receipts in the
preview store prevent repeat messages. Failed delivery releases the receipt
for a later scheduled attempt and does not block puzzle publication. The end-of-window
summary only reads saved state; it does not extend the upstream check window.

Logged-in validation uses server-only BABBLE_USERNAME and BABBLE_PASSWORD secrets (Functions scope). After solving, it compares the official fixed word-size totals and aggregated starting-letter tile totals. It uses available two-letter totals and groups candidate submissions by two-letter prefix. The current Babble account exposes size and tile totals, with no separate two-letter totals. Accepted submissions change progress/remaining counters; the fixed denominators are compared instead. Equal counts confirm count agreement, not individual membership of every word.

On a discrepancy, candidates matching excess sizes/starting letters are tested first. Only an explicit not_valid dictionary rejection creates a permanent exclude override. Board-path rejection (dne), login errors, timeouts and unexpected responses never blacklist words. The solver rebuilds clues, scores and historical caches after exclusions. Accepted-word progress is retained for retries, and validated results stop further submissions. Missing words and unexplained discrepancies are reported rather than guessed.

The schedule hands off to authenticated history-process background work to avoid the scheduler's 30-second limit. Investigations resume on the normal retry schedule for the one-hour flip window. An unresolved result is clearly marked in Discord/admin; connection failures can require intervention if they persist through the window. Discord sends one notice per puzzle/validation outcome and lists rejected words with spoiler formatting. Failed Discord delivery can retry. The authenticated current-report button can resend a newly available outcome.

Chat announcements are now controlled under **Admin → Babble chat announcement**, without a redeploy. The original `NotifyBabblersOfClues=false` environment variable supplies the initial fallback until an Admin chat setting has been saved; the saved Admin setting then takes precedence. Saving does not post immediately. Admin manages a message library (add/edit/remove, bulk paste or text-file import; one message per line, up to 250 characters each). Saving does not post. Existing single messages become one-entry libraries and missing settings retain "Clues are up!". A validated puzzle day randomly chooses and stores one entry, reusing it across retries and later library edits. Editing the library does not repeat an already announced puzzle. A per-puzzle receipt prevents duplicates. Login failures retry; an ambiguous send retains the receipt to avoid repeating a possibly delivered message. No public chat was sent during validation testing.

Runtime storage selection uses Netlify's request context.deploy.context; system CONTEXT is absent in these modern function invocations. Production uses the site-wide babble-history-preview-v1 store; draft deploys retain isolated stores. The original production deploy's records and notification receipts were copied to the persistent store, with a local ignored backup. The authenticated migrate-legacy action only operates on an empty production store and never overwrites existing published state.


The Powered by Netlify badge was disabled through the project's
built_with_badge_enabled setting. It was already off on babbleclues. This
removes Netlify's edge-injected public badge without CSS workarounds, code
changes to page content, or a plan upgrade.

## Discord channel routing and explicit messages

Server-only webhook variables route install events to
DISCORD_NEW_USER_WEBHOOK_URL, upgrades to DISCORD_UPGRADE_WEBHOOK_URL, puzzle
flip updates to DISCORD_PUZZLE_WEBHOOK_URL, and player-written messages to
DISCORD_MESSAGE_WEBHOOK_URL. Each falls back to the existing DISCORD_WEBHOOK_URL
when not configured. Other approved usage events keep the original channel.
No webhook URL is included in the desktop application or public build.

Install notifications remain the client's once-per-installation, opted-in
first-use event; upgrades retain their separate event. Usage-sharing consent
and location fields are unchanged. Puzzle publication notices include the
puzzle date, official puzzle number, internal game ID, total words/points and
word counts/points by length. The admin Discord test includes the saved puzzle's
same statistics without changing that puzzle.

POST /api/lickety-message accepts only an explicit message of 1–500 characters
and the app version. It forwards those fields to the message channel with
mentions disabled. It works independently of usage sharing. The desktop never
sends drafts or opens the message composer automatically. Routing changes are
not listed in Babble Expert release notes; the player-facing message feature is.

## Publishing the new tool at r46.me

The authenticated Admin page now includes Public clues page → Use new clues at
r46.me/babbleclues. Off keeps the legacy page; on serves history-preview.html
through same-team Netlify rewrites. The browser retains the r46.me address.

The Admin selection is stored in the production-only babble-publication Blob
store. The selected boolean is passed to a build hook and read again by every
Babble repository build, including legacy solver pushes. The build assigns its
USE_NEW_BABBLE_CLUES value from that saved selection and generates _redirects.
The Admin setting is the source of truth; no Netlify dashboard variable edit or
manual deployment is needed. BABBLE_PUBLICATION_BUILD_HOOK is a server-only
production Functions secret. Account API credentials are not stored in functions.

The hook belongs to the babbleclues project on branch main. The Babble repository
build script copies tracked static public files into dist, retains a legacy copy,
and adds proxy routes for app assets, APIs, history data and printing. No puzzle
solver or credentials are copied to the legacy project. Untracked files do not ship.

clues-publication.json records the mode and operation ID included in a deployed
site. Admin polls this marker to distinguish a saved choice from a live change.
Unacknowledged hooks remain unverified until the matching operation is published;
failed or delayed requests can be retried. Failed builds preserve the prior site.

Before launch, stop the old solver's Git publishing, then enable the Admin switch.
The new solver's existing schedule continues unchanged. The Admin chat switch is
independent and remains off until deliberately enabled. Turning the publication
switch off redeploys the preserved legacy page; restart the old solver if it should
resume daily updates. New history and corrections remain intact after rollback.

Permanent review URLs are https://r46.me/new-babbleclues and
https://r46.me/legacy-babbleclues. The main /babbleclues path stays legacy until
Admin explicitly switches it on. Other r46.me pages and downloads remain available.

## First-party page counter

Self Serve and the new clues page share one visit ledger, seeded from the
provided legacy screenshot at 4,197,761. The inception date is 18 April 2006,
displayed as 18/04/06 in each clues sidebar and on printable/Admin pages.
The odometer groups digits in threes with small visual gaps.

Each loaded clues document makes one POST /api/page-counter after its sidebar
mounts. Refreshing or opening either clues page creates a new random visit ID.
React StrictMode remounts share one request; transport retries reuse the ID.
Each random visit ID has its own immutable receipt and dated index, written only if new. The displayed total is derived from these unique records and sealed daily checkpoints. No shared counter key is overwritten.
GET reads the total without incrementing. Admin and printable pages display the
inception date without adding visits. No IP addresses, accounts, persistent
browser identifiers or third-party counter requests are used.

Netlify Database provisioning was rejected because this account does not have the database feature. The implementation uses the production site-wide babble-page-views Blob store as an append-only ledger; preview deploys use isolated deploy stores. There is no read-modify-write counter key. The daily scheduled checkpoint summarizes visits at least two UTC days old into a new immutable checkpoint. Original visit records and receipts remain available, and checkpoints keep normal reads limited to recent days. Data survives deployments. An unavailable store shows an unavailable-counter message while the rest of the clues page keeps working.
