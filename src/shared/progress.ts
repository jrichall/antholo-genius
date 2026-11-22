import { isComingSoon } from './importFilter';

export interface ProgressEntry {
  label: string | null;
  kind: string;
  releaseDate: string | null;
  status: string;
  rating: number | null;
  hidden: boolean;
}

export interface SeriesStats {
  read: number;
  total: number;
  avgRating: number | null; // one decimal, over rated books marked read
  nextUp: { id: number; label: string | null; title: string } | null;
}

/**
 * Splits labelled entries into the main list, "Coming soon" and "Extras" (unnumbered), plus the
 * hidden ones. Hidden entries are in none of the counts. Coming soon is decided by release date.
 */
export function partitionEntries<T extends ProgressEntry>(entries: T[], today: string) {
  const hidden = entries.filter((e) => e.hidden);
  const visible = entries.filter((e) => !e.hidden);
  const extras = visible.filter((e) => e.kind === 'extra' || e.label === null);
  const numbered = visible.filter((e) => !(e.kind === 'extra' || e.label === null));
  const comingSoon = numbered.filter((e) => isComingSoon(e.releaseDate, today));
  const books = numbered.filter((e) => !isComingSoon(e.releaseDate, today));
  return { books, comingSoon, extras, hidden };
}

/** Only books marked read count toward the average; a stored rating on an unread book is ignored. */
export function seriesStats<T extends ProgressEntry & { id: number; title: string }>(books: T[]): SeriesStats {
  const read = books.filter((b) => b.status === 'read');
  const rated = read.filter((b) => b.rating !== null && b.rating > 0);
  const avg = rated.length ? Math.round((rated.reduce((n, b) => n + (b.rating ?? 0), 0) / rated.length) * 10) / 10 : null;
  const next = books.find((b) => b.status !== 'read' && b.status !== 'skipped') ?? null;
  return {
    read: read.length,
    total: books.length,
    avgRating: avg,
    nextUp: next ? { id: next.id, label: next.label, title: next.title } : null
  };
}
