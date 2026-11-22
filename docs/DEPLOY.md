# Deploying to Cloudflare (check from your phone)

The Worker is named `antholo-genius`. Cloudflare builds it from GitHub, so every push gets a URL.

## State
- D1 `antholo-genius`: `migrations/0001_init.sql` applied remotely and recorded in `d1_migrations`, so a later
  `wrangler d1 migrations apply antholo-genius --remote` only runs new files.
- KV `SEARCH_CACHE` and R2 `antholo-genius-covers` exist; IDs are in `wrangler.jsonc`.

## One-time setup (Cloudflare dashboard, works in a mobile browser)
1. Workers & Pages -> Create -> Import a repository -> `jrichall/antholo-genius`.
   - Worker name: `antholo-genius` (must match `wrangler.jsonc`)
   - Production branch: `main`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Non-production branch builds: keep enabled (each branch gets its own preview URL).
2. Worker -> Settings -> Variables and Secrets -> add a **Secret** named `HARDCOVER_TOKEN`.
   Never put the token in the repo or in a chat.
3. Worker -> Settings -> Domains & Routes -> enable **Cloudflare Access** for the workers.dev and
   preview URLs, with a policy that allows only your email. Do this before sharing the URL:
   without it anyone who finds it can spend your 5,000/day Hardcover quota.

## Day to day
- Push a branch -> Cloudflare builds it -> open the preview URL from the build's page.
- Merge to `main` -> production deploys.
- Preview and production share the same D1 and KV. That is fine for one user, but edits you make while
  testing a preview are real data.
- New migrations are not applied automatically. Apply them with
  `npx wrangler d1 migrations apply antholo-genius --remote` before merging a branch that adds one.
