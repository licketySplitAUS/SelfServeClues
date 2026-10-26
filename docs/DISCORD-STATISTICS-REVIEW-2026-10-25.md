# Discord statistics review — 25 October 2026

## Follow-up export ending at 10:43 Sydney

The second export contains 431 posts, 425 reporting posts, 17 Expert installation IDs and 40 browser IDs. Event, daily, channel and hourly totals each reconcile to 431. The change from 438 is exactly seven synthetic posts removed by the previous fix: one session, two resources, one startup, one upgrade, one option and one diagnostic test. The excluded session lasted 1h 2m 5s. The remaining 126 sessions total 326h 12m 16s; the rounded average is correctly 2h 35m 20s. There is no evidence of an arithmetic regression in the supplied export.

Useful observations:

- Seven of 17 identified installations last reported 3.3.0 (41%); six last reported 3.2.12 and four older versions. This is observed reporting, not proof of current installed versions. Thirty-five posts carrying 3.3.0 are not 35 users.
- Diagnostics now correctly exclude the connection test: 19 reports comprise 13 problem reports and six recoveries. The 35 occurrences comprise 29 problem occurrences and six recoveries. Six updater posts contribute 22 problem occurrences, still subject to the old client's duplicate-counting bug. Historical counts cannot be repaired from this summary.
- Four- through eight-letter lists contribute 43 of 53 resource reports (81%). Six-letter lists lead with 16. This supports maintaining resource responsiveness; event counts alone do not establish preference across distinct users.
- There are 30 browser Clues completions and no separately classified Expert fireworks events. The report ends before the later local test; it cannot assess the pending local fireworks-reporting fix or reconstruct previously unreported Expert completions.
- The 126 sessions versus 48 startups cover different instrumentation histories; this is not evidence of missing launches or a retention ratio. App-open time includes idle, background and sleep time.
- One explicit journal-enable event does not show how many users have recording enabled. Automatic activation is not an explicit user option event, and the next-release migration is still local.

Additional local fixes after this review:

- Show the active audience filter and excluded-post count so exports can be compared accurately.
- Add each installation's last observed date, version observation date, readable session count and app-open total. Merge these independently of the latest version across pages.
- Separate diagnostic rows by version and recognized failure stage/reason, count unique affected installations, and display occurrence versus delivery dates. Explicitly identify missing error codes instead of repeating the event title as its explanation.
- Explain symbolic updater network/HTTP and startup codes emitted by the pending client release. Keep numeric renderer exit codes separate from Chromium network codes.
- Rename the hourly table to message arrival hours and order it chronologically, with a note explaining that it is not playing time.

Verification: all 122 site tests pass, TypeScript checking and the production build pass, and the synthetic Electron UI check passes. The UI check covers session metadata retained across pages, affected-ID deduplication, latest versions, chronological hours, filters, rate-limit retry, partial reports, credential clearing and desktop/mobile overflow. No deployment or Discord message was performed for this follow-up.

Reviewed the user's complete-history export ending at 10:05 Sydney time against the statistics reader, aggregation UI, report-producing functions and Expert telemetry implementation. Changes are local; no deployment, environment change or Discord write was performed.

## Version 3.3 is present

The supplied Versions table includes `3.3.0.0` with 35 posts, third because the old display ranks by post count. This is evidence of reporting from that version, not 35 users or installations. The aggregate export cannot reveal how many installations upgraded or their latest reported versions.

The revised view orders versions numerically newest first, combines equivalent three-part versions and four-part versions ending in `.0`, and shows a separate latest-reported-version count by installation. Nonzero build components remain distinct. An installation's latest version is merged across all scanned pages; queued diagnostics use their original occurrence time so a late old report cannot overwrite a more recent version observation. This is still an observation within the scanned reports, not proof of the version currently installed.

## Confirmed problems and local fixes

