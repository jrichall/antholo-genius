import type { ImportedBook } from '../../shared/types';
import type { TrackingState } from '../../shared/tracking';

export interface SeriesRow {
  id: number; hardcover_id: number; name: string; author: string | null;
  is_completed: number | null; primary_books_count: number | null; last_refreshed_at: string | null;
}

export interface SeriesBookRow {
  book_id: number; title: string; release_date: string | null; date_precision: string | null;
  cover_key: string | null; blurb: string | null; safe_line: string | null;
  position: number | null; position_override: number | null; kind: string; hidden: number;
  status: string | null; rating: number | null; note: string | null;
}

export const getSeriesByHardcoverId = (db: D1Database, hcId: number) =>
  db.prepare('SELECT * FROM series WHERE hardcover_id = ?').bind(hcId).first<SeriesRow>();

export const getSeriesById = (db: D1Database, id: number) =>
  db.prepare('SELECT * FROM series WHERE id = ?').bind(id).first<SeriesRow>();

export const listSeriesBooks = (db: D1Database, seriesId: number) =>
  db
    .prepare(
      `SELECT b.id AS book_id, b.title, b.release_date, b.date_precision, b.cover_key, b.blurb, b.safe_line,
              sb.position, sb.position_override, sb.kind, sb.hidden, t.status, t.rating, t.note
       FROM series_books sb
       JOIN books b ON b.id = sb.book_id
       LEFT JOIN tracking t ON t.book_id = b.id
       WHERE sb.series_id = ?`
    )
    .bind(seriesId)
    .all<SeriesBookRow>()
    .then((r) => r.results);

export const listTrackedSeries = (db: D1Database) =>
  db.prepare('SELECT id, name, author FROM series WHERE tracked = 1 ORDER BY name').all<{ id: number; name: string; author: string | null }>().then((r) => r.results);

/**
 * Writes a series and its filtered books. Source fields only: position_override, hidden,
 * locked safe lines and tracking are never touched, so user edits survive a re-import.
 */
export async function saveImport(
  db: D1Database,
  s: { hardcoverId: number; name: string; author: string | null; isCompleted: boolean | null; primaryBooksCount: number | null; tags: string[] },
  books: ImportedBook[],
  nowIso: string
): Promise<number> {
  await db
    .prepare(
      `INSERT INTO series (hardcover_id, name, author, is_completed, primary_books_count, tags_json, last_refreshed_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(hardcover_id) DO UPDATE SET name = ?2, author = COALESCE(?3, author), is_completed = ?4,
         primary_books_count = ?5, tags_json = ?6, last_refreshed_at = ?7, tracked = 1`
    )
    .bind(s.hardcoverId, s.name, s.author, s.isCompleted === null ? null : +s.isCompleted, s.primaryBooksCount, JSON.stringify(s.tags), nowIso)
    .run();
  const { id } = (await getSeriesByHardcoverId(db, s.hardcoverId))!;

  const bookStmt = db.prepare(
    `INSERT INTO books (hardcover_id, title, release_date, date_precision, cover_source_url, blurb, users_read_count, tags_json, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT(hardcover_id) DO UPDATE SET title = ?2, release_date = ?3, date_precision = ?4,
       cover_source_url = ?5, blurb = ?6, users_read_count = ?7, tags_json = ?8, updated_at = ?9`
  );
  await db.batch(
    books.map((b) =>
      bookStmt.bind(b.bookId, b.title, b.releaseDate, b.datePrecision, b.coverUrl, b.description, b.usersReadCount, JSON.stringify(b.tags), nowIso)
    )
  );
  const linkStmt = db.prepare(
    `INSERT INTO series_books (series_id, book_id, position, kind)
     SELECT ?1, id, ?3, ?4 FROM books WHERE hardcover_id = ?2
     ON CONFLICT(series_id, book_id) DO UPDATE SET position = ?3, kind = ?4`
  );
  await db.batch(books.map((b) => linkStmt.bind(id, b.bookId, b.position, b.kind)));
  return id;
}

export const booksNeedingCovers = (db: D1Database, seriesId: number) =>
  db
    .prepare(
      `SELECT b.id, b.cover_source_url AS url FROM books b JOIN series_books sb ON sb.book_id = b.id
       WHERE sb.series_id = ? AND b.cover_key IS NULL AND b.cover_source_url IS NOT NULL`
    )
    .bind(seriesId)
    .all<{ id: number; url: string }>()
    .then((r) => r.results);

export const setCoverKey = (db: D1Database, bookId: number, key: string) =>
  db.prepare('UPDATE books SET cover_key = ? WHERE id = ?').bind(key, bookId).run();

// ---- Phase 2: tracking, edits, home ----------------------------------------

export const bookExists = (db: D1Database, bookId: number) =>
  db.prepare('SELECT id FROM books WHERE id = ?').bind(bookId).first<{ id: number }>().then((r) => !!r);

