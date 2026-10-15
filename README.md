# lickety's AI generated Babble Clues — Netlify edition

This is a normal Vite/React site prepared for Netlify. The frontend is static, while three Netlify Functions provide the shared daily grid and optional shared word-list replacement.

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

For safety, you can add a secret named `WORDLIST_ADMIN_KEY` under **Project configuration → Environment variables**. When this is set, the hidden word-list replacement control asks for that key before replacing the shared list. The built-in word list and Grab Grid do not require it.

## First use

Open the deployed site and click **Grab Grid**. The function reads the current PlayBabble page and saves the resulting grid in the `babble-shared-data` Netlify Blob store. Later visitors receive that same grid until someone clicks **Grab Grid** after the puzzle changes.

Checked clues and typed answers remain in each visitor's browser and are not shared.

The compact **Add word** bar follows Lickety's original clues page: press Enter or **Add Word** to mark a valid puzzle word, use the arrow to remove the last letter, and use **?** to jump to clues with the same two-letter start. In Babble Expert, Self Serve also supports Lickety Add and both word-transfer buttons through `AddBabbleWord`, `GetAllWords`, and `showAll`.

The page uses the same fixed 718px frame, 470px clues/board area, 230px sidebar, image tiles, and typography as Lickety's original clues page, so switching sources in Babble Expert does not change the page scale or alignment.

## Local testing

Install dependencies and use Netlify's local development server:

```text
npm install
npm run dev
```

Use `npm run build` to verify the production frontend build.
