# Posting to Babble from Discord

`/babble message: Thanks Jacula!` posts one single-line message (up to 250
characters) to the current PlayBabble puzzle as **licketySplitAUS**. The
**Reply to Babble** button beneath a mention alert opens a small one-line
form with the same limit and delivery checks. Ordinary Discord messages do
not post anywhere. This feature is independent of the
automatic clues-announcement toggle and the incoming mention monitor.

Discord pushes a signed interaction to `https://selfserve.r46.me/api/discord-babble`.
There is no polling, scheduled reply job, Gateway connection, new dependency,
or continuously hosted bot process. Existing Netlify compute/storage applies.

## Access and activation

The server-only `netlify/lib/discord-babble.mjs` pins these public identifiers:

| Setting | Value |
| --- | --- |
| Application | `1571425939013894274` |
| Server | `1560784970560053318` |
| Channel (`babble-replies`) | `1571424611730718800` |
| Allowed user | `782728802060861490` |

Every request verifies Discord's Ed25519 signature over the exact timestamp
and raw body, with a five-minute freshness window and 16 KiB input limit.
Only production deployment contexts can handle interactions; preview, local,
branch and missing contexts cannot access storage or post. Signed PINGs work
even when replies are disabled, so the endpoint can be connected safely first.
Commands also check application, server, channel, user, command and option
shape. Slash commands are restricted to `#babble-replies`. Buttons work in
the mention channel: the bot signs their IDs with its server-only token,
binding each to that channel. Form IDs additionally bind the current Central
date, so an open form expires at the flip. Both interactions verify the
same owner/server, and button clicks verify the app's message author.
After rotating the bot token and redeploying, the monitor refreshes recorded
buttons in place on its next polls, using a one-way key revision marker.
Existing open forms must be reopened. No new button message is created for
a recorded message ID, and interrupted edits retry that same ID. Discord replies
are ephemeral with pings disabled. Server command
visibility can additionally be narrowed through Discord's Integrations UI;
the server-side ID checks remain authoritative.

1. Install **Babble Replies** into the server with `bot` and
   `applications.commands`, granting View Channels, Send Messages and Read
   Message History (permissions `68608`). Add it explicitly to a private
   mention channel. No Message Content intent or persistent Gateway is needed.
2. Store its bot token as the secret `DISCORD_BABBLE_BOT_TOKEN` in Netlify,
   production context, **Builds and Functions** scopes. Netlify masks saved secret values in
   its UI/API; do not try to retrieve them for local registration. Never paste
   the token into chat or Git. The runtime token signs controls and lets the
   mention monitor add the bot-owned button replies.
3. To register during the authorized production deployment, explicitly set
   `DISCORD_BABBLE_REGISTER_ON_BUILD=true` with Builds scope in production.
   The build runs registration after the frontend build succeeds. Other
   contexts and builds without this opt-in do not read the token or register.
4. Build/test and deploy the receiver. Set the app's **Interactions Endpoint
   URL** to `https://selfserve.r46.me/api/discord-babble` and save. Discord's
   signed PING must pass. The URL is only usable after deployment.
   Registration first verifies that the token belongs to this application, then upserts
   only `/babble`, preserving other commands. It does not post a chat message.
5. Set `DISCORD_BABBLE_ENABLED=true` in production with Functions scope and
   redeploy to activate sending. Reuse the existing server-only
   `BABBLE_USERNAME`/`BABBLE_PASSWORD`; the receiver also checks the logged-in
   account name is exactly `licketySplitAUS` before posting.
6. In `#babble-replies`, use an intentional `/babble message: ...` for the
   first live test. Registration and deployment do not send test chat.

```powershell
# Read-only registration preview; no credentials or network required.
node tools/discord/register-babble.mjs

# Explicit Discord registration, with the token supplied in the process
# environment by the operator (not as a command-line argument).
node tools/discord/register-babble.mjs --apply
```

After successful registration, remove `DISCORD_BABBLE_REGISTER_ON_BUILD` so
subsequent builds do not register again. The operation is an idempotent upsert
if a deployment is retried. Retain the bot token for the reply buttons.
Registration may succeed before a later
deployment failure; verify the published receiver before using the command.
To pause posting, set `DISCORD_BABBLE_ENABLED=false`
and redeploy. The endpoint continues to acknowledge signed PINGs.

## Buttons beneath mention alerts

Ordinary incoming webhooks cannot send this app's interactive components.
The monitor therefore uses the bot to add one small referenced reply below
each of today's conversation alerts. It discovers the channel from the
existing fixed webhook, validates the configured server, and never migrates
the webhook or copies the transcript. Both existing alert edits and new
alerts keep their current delivery path. Bot replies suppress pings to the
original alert author and everyone else.

Each conversation receipt gains a separate `replyButton` status/message ID.
Button creation is checkpointed before sending, and ambiguous sends are not
replayed. Definite permission/connection failures before sending can retry
later. Button failures cannot block the normal mention alert from updating.
Buttons and webhook messages share the three-mutation/24-second poll budget;
an unchanged poll with a recorded button makes no Discord calls. This adds
at most one bot message per conversation, including today's existing alerts
when first enabled. It does not backfill old puzzle days with buttons.

## Delivery and failure handling

The receiver acknowledges immediately with an ephemeral deferred response;
Netlify `context.waitUntil` performs the bounded work after the response.
Before any public post it obtains a conditional receipt, checks that the
original Discord response can be updated, verifies the Babble account/current
Central date/grid, reads the archive baseline, rechecks the current page,
and saves a `submitting` checkpoint. It submits no puzzle words.

There is exactly one public send attempt per interaction. A successful HTTP
return alone is insufficient: one archive read-back must contain more exact
username/message matches than the baseline. A lost POST response may still
be confirmed this way. Otherwise the operator sees **delivery could not be
confirmed**, with instructions to check Babble before submitting again.
Reissuing a new command is a deliberate new send, not a recovery action.
There is no automatic public resend, even if the function stops or Discord
feedback fails. A changed puzzle or failure before submission reports not sent.

The private `babble-discord-replies-v1` store holds one conditional `delivery`
document. Each entry contains only interaction ID, creation time and status;
never the message, puzzle/grid, password, cookie or interaction token. Entries
older than 24 hours are pruned on the next authorized command, with at most
512 retained entries. A preparing/submitting command blocks a different
command for up to 60 seconds; a busy response asks the user to retry later.
Repeated interaction IDs never submit again. Unknown/unreadable state fails
closed and is not reset. This operational store is outside the game recovery
backup, and storage/Discord/Babble are not an exactly-once transaction.

If execution stops, Discord can retain its sending indicator. Check Babble
before entering a new command. No message body is saved for delayed recovery.
If the final Discord confirmation cannot be delivered, the public send still
must not be repeated automatically. Public credentials, network structure
changes and hosting cold-start/continuation timing need a real integration
check; local mocks do not establish end-to-end production success.

## Checks

```powershell
node --test test/discord-babble.test.mjs test/babble-validation.test.mjs test/chat-settings.test.mjs test/babble-mentions.test.mjs
node tools/history/package-check.mjs
```

Tests use genuine fixture signatures, in-memory conditional storage, mocked
Babble and mocked Discord. Registration defaults to dry run. No test should
use the live bot token or post real chat.

References: [Discord interactions and signature validation](https://docs.discord.com/developers/interactions/overview),
[deferred replies and follow-ups](https://docs.discord.com/developers/interactions/receiving-and-responding),
[server command registration](https://docs.discord.com/developers/interactions/application-commands).
