# Antholo-genius — Build Guide

This is the plan Claude Code follows to build Antholo-genius. It turns the design doc and the approved mockups into phases, each one sized for a single Claude Code session.

- Design doc: https://claude.ai/artifact/PBV8xHkUgSYMZDVTkM2ALK
- Approved mockups (use **B · Modern**): https://claude.ai/artifact/Vq2GuvNjpmt193UFRW2pDg

---

## How to use this guide

1. Open this repo in Claude Code. `CLAUDE.md` loads automatically and holds the standing rules.
2. Run one phase per session. Start each session with:
   > Read docs/BUILD_GUIDE.md and do Phase N. Stop when its acceptance checks pass, commit, and summarize what changed.
3. Recommended model: **Sonnet, medium effort** for Phases 1–7. Switch to Opus only if a phase gets stuck.
4. After each phase, check the acceptance list yourself in the browser before starting the next one.

### One-time setup (before Phase 1)

- Node 20 or newer.
- A Cloudflare account, then `npx wrangler login`.
- Copy `.dev.vars.example` to `.dev.vars` and fill in `HARDCOVER_TOKEN`. You'll need `ANTHROPIC_API_KEY` from Phase 4 on.
- When you create the Hardcover token, pick a long expiration and note the date. Hardcover says it may reset tokens without notice while the API is in beta.

---

## Phase 0 — Hardcover check (run first, about 5 minutes)

Run from the repo root:

```bash
node spike/hardcover-spike.mjs
```

The script makes about 20 API calls, about one a second, and writes `spike/REPORT.md`. To test series you know well instead of the defaults, pass their names:

```bash
node spike/hardcover-spike.mjs "The Stormlight Archive" "Your Favorite Series"
```

Then, in Claude Code:

> Read spike/REPORT.md. Fill in the "Spike results" table below, and adjust Phase 1's field names and the Hardcover adapter plan to match what the API actually returned. Commit.

### What we already know (from Hardcover's docs, Nov 2026)

| Topic | Fact | What it means for the build |
| --- | --- | --- |
| Endpoint | `https://api.hardcover.app/v1/graphql`, `Authorization: Bearer <token>` | Store the token as a Worker secret |
| Rate limits (free plan) | 5,000/day, burst 10, 60/minute; each top-level field counts as one request | Throttle to 1 req/s; at most 10 top-level fields per query |
| Timeouts | Queries max 30 s; search max 2 s | Search must fail gracefully |
| Query depth | Max depth of 3 is on Hardcover's 2026 roadmap | Avoid deep nesting (series → book_series → book → image = 4) |
| Token lifetime | Set per token at creation; can be reset without notice in beta | Handle 401/403 with a clear message |
| Browser use | Docs conflict | Server-side only (already the plan) |
| Terms | Own data only; no training public or commercial models; don't share the token; send a descriptive User-Agent | Fine for a personal app |
| Series fields | `is_completed`, `books_count`, `primary_books_count` (main books, no companions), `state` + `canonical_id` for duplicates | Use `primary_books_count` for "N books"; skip duplicate series |
| Book fields | `description`, `release_date`, `release_year`, `compilation`, `users_read_count`, `image`, `cached_tags` (to confirm) | Spike confirms names |

### Spike results (run Nov 21, 2026; full output in `spike/REPORT.md`)

| Question | Answer |
| --- | --- |
| Token works | Yes. Rate headers confirm 60/min, burst 10, 5,000/day |
| `book_series` fields | `id, book_id, series_id, position (float8), featured (Boolean!), compilation (Boolean!), details (String), created_at, updated_at` |
| Decimal positions present | Yes (e.g. Edgedancer 2.5, Murderbot "Home" 4.5) |
| Shared positions | Yes, heavily. Every translation, box set and split edition is a separate book at the same position (Stormlight: 96 rows for about 10 real books; 17 at position 1) |
| Compilations flagged | Yes, via `book_series.compilation` / `books.compilation` |
| Split editions | Yes, and they take decimal slots ("Part 2" at 1.2, "(5 of 5) [Dramatized Adaptation]" at 2.5) |
| Duplicate series records | Common. "The Expanse" and "Discworld" exact-name matches were all `state = duplicate` with 0 books |
| `is_completed` | Always null in the test. Don't rely on it |
| Future release dates present | Yes, but often on translations or new editions, not new books |
| Junk dates | Yes (year 0002; a 1985 Summer Knight) |
| Missing descriptions | About half of rows, mostly translations |
| Covers | Present on every row |
| Tag categories | `Tag`, `Mood`, `Genre`, `Group`, `Content Warning` (in `books.cached_tags`) |
| Character data | Yes: root fields `characters`, `book_characters`; search `query_type: "Character"` works |
| Search | `search(query, query_type, per_page, page) { results }` works for Series, Author, Book, Character in 90–135 ms |
| Depth limit hit | No |
| Open Library | The test request failed on the first run; re-check in Phase 6 (now a fallback only) |

