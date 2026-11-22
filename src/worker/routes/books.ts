import { Hono } from 'hono';
import type { Env } from '../env';
import { applyTrackingPatch, parseTrackingPatch } from '../../shared/tracking';
import * as q from '../db/queries';
import { trackSeries, trackSingleBook } from '../import';
import { HardcoverAuthError, TOKEN_EXPIRED_MESSAGE, getBookWithSeries } from '../sources/hardcover';

export const bookRoutes = new Hono<{ Bindings: Env }>();

// Status, rating and note. Ratings only on read books; user data is never touched by refreshes.
bookRoutes.patch('/:id/tracking', async (c) => {
  const bookId = Number(c.req.param('id'));
  if (!Number.isInteger(bookId) || !(await q.bookExists(c.env.DB, bookId))) return c.json({ error: 'not_found' }, 404);
  const parsed = parseTrackingPatch(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: 'bad_request', message: parsed.error }, 400);
  const now = new Date();
  const next = applyTrackingPatch(await q.getTracking(c.env.DB, bookId), parsed.value, now.toISOString().slice(0, 10));
  if (!next.ok) return c.json({ error: 'not_allowed', message: next.error }, 422);
  await q.saveTracking(c.env.DB, bookId, next.value, now.toISOString());
  return c.json({ tracking: next.value });
});

// "Track the whole series, or just this book?" The client asks; trackSeries carries the answer.
bookRoutes.post('/track', async (c) => {
  const body = await c.req
    .json<{ hardcoverBookId?: number; trackSeries?: boolean; author?: string | null }>()
    .catch(() => ({} as { hardcoverBookId?: number; trackSeries?: boolean; author?: string | null }));
  if (!Number.isInteger(body.hardcoverBookId)) return c.json({ error: 'bad_request', message: 'hardcoverBookId required' }, 400);
  const hcId = body.hardcoverBookId!;
  try {
    if (body.trackSeries) {
      const known = await q.getBookByHardcoverId(c.env.DB, hcId);
      const inSeries = known ? await q.trackedSeriesOfBook(c.env.DB, known.id) : null;
      if (inSeries) return c.json({ seriesId: inSeries.id, bookId: known!.id });
      const book = await getBookWithSeries(c.env.HARDCOVER_TOKEN, hcId);
      if (!book) return c.json({ error: 'not_found', message: 'Hardcover has no such book.' }, 404);
      for (const sid of book.seriesIds) {
        const seriesId = await trackSeries(c.env, sid, body.author ?? null);
        if (seriesId) return c.json({ seriesId, bookId: null });
      }
      // No importable series: fall through and track just the book.
    }
    const bookId = await trackSingleBook(c.env, hcId);
    if (!bookId) return c.json({ error: 'not_found', message: 'Hardcover has no such book.' }, 404);
    return c.json({ seriesId: null, bookId, singleBook: true });
  } catch (e) {
    if (e instanceof HardcoverAuthError) return c.json({ error: 'token_expired', message: TOKEN_EXPIRED_MESSAGE }, 502);
    return c.json({ error: 'hardcover_error', message: (e as Error).message }, 502);
  }
});