export const getTracking = (db: D1Database, bookId: number): Promise<TrackingState | null> =>
  db
    .prepare('SELECT status, rating, note, finished_on FROM tracking WHERE book_id = ?')
    .bind(bookId)
    .first<{ status: TrackingState['status']; rating: number | null; note: string | null; finished_on: string | null }>()
    .then((r) => (r ? { status: r.status, rating: r.rating, note: r.note, finishedOn: r.finished_on } : null));

export const saveTracking = (db: D1Database, bookId: number, t: TrackingState, nowIso: string) =>
  db
    .prepare(
      `INSERT INTO tracking (book_id, status, rating, finished_on, note, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(book_id) DO UPDATE SET status = ?2, rating = ?3, finished_on = ?4, note = ?5, updated_at = ?6`
    )
    .bind(bookId, t.status, t.rating, t.finishedOn, t.note, nowIso)
    .run();

export const seriesBookExists = (db: D1Database, seriesId: number, bookId: number) =>
  db.prepare('SELECT 1 AS x FROM series_books WHERE series_id = ? AND book_id = ?').bind(seriesId, bookId).first().then((r) => !!r);

/** User edits: position_override and hidden. Source refreshes never write these columns. */
export const saveSeriesBookEdit = (db: D1Database, seriesId: number, bookId: number, edit: { positionOverride?: number | null; hidden?: boolean }) => {
  const sets: string[] = [];
  const vals: unknown[] = [];
  if ('positionOverride' in edit) { sets.push('position_override = ?'); vals.push(edit.positionOverride ?? null); }
  if ('hidden' in edit) { sets.push('hidden = ?'); vals.push(edit.hidden ? 1 : 0); }
  return db.prepare(`UPDATE series_books SET ${sets.join(', ')} WHERE series_id = ? AND book_id = ?`).bind(...vals, seriesId, bookId).run();
};

/** Every book of every tracked series, with tracking. One query for the home screen (D1 only). */
export const listTrackedSeriesBooks = (db: D1Database) =>
  db
    .prepare(
      `SELECT sb.series_id, b.id AS book_id, b.title, b.release_date, b.date_precision, b.cover_key, b.blurb, b.safe_line,
              sb.position, sb.position_override, sb.kind, sb.hidden, t.status, t.rating, t.note
       FROM series_books sb
       JOIN series s ON s.id = sb.series_id AND s.tracked = 1
       JOIN books b ON b.id = sb.book_id
       LEFT JOIN tracking t ON t.book_id = b.id`
    )
    .all<SeriesBookRow & { series_id: number }>()
    .then((r) => r.results);

export const listTrackedSeriesFull = (db: D1Database) =>
  db.prepare('SELECT id, name, author FROM series WHERE tracked = 1 ORDER BY name').all<{ id: number; name: string; author: string | null }>().then((r) => r.results);

/** Books tracked on their own: they have a tracking row but belong to no tracked series. */
export const listSingleBooks = (db: D1Database) =>
  db
    .prepare(
      `SELECT b.id AS book_id, b.title, b.release_date, b.date_precision, b.cover_key, t.status, t.rating, t.note
       FROM tracking t JOIN books b ON b.id = t.book_id
       WHERE NOT EXISTS (SELECT 1 FROM series_books sb JOIN series s ON s.id = sb.series_id AND s.tracked = 1 WHERE sb.book_id = b.id)
       ORDER BY b.title`
    )
    .all<{ book_id: number; title: string; release_date: string | null; date_precision: string | null; cover_key: string | null; status: string; rating: number | null; note: string | null }>()
    .then((r) => r.results);

export const getBookByHardcoverId = (db: D1Database, hcId: number) =>
  db.prepare('SELECT id, cover_key, cover_source_url FROM books WHERE hardcover_id = ?').bind(hcId).first<{ id: number; cover_key: string | null; cover_source_url: string | null }>();

export const saveSingleBook = (
  db: D1Database,
  b: { hardcoverId: number; title: string; releaseDate: string | null; datePrecision: string | null; coverUrl: string | null; description: string | null },
  nowIso: string
) =>
  db
    .prepare(
      `INSERT INTO books (hardcover_id, title, release_date, date_precision, cover_source_url, blurb, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(hardcover_id) DO NOTHING`
    )
    .bind(b.hardcoverId, b.title, b.releaseDate, b.datePrecision, b.coverUrl, b.description, nowIso)
    .run();

/** Creates an unread tracking row if the book has none. Never changes an existing row. */
export const ensureTracking = (db: D1Database, bookId: number, nowIso: string) =>
  db.prepare("INSERT INTO tracking (book_id, status, updated_at) VALUES (?, 'unread', ?) ON CONFLICT(book_id) DO NOTHING").bind(bookId, nowIso).run();

/** The tracked series a book already belongs to, if any. */
export const trackedSeriesOfBook = (db: D1Database, bookId: number) =>
  db
    .prepare('SELECT sb.series_id AS id FROM series_books sb JOIN series s ON s.id = sb.series_id AND s.tracked = 1 WHERE sb.book_id = ? LIMIT 1')
    .bind(bookId)
    .first<{ id: number }>();
