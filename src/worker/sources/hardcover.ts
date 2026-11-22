// The ONLY place Hardcover is called from. Worker-side only, never the browser.
import type { HcRow, SearchBookHit, SearchSeriesHit } from '../../shared/types';
import type { SeriesRecordInfo } from '../../shared/importFilter';

const ENDPOINT = 'https://api.hardcover.app/v1/graphql';
export const USER_AGENT = 'antholo-genius/0.1 (personal series tracker; one user)';
export const TOKEN_EXPIRED_MESSAGE = 'Hardcover token expired — update HARDCOVER_TOKEN';
const MIN_GAP_MS = 1100; // stays under 1 request/second (limit is 60/min)
// Rule: at most 10 top-level fields per query. Every query below uses 1-2.

export class HardcoverAuthError extends Error {
  constructor() {
    super(TOKEN_EXPIRED_MESSAGE);
  }
}
export class HardcoverError extends Error {}

// Serialises requests within an isolate so calls are at least MIN_GAP_MS apart.
let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

async function gql<T>(token: string, query: string, variables: Record<string, unknown> = {}, timeoutMs = 20000): Promise<T> {
  const res = await throttled(() =>
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        'user-agent': USER_AGENT
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(timeoutMs)
    })
  );
  if (res.status === 401 || res.status === 403) throw new HardcoverAuthError();
  const text = await res.text();
  let json: { data?: T; errors?: Array<{ message: string }> };
  try { json = JSON.parse(text); } catch { throw new HardcoverError(`Hardcover returned HTTP ${res.status}`); }
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join('; ');
    // Hasura reports a bad/expired JWT as a GraphQL error, not an HTTP status.
    if (/jwt|unauthori[sz]ed|invalid token|expired/i.test(msg) && !json.data) throw new HardcoverAuthError();
    if (!json.data) throw new HardcoverError(msg);
  }
  if (!json.data) throw new HardcoverError(`Hardcover returned HTTP ${res.status}`);
  return json.data;
}

// ---- search ----------------------------------------------------------------

interface SearchDoc {
  id?: number | string;
  name?: string;
  author_name?: string;
  author?: { name?: string };
  books_count?: number;
  image?: { url?: string } | string | null;
}

export async function searchSeries(token: string, q: string): Promise<SearchSeriesHit[]> {
  const data = await gql<{ search: { results: { hits?: Array<{ document: SearchDoc }> } | null } }>(
    token,
    'query($q:String!){ search(query:$q, query_type:"Series", per_page:10, page:1){ results } }',
    { q },
    8000 // search has a 2 s server limit; fail fast
  );
  const hits = data.search?.results?.hits ?? [];
  return hits
    .map((h) => h.document)
    .filter((d) => d && d.id && d.name)
    .map((d) => ({
      hardcoverId: Number(d.id),
      name: String(d.name),
      author: d.author_name ?? d.author?.name ?? null,
      booksCount: d.books_count ?? null,
      coverUrl: typeof d.image === 'string' ? d.image : d.image?.url ?? null
    }));
}

// ---- series ----------------------------------------------------------------

export interface HcSeries extends SeriesRecordInfo {
  name: string;
  isCompleted: boolean | null;
  primaryBooksCount: number | null;
}

const SERIES_FIELDS = 'id name state canonical_id is_completed books_count primary_books_count';
const BOOK_FIELDS = 'id title release_date compilation users_read_count description cached_tags cached_image';
const EDITION = 'default_physical_edition { language_id release_date }';

const seriesQuery = (withEdition: boolean) =>
  `query($id:Int!){ series_by_pk(id:$id){ ${SERIES_FIELDS} } book_series(where:{series_id:{_eq:$id}}, order_by:{position:asc}, limit:500){ position featured compilation book { ${BOOK_FIELDS}${withEdition ? ' ' + EDITION : ''} } } }`;

interface RawSeries {
  series_by_pk: { id: number; name: string; state: string | null; canonical_id: number | null; is_completed: boolean | null; books_count: number | null; primary_books_count: number | null } | null;
  book_series: Array<{
    position: number | null;
    featured: boolean;
    compilation: boolean;
    book: {
      id: number; title: string; release_date: string | null; compilation: boolean | null;
      users_read_count: number | null; description: string | null;
      cached_tags: unknown; cached_image: unknown;
      default_physical_edition?: { language_id: number | null; release_date: string | null } | null;
    } | null;
  }>;
}

