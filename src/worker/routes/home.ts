import { Hono } from 'hono';
import type { Env } from '../env';
import { listTrackedSeries } from '../db/queries';

export const homeRoutes = new Hono<{ Bindings: Env }>();

// Phase 1: just the tracked list (D1 only). Next-up, progress and avg land in Phase 2.
homeRoutes.get('/', async (c) => c.json({ series: await listTrackedSeries(c.env.DB) }));
