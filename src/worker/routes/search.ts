import { Hono } from 'hono';
import type { Env } from '../env';
import { HardcoverAuthError, TOKEN_EXPIRED_MESSAGE, searchBooks, searchSeries } from '../sources/hardcover';

export const searchRoutes = new Hono<{ Bindings: Env }>();
const TTL = 60 * 60 * 24;

// type=series (default) or type=book. Author and character search land in later phases.
searchRoutes.get('/', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ results: [] });
  const type = c.req.query('type') === 'book' ? 'book' : 'series';
  const key = `${type}:${q.toLowerCase()}`;
  const cached = await c.env.SEARCH_CACHE.get(key, 'json');
  if (cached) return c.json({ results: cached, cached: true });
  try {
    const results = type === 'book' ? await searchBooks(c.env.HARDCOVER_TOKEN, q) : await searchSeries(c.env.HARDCOVER_TOKEN, q);
    await c.env.SEARCH_CACHE.put(key, JSON.stringify(results), { expirationTtl: TTL });
    return c.json({ results });
  } catch (e) {
    if (e instanceof HardcoverAuthError) return c.json({ error: 'token_expired', message: TOKEN_EXPIRED_MESSAGE }, 502);
    return c.json({ error: 'hardcover_error', message: 'Search is unavailable right now. Try again in a moment.' }, 502);
  }
});
