# lickety's AI generated Babble Clues — Netlify edition

This is a normal Vite/React site prepared for Netlify. The frontend is static, while Netlify Functions provide the shared daily grid, optional shared word-list replacement and Babble Expert usage notifications.

## Deploy with GitHub

1. Create a new GitHub repository.
2. Upload everything in this folder to the repository root.
3. In Netlify choose **Add new project → Import an existing project**.
4. Select the GitHub repository and deploy it.

Netlify reads `netlify.toml`, which sets:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

Netlify automatically provisions the Blob store when the deployed functions first use it. No environment variables are required for normal use.

### Babble Expert usage notifications

The `/api/babble-notify` function accepts the opt-in `install`, `upgrade`, `resource`, `option`, and `session` events sent by Babble Expert and forwards a fixed-format notification to Discord. Reports include a random installation ID, app version, operating-system platform, processor architecture, and country supplied by Netlify's request context. Clients that explicitly indicate the updated city-sharing consent can also include an approximate city from that context; older clients remain country-only. City estimates may reflect a VPN or internet provider rather than the user's actual city. Coordinates and postal codes are never forwarded. Notifications retain their timestamp without the repeated opt-in footer. Depending on the event, they also include the previous app version, selected menu item or session duration. The installation ID allows reports from the same installation to be associated over time. The function does not read or forward the visitor's IP address, entered words, chat or puzzle activity; hosting providers can still process connection information in their own logs. Usage sharing requires consent in Babble Expert and can be disabled in its Options menu.

Create `DISCORD_WEBHOOK_URL` under **Project configuration → Environment variables**, mark it as containing a secret value, and paste the Discord webhook URL there. Never add the webhook URL to source control. After changing the variable, redeploy the site before testing the endpoint.

For safety, you can add a secret named `WORDLIST_ADMIN_KEY` under **Project configuration → Environment variables**. When this is set, the hidden word-list replacement control asks for that key before replacing the shared list. The built-in word list and Grab Grid do not require it.

## First use

Opening the deployed site automatically checks PlayBabble through **Grab Grid**. The function reads the current PlayBabble page and saves changes in the `babble-shared-data` Netlify Blob store. If PlayBabble is unavailable, the page falls back to the last saved grid, which may be an older puzzle. **Grab Grid** remains available for a manual refresh, and overlapping requests from the same page are prevented.

Checked clues and typed answers remain in each visitor's browser and are not shared.

The compact **Add word** bar follows Lickety's original clues page: press Enter or **Add Word** to mark a valid puzzle word, use the arrow to remove the last letter, and use **?** to jump to clues with the same two-letter start. In Babble Expert, Self Serve also supports Lickety Add and both word-transfer buttons through `AddBabbleWord`, `GetAllWords`, and `showAll`.

The page uses the same fixed 718px frame, 470px clues/board area, 230px sidebar, image tiles, and typography as Lickety's original clues page, so switching sources in Babble Expert does not change the page scale or alignment.

## Local testing

Install dependencies and use Netlify's local development server:

```text
npm install
npm run dev
```

Use `npm test` for notification-field checks, `npm run typecheck` for TypeScript validation and `npm run build` to verify the production frontend build.

### Memorable anonymous aliases

Discord shows a stable English first name above the installation code (for example, Katherine and BE-ABCD-EFGH). The server hashes the complete code with SHA-256, reads the first four bytes as an unsigned big-endian integer and selects a name from a fixed, versioned list. The list order and hash rule must remain unchanged to preserve existing aliases. No names are collected from users, and no mapping database is required. First names may repeat; retain the original code to distinguish installations. The algorithm is in netlify/lib/anonymous-alias.mjs.