---

## Decisions (locked)

- **Single user.** No accounts. Cloudflare Access protects the app.
- **Order:** release order, as the author intended. In practice: sort by the author's series number. When a later-released prequel is numbered 0, the number wins.
- **Numbering:** two-digit labels with decimals kept: `01 02 03 03.5 04 05`.
- **Formats:** no format tracking (no audiobooks).
- **Ratings:** 1–5 whole stars per book, only on books marked read. Tap a star to set; tap the same star again to clear. Series shows "Your avg" (one decimal).
- **Refresh:** monthly for active series (including a book due within 60 days); every 90 days for complete or dormant ones; manual "Refresh now".
- **Look:** B · Modern in Forest & burgundy, with #2A1A1F as the darkest color.
- **Recommendations:** hybrid. Tag overlap picks ~20 candidates; Claude Haiku picks 5 from that list and writes a reason.

---

## Architecture

```
Browser (PWA, React)
   │  JSON over /api/*
   ▼
Cloudflare Worker (Hono) ──► D1 (truth) · KV (search cache) · R2 (covers)
   │        ▲
   │        └── Cron, daily: refresh series whose next_refresh_at has passed
   ▼
Hardcover · Open Library · Wikidata · Claude Haiku   (only on search, first track, refresh, "refresh now")
```

### Repo layout

```
src/
  shared/            # types, numbering, ordering, refresh rules, palette tokens (no Worker or DOM APIs)
  worker/
    index.ts         # Hono app + scheduled() handler
    routes/          # search.ts, series.ts, books.ts, home.ts
    sources/         # hardcover.ts, openlibrary.ts, wikidata.ts, haiku.ts
    db/              # queries.ts
    jobs/            # refresh.ts, safelines.ts, recs.ts
  web/
    main.tsx, App.tsx
    pages/           # Home, Search, Series, Upcoming
    components/      # SeriesCard, BookRow, StarRating, NumberBadge, ComingSoonCard, RecCard, TabBar
    styles/tokens.css
migrations/          # D1 SQL migrations
spike/               # Phase 0 script + report
```

### API routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/home` | Tracked series with next-up, progress, avg rating; upcoming list; unseen changes |
| GET | `/api/search?q=&type=` | `type` = all, series, author, book, character. Results grouped by series |
| POST | `/api/series/track` | Body `{ hardcoverSeriesId }`. Imports the series and its books, then returns it |
| POST | `/api/books/track` | Body `{ hardcoverBookId, trackSeries: boolean }` |
| GET | `/api/series/:id` | Series page data: books in order, tracking, ratings, coming soon, recs |
| PATCH | `/api/series/:id/books/:bookId` | `{ positionOverride?, hidden?, safeLine? }` (user edits, locked) |
| PATCH | `/api/books/:id/tracking` | `{ status?, rating?, note? }` |
| POST | `/api/series/:id/refresh` | Refresh now |
| GET | `/api/upcoming` | All future releases in tracked series, by date |

---

## Data model (`migrations/0001_init.sql`)

