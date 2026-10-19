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
- `history-tick`: five-minute scheduled function with an explicit opt-in guard.

Set a new secret **`HISTORY_PREVIEW_ADMIN_KEY`** in Netlify before trying admin
actions. A missing key fails closed. The admin form keeps the key only in memory.
This secret is unrelated to the live word-list key. No notification/chat is sent.

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

The scheduler is **disabled by default**. Merely deploying this code creates
no automatic upstream fetches or history publications. Its scheduled invocations
return immediately until **`HISTORY_PREVIEW_SCHEDULE_ENABLED=true`** is explicitly
configured for the production context and deployed. Netlify schedules do not run
automatically on branch/deploy previews. Leave it disabled until comparison is
complete. A bad upstream page is retried at the next tick; the function never sleeps.

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
runner), not a paid background function. The five-minute job only processes the
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
notes keyed by puzzle; no PlayBabble credentials are requested or stored.
A totals difference cannot safely identify which word is rejected, so words
are never automatically removed by guessing. The complete-list reconciliation
experiment was removed after clarification of Mark's workflow.

Before replacement: review visual parity and import duplicate policy, exercise
word correction and late-grid recovery, establish off-site backup/restore,
then enable and observe scheduled publishing over several grid changes.
Promote the history version to Self Serve first, retain the original r46.me
clues page until comparisons pass, then switch the existing original URL while
preserving its navigation and Babble Expert bridge. Keep Legacy Free unchanged.
