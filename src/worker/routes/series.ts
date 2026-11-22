import { Hono } from 'hono';
import type { Env } from '../env';
import { partitionEntries, seriesStats } from '../../shared/progress';
import { parsePositionOverride } from '../../shared/tracking';
import { toEntries } from '../seriesView';
import * as q from '../db/queries';
import { trackSeries } from '../import';
import { HardcoverAuthError, TOKEN_EXPIRED_MESSAGE } from '../sources/hardcover';

export const seriesRoutes = new Hono<{ Bindings: Env }>();

seriesRoutes.post('/track', async (c) => {
  const body = await c.req.json<{ hardcoverSeriesId?: number; author?: string | null }>().catch(() => ({} as { hardcoverSeriesId?: number; author?: string | null }));
  if (!Number.isInteger(body.hardcoverSeriesId)) return c.json({ error: 'hardcoverSeriesId required' }, 400);
  try {
    const id = await trackSeries(c.env, body.hardcoverSeriesId!, body.author ?? null);
    if (!id) return c.json({ error: 'no_books', message: 'That series has no books on Hardcover.' }, 422);
    return c.json({ id });
  } catch (e) {
    if (e instanceof HardcoverAuthError) return c.json({ error: 'token_expired', message: TOKEN_EXPIRED_MESSAGE }, 502);
    return c.json({ error: 'hardcover_error', message: (e as Error).message }, 502);
  }
});

seriesRoutes.get('/:id', async (c) => {
  const series = await q.getSeriesById(c.env.DB, Number(c.req.param('id')));
  if (!series) return c.json({ error: 'not_found' }, 404);
  const today = new Date().toISOString().slice(0, 10);
  const entries = toEntries(await q.listSeriesBooks(c.env.DB, series.id));
  const { books, comingSoon, extras, hidden } = partitionEntries(entries, today);
  const stats = seriesStats(books);
  const out = comingSoon[0] ?? null;

  return c.json({
    series: { id: series.id, name: series.name, author: series.author, lastRefreshedAt: series.last_refreshed_at },
    stats: {
      read: stats.read,
      total: stats.total,
      avgRating: stats.avgRating,
      upNext: stats.nextUp ? { label: stats.nextUp.label, title: stats.nextUp.title } : null,
      nextOut: out ? { label: out.label, title: out.title, releaseDate: out.releaseDate, datePrecision: out.datePrecision } : null
    },
    books,
    comingSoon,
    extras,
    hidden
  });
});

// User edits: position override and hide. Locked: a refresh or re-import never writes these.
seriesRoutes.patch('/:id/books/:bookId', async (c) => {
  const seriesId = Number(c.req.param('id'));
  const bookId = Number(c.req.param('bookId'));
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ error: 'bad_request', message: 'Body must be an object' }, 400);
  const edit: { positionOverride?: number | null; hidden?: boolean } = {};
  if ('positionOverride' in body) {
    const p = parsePositionOverride(body.positionOverride);
    if (!p.ok) return c.json({ error: 'bad_request', message: p.error }, 400);
    edit.positionOverride = p.value;
  }
  if ('hidden' in body) {
    if (typeof body.hidden !== 'boolean') return c.json({ error: 'bad_request', message: 'hidden must be true or false' }, 400);
    edit.hidden = body.hidden;
  }
  if (!('positionOverride' in edit) && !('hidden' in edit)) return c.json({ error: 'bad_request', message: 'Nothing to update' }, 400);
  if (!(await q.seriesBookExists(c.env.DB, seriesId, bookId))) return c.json({ error: 'not_found' }, 404);
  await q.saveSeriesBookEdit(c.env.DB, seriesId, bookId, edit);
  return c.json({ ok: true });
});