```sql
CREATE TABLE series (
  id INTEGER PRIMARY KEY,
  hardcover_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  author TEXT,
  is_completed INTEGER,              -- from Hardcover; NULL = unknown
  primary_books_count INTEGER,
  tags_json TEXT,                    -- merged genre/mood/trope tags across the series
  tracked INTEGER NOT NULL DEFAULT 1,
  last_refreshed_at TEXT,
  next_refresh_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  hardcover_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  release_date TEXT,                 -- ISO date, or NULL
  date_precision TEXT,               -- 'day' | 'month' | 'year' | NULL
  cover_key TEXT,                    -- R2 key; NULL = not copied yet
  cover_source_url TEXT,
  blurb TEXT,                        -- publisher description (may spoil)
  safe_line TEXT,                    -- spoiler-safe one-liner
  safe_line_locked INTEGER NOT NULL DEFAULT 0,
  users_read_count INTEGER,
  tags_json TEXT,
  updated_at TEXT
);

CREATE TABLE series_books (
  series_id INTEGER NOT NULL REFERENCES series(id),
  book_id INTEGER NOT NULL REFERENCES books(id),
  position REAL,                     -- from source; NULL = unnumbered
  position_override REAL,            -- user edit; wins
  kind TEXT NOT NULL DEFAULT 'novel',-- 'novel' | 'novella' | 'short' | 'extra'
  hidden INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (series_id, book_id)
);

CREATE TABLE tracking (
  book_id INTEGER PRIMARY KEY REFERENCES books(id),
  status TEXT NOT NULL DEFAULT 'unread', -- 'unread' | 'reading' | 'read' | 'skipped'
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  finished_on TEXT,
  note TEXT,                         -- "what I remember"
  updated_at TEXT
);

CREATE TABLE characters (
  id INTEGER PRIMARY KEY,
  series_id INTEGER NOT NULL REFERENCES series(id),
  name TEXT NOT NULL,
  source TEXT NOT NULL,              -- 'hardcover' | 'openlibrary' | 'wikidata' | 'model'
  UNIQUE (series_id, name)
);

CREATE TABLE recs (
  series_id INTEGER NOT NULL REFERENCES series(id),
  rec_hardcover_series_id INTEGER NOT NULL,
  rec_name TEXT NOT NULL,
  rec_author TEXT,
  score REAL,
  why TEXT,
  dismissed INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (series_id, rec_hardcover_series_id)
);

CREATE TABLE changes (
  id INTEGER PRIMARY KEY,
  series_id INTEGER NOT NULL REFERENCES series(id),
  type TEXT NOT NULL,                -- 'new_book' | 'date_change' | 'cover' | 'title'
  detail TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_series_next_refresh ON series(next_refresh_at);
CREATE INDEX idx_books_release ON books(release_date);
```

---

## Core rules (put these in `src/shared/` with unit tests)

### Numbering — `formatPosition(position, width)`

- Effective position = `position_override ?? position`.
- Whole numbers pad to `width`: 1 → `01`. `width` = 3 if any entry in the series is ≥ 100, else 2.
- Fractions keep their decimal: 3.5 → `03.5`, 3.25 → `03.25`.
- 0 → `00`.
- Two entries with the same position: sort by release date, then label `03.5a`, `03.5b`.
- `NULL` position, compilations, omnibus editions and companion guides go to an "Extras" group, hidden by default.

Required test cases:

| Input | Output |
| --- | --- |
| 1 | `01` |
| 3.5 | `03.5` |
| 0 | `00` |
| 12 | `12` |
| 3.25 | `03.25` |
| 7 in a series with a #104 | `007` |
| two at 3.5 (2019, 2021) | `03.5a`, `03.5b` |
| `[1, 2, 3, 3.5, 4, 5]` | `01 02 03 03.5 04 05` |

### Import filtering (critical; based on the spike)

Hardcover lists every edition as its own book. The import must reduce a series to one book per position. Put this in `src/shared/importFilter.ts` as a pure function with tests built from rows in `spike/REPORT.md`.

1. **Find the real series.** Import from a search hit's series id, never an exact-name lookup. If a record has `state = 'duplicate'`, follow `canonical_id`. Never import a series with 0 books.
2. **Drop compilations.** `book_series.compilation = true` or `books.compilation = true` → excluded (not even Extras).
3. **Drop split editions.** Exclude titles matching `/\bpart \d+\b|\(\d+ of \d+\)|dramatized adaptation|split volume|\bvol(ume)?\.? \d+\b|\btom(e)? \d+\b|\bcilt \d+\b/i`, and any row whose title contains another row's title plus one of these markers.
4. **Prefer English editions.** Filter on the book's default edition language (the community-documented filter is `default_physical_edition: { language_id: { _eq: 1 } }`; confirm by introspecting `editions` in Phase 1). Books with no language: keep for now and let step 5 choose.
5. **One book per position.** Among what's left at each position, keep the highest `users_read_count`. Ties: prefer `featured = true`, then the earliest sane release date.
6. **Clean dates.** A release date before 1800 → NULL. For the kept book, use the earliest sane release date among its English editions if the book's own date looks wrong.
7. **Kinds.** Fractional position → `novella` (short fiction). NULL position → `extra` (hidden by default).
8. **Coming soon** is decided on the kept book only. A future date on a translation or reissue is never "coming soon".

Expected result for The Stormlight Archive (check in Phase 1): 01 The Way of Kings, 02 Words of Radiance, 02.5 Edgedancer, 03 Oathbringer, 03.5 Dawnshard, 04 Rhythm of War, 05 Wind and Truth, plus whatever other short fiction Hardcover numbers, and no translations, box sets, "Part N" or "(N of 5)" entries.

