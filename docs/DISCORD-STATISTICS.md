# Discord activity statistics

First-name-only aliases are chosen from 937 distinct names and reserved for one installation. The server uses an ID-seeded shuffled candidate list and create-only name reservations, so simultaneous functions cannot give a name to different IDs. A saved installation-to-name pointer keeps assignments stable across restarts and pool expansion. Known installations retain their existing names; the test PC keeps Joshua and the colliding regular installation receives another unused first name. New notifications, diagnostics and historical statistics all use the same registry. Previously posted Discord messages are not rewritten. IDs remain separate from display names and continue to control grouping and filtering.

Alias claims live under `expert-aliases/v2/` in the existing `babble-shared-data` store, so the runtime backup includes them without adding a store or changing the backup workflow. Preview deployments use deployment-scoped storage. Reservations are immutable and never expire or get recycled. Keep the name pool and claims when deploying; extend the pool before it fills. Exhaustion or unavailable storage returns an error rather than issuing a duplicate or guessed alias. The registry stores only anonymous installation IDs and generated names.

Open `history-admin.html`, enter the existing preview admin key, and use **Discord activity** under Administration controls. **Check bot connection** verifies the bot identity and history access for each configured channel. **Generate statistics** reads the selected period progressively; **Stop** keeps the totals read so far and labels them partial. Date boundaries and hour breakdowns use Australia/Sydney, including daylight saving.

The default filter excludes these exact Expert installation IDs:

| Installation | Device | ID |
|---|---|---|
| Joshua | Test PC | `BE-MBQX-QRM7` |
| Kevin | Test MacBook | `BE-JQ9R-MUWL` |
| Synthetic | Connection test | `BE-TEST-TEST` |
| Synthetic | Client test | `BE-TEST-2ABC` |

**Test installs only** and **All activity** update the current results without another scan. Generated first names are not used for filtering because names can repeat. Browser-only reports and system posts cannot be linked to these Expert installations; they remain in the default view. Browser and installation totals count identifiers, not distinct people. Reinstallation or clearing browser storage can create another identifier.

Known synthetic connection-test titles, platform markers and exact feature labels (`Babble Expert client option test`, `Babble Expert client resource test`, `Resources menu test`) also belong to the test cohort, even when they lack an installation ID. Other unlabelled historical test posts cannot reliably be identified.

## Bot configuration

In the Discord Developer Portal, install the bot to the server using the **Guild Install** `bot` scope. Allow **View Channel** and **Read Message History** in each reporting channel, including private-channel overrides. Enable **Message Content Intent** on the application's Bot page so report embeds can be read. Administrator and message-sending permissions are not required. An online Gateway connection is not required: this reader uses Discord's HTTP API.

Set these variables in Netlify with **Functions** scope and the appropriate deployment context, then redeploy:

- `DISCORD_STATS_BOT_TOKEN`: bot token, marked secret. Never put it in frontend code or source control.
- `DISCORD_STATS_CHANNEL_IDS`: comma-separated channel IDs. When omitted, the ten reporting channels in `netlify/lib/discord-stats.mjs` are used.
- `HISTORY_PREVIEW_ADMIN_KEY`: existing admin key, marked secret. Requests authenticate with `x-admin-key` before any Discord calls or cached summaries are accessed.

Production-only secrets may not be available on a draft deployment. The connection check reports missing configuration, rejected tokens, inaccessible channels and unreadable webhook embeds. A channel that returns no messages is explicitly identified: check history permissions if it contains known posts.

## What the totals mean

Every message in the selected channel/date range contributes one Discord post. Known report embed titles also contribute one reporting post, with event, app version, platform, country, feature and anonymous-identifier breakdowns when those fields exist. Unrecognised messages count as **Other posts**. Average session time uses only session reports with a valid duration. Diagnostics show both report counts and repeated incident counts; available error codes have plain-English explanations.

Versions are sorted newest first and equivalent `.0` build suffixes are combined (for example, `3.3.0.0` becomes `3.3.0`). Windows/macOS platform spellings and separators are normalized. Post breakdowns measure reporting frequency, not adoption or distinct people. The separate latest-reported-version table counts each identified installation once, using its most recent dated version report within the selected period. Delayed diagnostics use `Occurred (UTC)` rather than delivery time. This is an observation, not confirmation of the version currently installed.

The report states the selected activity filter and how many scanned posts it excludes. Each installation also shows its last observed activity, the date its version was observed, readable session count and reported app-open time. These values merge across pages independently of the latest version. Dates use Sydney time. The hourly table is chronological and explicitly measures message arrival, not playing time.

Diagnostics are grouped by event, component, normalized version, recognized stage/reason and code. They include unique affected installation counts and first/last occurrence and last delivery dates. A delayed diagnostic can describe activity before the selected delivery period. Unknown-ID reports cannot contribute to affected-installation counts; repeated posts from the same ID count that installation once. Missing technical codes are explicitly identified. Updater HTTP/network and startup codes emitted by newer clients have explanations; older posts cannot recover details the client never sent.

App-open session durations include idle, background and sleep time, are attached to the closing report date, and can span outside the selected period. Crashed or still-running sessions may have no closing report. These totals are not active solving time. Recovery and connection-test diagnostic notices are distinguished from problem reports. Client repeat counts are reported occurrences, not verified distinct failures; old Windows updater reports can double-count one failure. The displayed actual post-date span distinguishes available data from the requested all-history range, which starts at Discord's 2015 epoch.

Only history still present in Discord is available. Deleted posts, inaccessible channels, missing embed fields and older reports without identifiers limit the results. A completed report means all configured channels were scanned for the requested period; it does not reconstruct deleted history or identify unreported usage. An interrupted scan is partial and cannot be compared with a complete period as though it had equal coverage.

Messages are read in pages of up to 100. Discord rate limits pause the browser scan and resume it automatically. The backend holds only calculated page summaries in a bounded warm-process cache for five minutes, and responses use private `no-store` headers. No message archive or statistics database is written. Contact text, sender names/emails, ordinary message bodies and city details are not included in returned summaries or retained in this cache.

## Verification

Run `npm test`, `npm run typecheck` and `npm run build`. The optional `tools/history/discord-stats-ui-check.cjs` runs with Electron against the built files and synthetic history, checking filters, paging, rate-limit retry, Stop, admin-key clearing and mobile layout. It does not contact Discord or write cloud data.
