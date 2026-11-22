import { Hono } from 'hono';
import type { Env } from '../env';
import { partitionEntries, seriesStats } from '../../shared/progress';
import { listSingleBooks, listTrackedSeriesBooks, listTrackedSeriesFull } from '../db/queries';
import { toEntries } from '../seriesView';

export const homeRoutes = new Hono<{ Bindings: Env }>();

// D1 only: no outside API is called here.
homeRoutes.get('/', async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const [series, rows, singles] = await Promise.all([listTrackedSeriesFull(c.env.DB), listTrackedSeriesBooks(c.env.DB), listSingleBooks(c.env.DB)]);
  const bySeries = new Map<number, typeof rows>();
  for (const r of rows) bySeries.set(r.series_id, [...(bySeries.get(r.series_id) ?? []), r]);

  const cards = series.map((s) => {
    const { books, comingSoon } = partitionEntries(toEntries(bySeries.get(s.id) ?? []), today);
    const stats = seriesStats(books);
    const next = stats.nextUp ? books.find((b) => b.id === stats.nextUp!.id) : null;
    const cover = (next ?? books[0])?.coverUrl ?? null;
    const out = comingSoon[0] ?? null;
    return {
      id: s.id,
      name: s.name,
      author: s.author,
      coverUrl: cover,
      read: stats.read,
      total: stats.total,
      avgRating: stats.avgRating,
      next: stats.nextUp ? { label: stats.nextUp.label, title: stats.nextUp.title } : null,
      comingSoon: out ? { label: out.label, title: out.title, releaseDate: out.releaseDate, datePrecision: out.datePrecision } : null
    };
  });

  return c.json({
    series: cards,
    books: singles.map((b) => ({
      id: b.book_id, title: b.title, releaseDate: b.release_date, datePrecision: b.date_precision,
      coverUrl: b.cover_key ? `/img/${b.cover_key}` : null, status: b.status, rating: b.status === 'read' ? b.rating : null, note: b.note
    }))
  });
});