### Refresh scheduling — `nextRefreshAt(series, books, now)`

- **Active** (a book released in the last 3 years, an announced future book, or a book due within 60 days): now + 30 days.
- **Complete or dormant:** now + 90 days. Hardcover's `is_completed` came back null in the spike, so infer this from the dates; treat `is_completed = true` as a bonus signal only.
- Add ±2 days of jitter so refreshes don't bunch up.
- Cron runs daily (e.g. `17 9 * * *`). Each run handles at most 25 due series, one Hardcover query per series.
- On refresh: update source fields only; never touch `position_override`, locked `safe_line`, `hidden`, `tracking`. Write a `changes` row for a new book, a moved date, a new cover or a new title.

### Release-date display

- `date_precision = 'day'` → "Mar 3, 2027"; `'month'` → "Mar 2027"; `'year'` → "2027".
- Future-dated books go in "Coming soon", not the main list.

---

## Model calls (Claude Haiku, `claude-haiku-5-5`)

Key: `ANTHROPIC_API_KEY` (Worker secret). Both jobs run in the background after a series is tracked, never on page load.

### Spoiler-safe line (one call per book, ever)

System prompt:

> You write one-line, spoiler-free reminders for books in a series. The reader has read the earlier books and wants to tell this one apart. Write one line of 25 words or fewer covering the premise, the setting, and who the book centers on. Never mention outcomes, deaths, betrayals, reveals, twists, or relationship changes, including any from earlier books. If the blurb is empty or unusable, reply exactly: SKIP

User message: series name, position label, title, publisher blurb.

Store the result in `books.safe_line`. On `SKIP`, show "No description yet". Never overwrite when `safe_line_locked = 1`.

### Recommendations (one call per series per rebuild)

1. Candidates: Hardcover series sharing tags with this series. Weight mood and trope tags 3×, genre tags 1×. Drop tracked series and series under 2 books. Keep the top 20 by score.
2. Prompt Haiku with this series' tags and description plus the 20 candidates (id, name, author, tags, short description). Ask for JSON: `[{ "id": <candidate id>, "why": "<≤15 words about style, characters or genre>" }]`, exactly 5 items, ids from the list only.
3. Validate: drop any id not in the candidate list. If fewer than 3 survive, fill from the top tag scores with no reason.
4. Rebuild when: a series is tracked or finished, "refresh recs" is pressed, or the recs are older than 30 days.

---

## Design (B · Modern, Forest & burgundy)

Mockups: https://claude.ai/artifact/Vq2GuvNjpmt193UFRW2pDg (artboards "B · Modern — Home" and "B · Modern — Series page").

### Tokens (`src/web/styles/tokens.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#f3ebdd` | Page background (tan) |
| `--surface` | `#fbf7ef` | Cards, inputs |
| `--ink` | `#2a1a1f` | Text and the darkest color everywhere |
| `--muted` | `#5c4b4f` | Secondary text |
| `--line` | `#d8ccb6` | Borders, dividers |
| `--primary` | `#24452f` | Forest green: header band, number badges, progress, primary buttons |
| `--on-primary` | `#fbf7ef` | Text on forest |
| `--accent` | `#7a2633` | Burgundy: "Reading" badge, filled stars, Track button, coming-soon border |
| `--on-accent` | `#fbf7ef` | Text on burgundy |
| `--soft` | `#f2e2e0` | Novella number badge, progress track |

- Fonts: **Space Grotesk** (500/600/700) for headings, numbers and badges; **Inter** (400/500/600) for body.
- Radius: cards 16–18px, covers 8–10px, pills 999px, number badges 10px.
- Touch targets at least 44px. Text contrast at least 4.5:1.
- No gradients, no emoji, inline stroke icons.

### Components

- **SeriesCard** (home): cover, title, ★ avg · read/total, burgundy "next" pill with the label, title of next book, progress bar.
- **BookRow** (series page): number badge (forest; novellas use `--soft` and are indented 20px), title, year · kind, status ("Reading" pill or read check), safe line, StarRating when read.
- **StarRating**: 5 buttons, 40px hit area, `aria-label="Rate N of 5"`, filled burgundy / outline muted, tap same star to clear, "N of 5" or "Not rated".
- **Stat tiles** (series page): Read, Your avg ★, Up next, Next out.
- **ComingSoonCard**: dashed burgundy border, muted number badge, date at stated precision.
- **RecCard**: cover, name, author, one-line reason, "Track series" button. Horizontal scroll.
- **TabBar**: floating forest pill: Series, Search, Upcoming.
- "Publisher blurbs hidden to avoid spoilers. Show" link under the list; "Last checked <date> · Refresh now" at the bottom.

