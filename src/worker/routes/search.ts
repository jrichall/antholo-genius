import { Hono } from 'hono';
import type { Env } from '../env';
import { HardcoverAuthError, TOKEN_EXPIRED_MESSAGE, searchSeries } from '../sources/hardcover';

export const searchRoutes = new Hono<{ Bindings: Env }>();
const TTL = 60 * 60 * 24;

// Phase 1: series results only. `type` is accepted for later phases.
searchRoutes.get('/', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ results: [] });
  const key = `series:${q.toLowerCase()}`;
  const cached = await c.env.SEARCH_CACHE.get(key, 'json');
  if (cached) return c.json({ results: cached, cached: true });
  try {
    const results = await searchSeries(c.env.HARDCOVER_TOKEN, q);
    await c.env.SEARCH_CACHE.put(key, JSON.stringify(results), { expirationTtl: TTL });
    return c.json({ results });
  } catch (e) {
    if (e instanceof HardcoverAuthError) return c.json({ error: 'token_expired', message: TOKEN_EXPIRED_MESSAGE }, 502);
    return c.json({ error: 'hardcover_error', message: 'Search is unavailable right now. Try again in a moment.' }, 502);
  }
});
