# Antholo-genius

A personal, single-user, series-first book tracker. Web app (installable PWA) first; maybe an Expo native app later.
The full build plan is in `docs/BUILD_GUIDE.md`. Read it before starting any phase, and work one phase at a time.

## Stack
- One Cloudflare Worker serves the API (Hono) and the React + Vite front end (Workers static assets, via `@cloudflare/vite-plugin`).
- D1 = source of truth. KV = search cache. R2 = cover thumbnails. Cron Trigger = daily refresher.
- TypeScript everywhere, `strict: true`. Shared logic and types live in `src/shared/` so a future Expo app can reuse them.
- Tests: Vitest. Numbering, ordering and refresh scheduling must have unit tests.

## Commands
- `npm run dev` — local dev (Worker + front end)
- `npm test` — unit tests
- `npx wrangler d1 migrations apply antholo-genius --local` — apply migrations locally (use `--remote` for production)
- `npm run deploy` — build and deploy
- `node spike/hardcover-spike.mjs` — re-run the Hardcover API check

## Rules
- Hardcover is called ONLY from the Worker, ONLY through `src/worker/sources/hardcover.ts`. Never from the browser.
- Every Hardcover request sends the `User-Agent` set in that module, stays at or under 1 request/second, and puts at most 10 top-level fields in a query.
- A 401/403 from Hardcover means the token expired or was reset. Show "Hardcover token expired — update HARDCOVER_TOKEN" and keep serving cached data.
- The app reads from D1. Outside APIs are called only on: a search, the first track of a series, a scheduled refresh, or a "refresh now" press.
- Model output (spoiler-safe lines, recommendation reasons) is generated once and stored. Never regenerate it on page load.
- Any series or book a model names must be matched to a real Hardcover record before it is shown.
- User edits (position override, safe line, notes, ratings) always win over refreshed data. A refresh must never overwrite them.
- Secrets live in `.dev.vars` locally and `wrangler secret put` in production. Never commit them or print them in logs.
- Follow the design tokens and components in `docs/BUILD_GUIDE.md` § Design. Don't invent new colors or fonts.
- Don't add a dependency without saying why in the commit message. Prefer the platform (fetch, Web APIs) over libraries.
- Commit at the end of each phase with a clear message. Don't push unless asked.