---

## Phases

Each phase ends with a commit. Don't start the next phase until its checks pass.

### Phase 1 — Data core

**Goal:** search Hardcover, track a series, see its series page with correct numbering and covers.

- Scaffold: Vite + React + TypeScript + `@cloudflare/vite-plugin`, Hono, Vitest. `wrangler.jsonc` with D1 (`antholo-genius`), KV (`SEARCH_CACHE`), R2 (`COVERS`), and the daily cron.
- Migration `0001_init.sql` from above.
- `src/shared/numbering.ts` + tests (all cases above).
- `src/worker/sources/hardcover.ts`: typed client, throttle, User-Agent, 401/403 handling, search, getSeries, getBook. Field names from the spike report.
- Import: track a series → write series, books, series_books (dedupe rules), copy covers to R2.
- Pages: Search (series results only for now) and Series (header, stat tiles with placeholders, BookRow list, Coming soon, Extras toggle).
- Design tokens and fonts in place.

- `src/shared/importFilter.ts` + tests (see Import filtering). Write the tests first, from real rows in `spike/REPORT.md`.

**Checks:** `npm test` passes. Tracking "The Stormlight Archive" from search gives the expected list under Import filtering, with no translations, box sets or split editions. Tracking "The Expanse" and "Discworld" from search lands on real records with books, not the empty duplicates. Covers come from R2. Refreshing the page makes no Hardcover call.

### Phase 2 — Tracking and ratings

**Goal:** the app is usable day to day.

- Per-book status (unread/reading/read/skipped), StarRating on read books, "what I remember" note.
- Home: SeriesCards with next-up, progress, ★ avg; empty state that points to Search.
- Track a single book: ask "Track the whole series, or just this book?"
- Position override and hide-entry (long-press or edit menu on a BookRow).

**Checks:** rating a book updates the series avg and the home card. Overrides survive a re-import. The home screen loads from D1 only.

### Phase 3 — Freshness

**Goal:** new books and dates appear without you doing anything.

- `nextRefreshAt` + tests. Daily `scheduled()` handler, 25 series per run. "Refresh now" button.
- `changes` rows; "New" markers on home; Upcoming page (all future releases by date).
- Hardcover token-expired banner.

**Checks:** with a test series' `next_refresh_at` set to the past, running the cron locally (`curl "http://localhost:8787/cdn-cgi/handler/scheduled"` or `wrangler dev --test-scheduled`) refreshes it and sets the next date 30 or 90 days out (±2). User edits are untouched.

### Phase 4 — Spoiler-safe lines

**Goal:** every book shows a safe line; blurbs hide behind a tap.

- `haiku.ts` client; `safelines.ts` job (runs after import, queued per book).
- Edit-and-lock on a BookRow. "Show publisher blurbs" toggle.

**Checks:** a newly tracked series gets safe lines within a minute. Editing one locks it, and a refresh doesn't change it.

### Phase 5 — Recommendations

**Goal:** "If you like X, try" shows 5 real series with reasons.

- Candidate scoring + tests; Haiku rerank; validation; dismiss; "Track series" from a RecCard.

**Checks:** every rec opens a real Hardcover series. Dismissed recs stay gone after a rebuild.

### Phase 6 — Character search

**Goal:** search by character name.

- Order: local `characters` table → Hardcover `search(query_type: "Character")`, then `book_characters` to find the series → Open Library `person=` → Wikidata → Haiku suggestions (validated, labeled "suggested"). The spike showed Hardcover has character data, so the fallbacks should rarely run.
- Save characters found for tracked series into `characters`.

**Checks:** "Harry Dresden" finds The Dresden Files. A made-up name returns "No matches", not an invented series.

### Phase 7 — Polish and deploy

- PWA: manifest, icons, service worker (cache the shell and the last API responses for offline reading).
- Cloudflare Access in front of the Worker (one-user policy, your email).
- `npm run deploy`; `wrangler secret put HARDCOVER_TOKEN` and `ANTHROPIC_API_KEY`; apply migrations with `--remote`.
- Optional later: sync read status and ratings to Hardcover; Expo app reusing `src/shared/`.

**Checks:** installs to the iPhone home screen. Opens offline and shows the last-loaded series. Unauthenticated requests are blocked by Access.

---

## Out of scope (for now)

Social features, other people's ratings, multiple users, format tracking, release alerts (push or email), publication-order and in-world-order toggles.