/** cached_tags is { Category: [{ tag: "name", ... }] }. Keep category -> names. */
export function parseTags(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [cat, items] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(items)) continue;
    const names = items.map((i) => (i && typeof i === 'object' ? (i as { tag?: unknown }).tag : null)).filter((t): t is string => typeof t === 'string');
    if (names.length) out[cat] = names;
  }
  return out;
}

const coverFrom = (img: unknown): string | null =>
  img && typeof img === 'object' && typeof (img as { url?: unknown }).url === 'string' ? (img as { url: string }).url : null;

export async function getSeries(token: string, id: number): Promise<{ series: HcSeries; rows: HcRow[] } | null> {
  let raw: RawSeries;
  try {
    raw = await gql<RawSeries>(token, seriesQuery(true), { id });
  } catch (e) {
    // The edition field names come from community docs; fall back if the schema disagrees.
    if (e instanceof HardcoverError && /default_physical_edition|language_id/i.test(e.message)) {
      raw = await gql<RawSeries>(token, seriesQuery(false), { id });
    } else throw e;
  }
  const s = raw.series_by_pk;
  if (!s) return null;
  const rows: HcRow[] = [];
  for (const r of raw.book_series) {
    if (!r.book) continue;
    const ed = r.book.default_physical_edition;
    rows.push({
      bookId: r.book.id,
      title: r.book.title,
      position: r.position,
      featured: r.featured,
      compilation: r.compilation || !!r.book.compilation,
      usersReadCount: r.book.users_read_count,
      releaseDate: r.book.release_date,
      languageId: ed?.language_id ?? null,
      editionDates: ed?.language_id === 1 && ed.release_date ? [ed.release_date] : [],
      description: r.book.description,
      coverUrl: coverFrom(r.book.cached_image),
      tags: parseTags(r.book.cached_tags)
    });
  }
  return {
    series: {
      id: s.id, name: s.name, state: s.state, canonicalId: s.canonical_id,
      booksCount: s.books_count, isCompleted: s.is_completed, primaryBooksCount: s.primary_books_count
    },
    rows
  };
}

export interface HcBook { id: number; title: string; releaseDate: string | null; description: string | null; coverUrl: string | null }

export async function getBook(token: string, id: number): Promise<HcBook | null> {
  const d = await gql<{ books_by_pk: { id: number; title: string; release_date: string | null; description: string | null; cached_image: unknown } | null }>(
    token,
    'query($id:Int!){ books_by_pk(id:$id){ id title release_date description cached_image } }',
    { id }
  );
  const b = d.books_by_pk;
  return b ? { id: b.id, title: b.title, releaseDate: b.release_date, description: b.description, coverUrl: coverFrom(b.cached_image) } : null;
}

// ---- Phase 2: single books -------------------------------------------------

interface BookSearchDoc {
  id?: number | string;
  title?: string;
  author_names?: string[];
  release_year?: number | null;
  image?: { url?: string } | string | null;
}

export async function searchBooks(token: string, q: string): Promise<SearchBookHit[]> {
  const data = await gql<{ search: { results: { hits?: Array<{ document: BookSearchDoc }> } | null } }>(
    token,
    'query($q:String!){ search(query:$q, query_type:"Book", per_page:10, page:1){ results } }',
    { q },
    8000
  );
  const hits = data.search?.results?.hits ?? [];
  return hits
    .map((h) => h.document)
    .filter((d) => d && d.id && d.title)
    .map((d) => ({
      hardcoverId: Number(d.id),
      title: String(d.title),
      author: d.author_names?.[0] ?? null,
      releaseYear: d.release_year ?? null,
      coverUrl: typeof d.image === 'string' ? d.image : d.image?.url ?? null
    }));
}

export interface HcBookWithSeries extends HcBook { seriesIds: number[] }

/** One book plus the series it belongs to (featured series first). Depth: book > book_series > series. */
export async function getBookWithSeries(token: string, id: number): Promise<HcBookWithSeries | null> {
  const d = await gql<{
    books_by_pk: {
      id: number; title: string; release_date: string | null; description: string | null; cached_image: unknown;
      book_series: Array<{ series_id: number; featured: boolean }>;
    } | null;
  }>(
    token,
    'query($id:Int!){ books_by_pk(id:$id){ id title release_date description cached_image book_series(order_by:{featured:desc}, limit:5){ series_id featured } } }',
    { id }
  );
  const b = d.books_by_pk;
  if (!b) return null;
  return {
    id: b.id, title: b.title, releaseDate: b.release_date, description: b.description, coverUrl: coverFrom(b.cached_image),
    seriesIds: b.book_series.map((r) => r.series_id)
  };
}
