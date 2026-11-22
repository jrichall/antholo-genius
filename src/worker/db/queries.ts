import type { ImportedBook } from '../../shared/types';

export interface SeriesRow {
  id: number; hardcover_id: number; name: string; author: string | null;
  is_completed: number | null; primary_books_count: number | null; last_refreshed_at: string | null;
}

export interface SeriesBookRow {
  book_id: number; title: string; release_date: string | null; date_precision: string | null;
  cover_key: string | null; blurb: string | null; safe_line: string | null;
  position: number | null; position_override: number | null; kind: string; hidden: number;
  status: string | null; rating: number | null;
}

export const getSeriesByHardcoverId = (db: D1Database, hcId: number) =>
  db.prepare('SELECT * FROM series WHERE hardcover_id = ?').bind(hcId).first<SeriesRow>();

export const getSeriesById = (db: D1Database, id: number) =>
  db.prepare('SELECT * FROM series WHERE id = ?').bind(id).first<SeriesRow>();

export const listSeriesBooks = (db: D1Database, seriesId: number) =>
  db
    .prepare(
      `SELECT b.id AS book_id, b.title, b.release_date, b.date_precision, b.cover_key, b.blurb, b.safe_line,
              sb.position, sb.position_override, sb.kind, sb.hidden, t.status, t.rating
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