- Synthetic IDs `BE-TEST-TEST` and `BE-TEST-2ABC` were treated as regular installations. Together they contribute four posts and two of the reported 19 installations. They now belong to the test cohort alongside the two existing known test devices. Exact known synthetic titles, platform markers and option/resource test labels are also filtered. Ordinary installations sharing a generated first name with a tester remain included. Other unlabelled historical tests cannot reliably be identified.
- Equivalent version spellings such as `3.2.11` and `3.2.11.0` were split. Their 1 and 66 posts combine to 67 before any change to the test filter.
- Windows variants using `win32`, `Windows`, slash and middle-dot separators were split. Equivalent spellings are now normalized, as are macOS labels.
- The diagnostics view called all observations incidents and labelled recoveries as problems. It now distinguishes problems, recoveries and connection tests, retaining the original client counts as reported occurrences.
- Session labels could imply active playing time. They now say app-open time and disclose idle/background/sleep inclusion, the readable-duration denominator, and attribution to the closing report date.
- A report-volume ranking was labelled most active installations. The new label states report volume, with each installation's latest reported version alongside it.
- The requested all-history range looked like data back to 2015. The UI now also shows the actual first and last post dates found in the selection.

## Checks on the supplied totals

Post-type totals, daily totals and hourly totals each sum to 438. Reporting posts (432) plus other posts (6) also equal 438. The supplied channel totals sum to the same value. There is no arithmetic evidence here of missing pages or duplicated client aggregation.

The total session duration, 327h 14m 21s, divided by 127 sessions is 2h 34m 36s after rounding. The average itself is correct. Expert computes session duration from elapsed wall time since app launch. It does not subtract idle, background or sleep time. Crashes and sessions still open can lack closing reports, and a session ending inside a selected period can have started before it.

The 20 diagnostic posts comprise 13 problem posts, six recovery notices and one connection test. The 36 reported occurrences comprise 29 problem occurrences, six recoveries and one test. The updater contributes six posts and 22 reported occurrences; those older client counts can double-count one failed check. They must not be presented as verified unique failures. The separate pending Expert fix addresses future duplicate counting, not historical records.

## Useful observations and limits

- The posts found span 17–25 October 2026. The 2015 date is Discord's epoch used as the lower bound for an all-history scan, not the start of this project's reporting.
- Expert startup notifications were added on 22 October 2026 (commit `7aaf6ca`). The 49 starts and 127 closing sessions cover different instrumentation histories; their ratio is not a retention or failure metric.
- Four- through eight-letter word-list resources account for 43 of 55 resource posts (78%). Six-letter lists lead with 16. This supports investing in resource responsiveness, but cannot measure how many distinct players use each list.
- Version fields are present on 348 posts, platform fields on 347 and countries on 327. Different denominators are expected because browser-only and system reports do not carry every Expert field. Country counts are event-weighted network-location observations, not a count of players living in each country.
- The two known synthetic IDs mean at most 17 of the displayed 19 installation IDs remain after removing those IDs; additional known test-label filtering may change other totals. This is not a claim of 17 distinct people. Browser IDs and installation IDs cannot be added together or linked from this export.
- Guide visits (38), browser identifiers (40), installs (17) and upgrades (43) are different event populations. They do not establish a download conversion rate, unique-person count or number of retained players. Older reports may classify a first observed version as an upgrade.
- The local journal's default-on migration has not been released. A single explicit journal-enable notice does not establish future journal adoption; automatic activation deliberately sends no explicit-user-option notice.

## Verification

All 120 site tests pass, including regression tests for synthetic filtering, aliases, equivalent versions/platforms, delayed diagnostic timestamps and diagnostic classifications. TypeScript checking and the production build pass. The Electron statistics UI check passes for page merging, latest-version aggregation, numeric version ordering, filters, rate-limit retry, Stop/partial state, admin-key clearing, and desktop/mobile layout. It uses synthetic history and performs no cloud writes.
