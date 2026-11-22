import type { SearchSeriesHit } from '../shared/types';

export class ApiError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.message ?? 'Something went wrong', body.error);
  return body as T;
}

export interface BookView {
  id: number; title: string; label: string | null; kind: string;
  releaseDate: string | null; datePrecision: 'day' | 'month' | 'year' | null;
  coverUrl: string | null; safeLine: string | null; status: string; rating: number | null; hidden: boolean;
}
export interface SeriesView {
  series: { id: number; name: string; author: string | null; lastRefreshedAt: string | null };
  stats: {
    read: number; total: number; avgRating: number | null;
    upNext: { label: string | null; title: string } | null;
    nextOut: { label: string | null; title: string; releaseDate: string | null; datePrecision: BookView['datePrecision'] } | null;
  };
  books: BookView[]; comingSoon: BookView[]; extras: BookView[];
}

export const api = {
  home: () => call<{ series: Array<{ id: number; name: string; author: string | null }> }>('/api/home'),
  search: (q: string) => call<{ results: SearchSeriesHit[] }>(`/api/search?q=${encodeURIComponent(q)}&type=series`),
  track: (hardcoverSeriesId: number, author: string | null) =>
    call<{ id: number }>('/api/series/track', { method: 'POST', body: JSON.stringify({ hardcoverSeriesId, author }) }),
  series: (id: number) => call<SeriesView>(`/api/series/${id}`)
};
