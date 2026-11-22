import type { SearchBookHit, SearchSeriesHit } from '../shared/types';

export class ApiError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.message ?? 'Something went wrong', body.error);
  return body as T;
}

export type Status = 'unread' | 'reading' | 'read' | 'skipped';
export type DatePrecision = 'day' | 'month' | 'year';

export interface BookView {
  id: number; title: string; label: string | null; kind: string;
  releaseDate: string | null; datePrecision: DatePrecision | null;
  coverUrl: string | null; safeLine: string | null; status: Status; rating: number | null; note: string | null;
  hidden: boolean; position: number | null; positionOverride: number | null;
}
export interface SeriesView {
  series: { id: number; name: string; author: string | null; lastRefreshedAt: string | null };
  stats: {
    read: number; total: number; avgRating: number | null;
    upNext: { label: string | null; title: string } | null;
    nextOut: { label: string | null; title: string; releaseDate: string | null; datePrecision: DatePrecision | null } | null;
  };
  books: BookView[]; comingSoon: BookView[]; extras: BookView[]; hidden: BookView[];
}

export interface SeriesCardData {
  id: number; name: string; author: string | null; coverUrl: string | null;
  read: number; total: number; avgRating: number | null;
  next: { label: string | null; title: string } | null;
  comingSoon: { label: string | null; title: string; releaseDate: string | null; datePrecision: DatePrecision | null } | null;
}
export interface SingleBook {
  id: number; title: string; releaseDate: string | null; datePrecision: DatePrecision | null;
  coverUrl: string | null; status: Status; rating: number | null; note: string | null;
}
export interface TrackingState { status: Status; rating: number | null; note: string | null; finishedOn: string | null }
export interface TrackingPatch { status?: Status; rating?: number | null; note?: string | null }

export const api = {
  home: () => call<{ series: SeriesCardData[]; books: SingleBook[] }>('/api/home'),
  search: (q: string) => call<{ results: SearchSeriesHit[] }>(`/api/search?q=${encodeURIComponent(q)}&type=series`),
  searchBooks: (q: string) => call<{ results: SearchBookHit[] }>(`/api/search?q=${encodeURIComponent(q)}&type=book`),
  track: (hardcoverSeriesId: number, author: string | null) =>
    call<{ id: number }>('/api/series/track', { method: 'POST', body: JSON.stringify({ hardcoverSeriesId, author }) }),
  trackBook: (hardcoverBookId: number, trackSeries: boolean, author: string | null) =>
    call<{ seriesId: number | null; bookId: number | null }>('/api/books/track', { method: 'POST', body: JSON.stringify({ hardcoverBookId, trackSeries, author }) }),
  series: (id: number) => call<SeriesView>(`/api/series/${id}`),
  setTracking: (bookId: number, patch: TrackingPatch) =>
    call<{ tracking: TrackingState }>(`/api/books/${bookId}/tracking`, { method: 'PATCH', body: JSON.stringify(patch) }),
  editEntry: (seriesId: number, bookId: number, edit: { positionOverride?: number | null; hidden?: boolean }) =>
    call<{ ok: true }>(`/api/series/${seriesId}/books/${bookId}`, { method: 'PATCH', body: JSON.stringify(edit) })
};
