import { cleanDate, importFilter, inferPrecision, pickSeriesRecord } from '../shared/importFilter';
import type { Env } from './env';
import * as q from './db/queries';
import { getBookWithSeries, getSeries } from './sources/hardcover';

const MAX_COVERS_PER_REQUEST = 40; // keeps subrequests inside the Worker limit

/** Copies cover images to R2 (the app serves them from /img/*). Failures are skipped, not fatal. */
export async function copyCovers(env: Env, seriesId: number): Promise<void> {
  await copyCoverRows(env, (await q.booksNeedingCovers(env.DB, seriesId)).slice(0, MAX_COVERS_PER_REQUEST));
}

async function copyCoverRows(env: Env, todo: Array<{ id: number; url: string }>): Promise<void> {
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (b) => {
        try {
          const res = await fetch(b.url, { signal: AbortSignal.timeout(10000) });
          const type = res.headers.get('content-type') ?? '';
          if (!res.ok || !type.startsWith('image/')) return;
          const key = `covers/${b.id}`;
          await env.COVERS.put(key, res.body, { httpMetadata: { contentType: type } });
          await q.setCoverKey(env.DB, b.id, key);
        } catch { /* leave cover_key null; the UI shows a placeholder */ }
      })
    );
  }
}

/** Tracks a series. A series already in D1 is returned as-is with no Hardcover call. */
export async function trackSeries(env: Env, hardcoverSeriesId: number, author: string | null): Promise<number | null> {
  const existing = await q.getSeriesByHardcoverId(env.DB, hardcoverSeriesId);
  if (existing) return existing.id;

  let fetched = await getSeries(env.HARDCOVER_TOKEN, hardcoverSeriesId);
  if (!fetched) return null;
  let pick = pickSeriesRecord(fetched.series, () => null);
  if (!pick && fetched.series.state === 'duplicate' && fetched.series.canonicalId) {
    const canon = await getSeries(env.HARDCOVER_TOKEN, fetched.series.canonicalId);
    if (!canon) return null;
    pick = pickSeriesRecord(fetched.series, () => canon.series);
    if (pick) {
      const already = await q.getSeriesByHardcoverId(env.DB, canon.series.id);
      if (already) return already.id;
      fetched = canon;
    }
  }
  if (!pick) return null;

  const books = importFilter(fetched.rows, new Date().toISOString().slice(0, 10));
  if (!books.length) return null;
  const tags = [...new Set(books.flatMap((b) => Object.values(b.tags).flat()))].slice(0, 60);
  const id = await q.saveImport(
    env.DB,
    {
      hardcoverId: fetched.series.id,
      name: fetched.series.name,
      author,
      isCompleted: fetched.series.isCompleted,
      primaryBooksCount: fetched.series.primaryBooksCount,
      tags
    },
    books,
    new Date().toISOString()
  );
  await copyCovers(env, id);
  return id;
}

/**
 * Tracks one book on its own. Returns the new book id. A book already in D1 makes no Hardcover call;
 * the tracking row is created (status unread) only if there is none, so it never resets user data.
 */
export async function trackSingleBook(env: Env, hardcoverBookId: number): Promise<number | null> {
  let row = await q.getBookByHardcoverId(env.DB, hardcoverBookId);
  if (!row) {
    const b = await getBookWithSeries(env.HARDCOVER_TOKEN, hardcoverBookId);
    if (!b) return null;
    const date = cleanDate(b.releaseDate);
    await q.saveSingleBook(env.DB, {
      hardcoverId: b.id, title: b.title, releaseDate: date, datePrecision: inferPrecision(date),
      coverUrl: b.coverUrl, description: b.description
    }, new Date().toISOString());
    row = await q.getBookByHardcoverId(env.DB, hardcoverBookId);
    if (!row) return null;
    await copyCoverRows(env, row.cover_key === null && row.cover_source_url ? [{ id: row.id, url: row.cover_source_url }] : []);
  }
  await q.ensureTracking(env.DB, row.id, new Date().toISOString());
  return row.id;
}
