import { Hono } from 'hono';
import type { Env } from '../env';
import { isComingSoon } from '../../shared/importFilter';
import { labelEntries } from '../../shared/numbering';
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
  const rows = await q.listSeriesBooks(c.env.DB, series.id);

  const labelled = labelEntries(
    rows.map((r) => ({ id: r.book_id, position: r.position, positionOverride: r.position_override, releaseDate: r.release_date, row: r }))
  ).map(({ row: r, label }) => ({
    id: r.book_id,
    title: r.title,
    label,
    kind: label === null ? 'extra' : r.kind,
    releaseDate: r.release_date,
    datePrecision: r.date_precision,
    coverUrl: r.cover_key ? `/img/${r.cover_key}` : null,
    safeLine: r.safe_line,
    status: r.status ?? 'unread',
    rating: r.rating,
    hidden: !!r.hidden
  }));

  const visible = labelled.filter((b) => !b.hidden);
  const extras = visible.filter((b) => b.kind === 'extra');
  const numbered = visible.filter((b) => b.kind !== 'extra');
  const comingSoon = numbered.filter((b) => isComingSoon(b.releaseDate, today));
  const books = numbered.filter((b) => !isComingSoon(b.releaseDate, today));
  const read = books.filter((b) => b.status === 'read');
  const rated = read.filter((b) => b.rating);
  const next = books.find((b) => b.status !== 'read' && b.status !== 'skipped') ?? null;

  return c.json({
    series: { id: series.id, name: series.name, author: series.author, lastRefreshedAt: series.last_refreshed_at },
    stats: {
      read: read.length,
      total: books.length,
      avgRating: rated.length ? Math.round((rated.reduce((n, b) => n + (b.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
      upNext: next ? { label: next.label, title: next.title } : null,
      nextOut: comingSoon[0] ? { label: comingSoon[0].label, title: comingSoon[0].title, releaseDate: comingSoon[0].releaseDate, datePrecision: comingSoon[0].datePrecision } : null
    },
    books,
    comingSoon,
    extras
  });
});
