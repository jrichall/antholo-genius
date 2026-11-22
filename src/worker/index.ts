import { Hono } from 'hono';
import type { Env } from './env';
import { bookRoutes } from './routes/books';
import { homeRoutes } from './routes/home';
import { searchRoutes } from './routes/search';
import { seriesRoutes } from './routes/series';

const app = new Hono<{ Bindings: Env }>();

app.route('/api/home', homeRoutes);
app.route('/api/books', bookRoutes);
app.route('/api/search', searchRoutes);
app.route('/api/series', seriesRoutes);

// Covers are copied to R2 on import and served from here, never hot-linked.
app.get('/img/*', async (c) => {
  const obj = await c.env.COVERS.get(c.req.path.slice('/img/'.length));
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' }
  });
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default {
  fetch: app.fetch,
  // Daily refresher lands in Phase 3.
  async scheduled() {}
} satisfies ExportedHandler<Env>;
