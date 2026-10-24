# Discord activity statistics

Open `history-admin.html`, enter the existing preview admin key, and use **Discord activity** under Administration controls. **Check bot connection** verifies the bot identity and history access for each configured channel. **Generate statistics** reads the selected period progressively; **Stop** keeps the totals read so far and labels them partial. Date boundaries and hour breakdowns use Australia/Sydney, including daylight saving.

The default filter excludes these exact Expert installation IDs:

| Installation | Device | ID |
|---|---|---|
| Joshua | Test PC | `BE-MBQX-QRM7` |
| Kevin | Test MacBook | `BE-JQ9R-MUWL` |

**Test installs only** and **All activity** update the current results without another scan. Generated first names are not used for filtering because names can repeat. Browser-only reports and system posts cannot be linked to these Expert installations; they remain in the default view. Browser and installation totals count identifiers, not distinct people. Reinstallation or clearing browser storage can create another identifier.

## Bot configuration

In the Discord Developer Portal, install the bot to the server using the **Guild Install** `bot` scope. Allow **View Channel** and **Read Message History** in each reporting channel, including private-channel overrides. Enable **Message Content Intent** on the application's Bot page so report embeds can be read. Administrator and message-sending permissions are not required. An online Gateway connection is not required: this reader uses Discord's HTTP API.

Set these variables in Netlify with **Functions** scope and the appropriate deployment context, then redeploy:

- `DISCORD_STATS_BOT_TOKEN`: bot token, marked secret. Never put it in frontend code or source control.
- `DISCORD_STATS_CHANNEL_IDS`: comma-separated channel IDs. When omitted, the ten reporting channels in `netlify/lib/discord-stats.mjs` are used.
- `HISTORY_PREVIEW_ADMIN_KEY`: existing admin key, marked secret. Requests authenticate with `x-admin-key` before any Discord calls or cached summaries are accessed.

Production-only secrets may not be available on a draft deployment. The connection check reports missing configuration, rejected tokens, inaccessible channels and unreadable webhook embeds. A channel that returns no messages is explicitly identified: check history permissions if it contains known posts.

## What the totals mean

Every message in the selected channel/date range contributes one Discord post. Known report embed titles also contribute one reporting post, with event, app version, platform, country, feature and anonymous-identifier breakdowns when those fields exist. Unrecognised messages count as **Other posts**. Average session time uses only session reports with a valid duration. Diagnostics show both report counts and repeated incident counts; available error codes have plain-English explanations.

Only history still present in Discord is available. Deleted posts, inaccessible channels, missing embed fields and older reports without identifiers limit the results. A completed report means all configured channels were scanned for the requested period; it does not reconstruct deleted history or identify unreported usage. An interrupted scan is partial and cannot be compared with a complete period as though it had equal coverage.

Messages are read in pages of up to 100. Discord rate limits pause the browser scan and resume it automatically. The backend holds only calculated page summaries in a bounded warm-process cache for five minutes, and responses use private `no-store` headers. No message archive or statistics database is written. Contact text, sender names/emails, ordinary message bodies and city details are not included in returned summaries or retained in this cache.

## Verification

Run `npm test`, `npm run typecheck` and `npm run build`. The optional `tools/history/discord-stats-ui-check.cjs` runs with Electron against the built files and synthetic history, checking filters, paging, rate-limit retry, Stop, admin-key clearing and mobile layout. It does not contact Discord or write cloud data.
