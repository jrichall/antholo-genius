import type { BookKind, DatePrecision, HcRow, ImportedBook } from './types';

// Hardcover lists every edition as its own book. This reduces a series to one book per position.
// Rules 1-8 are in docs/BUILD_GUIDE.md § Import filtering. Pure: no I/O.

/** Titles that mark a split edition, dramatized adaptation or numbered translation volume. */
const SPLIT_MARKERS =
  /\bpart \d+\b|\(\d+ of \d+\)|\(part \d+ of \d+\)|dramatized adaptation|split volume|\bvol(ume)?\.? \d+\b|\btom(e)? \d+\b|\bcilt \d+\b/i;

export const isSplitTitle = (title: string): boolean => SPLIT_MARKERS.test(title);

const sane = (d: string | null | undefined): d is string => !!d && parseInt(d.slice(0, 4), 10) >= 1800;

/** Rule 6: dates before 1800 become null; fall back to the earliest sane English edition date. */
export function cleanDate(own: string | null, editionDates: string[] = []): string | null {
  if (sane(own)) return own;
  const alt = editionDates.filter(sane).sort()[0];
  return alt ?? null;
}

/** Hardcover gives full dates. A Jan 1 date is almost always "year only", so show it that way. */
export function inferPrecision(date: string | null): DatePrecision | null {
  if (!date) return null;
  return date.endsWith('-01-01') ? 'year' : 'day';
}

export const isComingSoon = (releaseDate: string | null, today: string): boolean =>
  !!releaseDate && releaseDate > today;

/** Rule 5 order: most readers, then featured, then earliest sane date. */
function better(a: HcRow, b: HcRow): number {
  const ra = a.usersReadCount ?? 0;
  const rb = b.usersReadCount ?? 0;
  if (ra !== rb) return rb - ra;
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  const da = sane(a.releaseDate) ? a.releaseDate : '9999';
  const db = sane(b.releaseDate) ? b.releaseDate : '9999';
  return da.localeCompare(db) || a.bookId - b.bookId;
}

const kindFor = (position: number | null): BookKind =>
  position === null ? 'extra' : Number.isInteger(position) ? 'novel' : 'novella';

export function importFilter(rows: HcRow[], _today: string): ImportedBook[] {
  const kept = rows.filter(
    (r) =>
      !r.compilation && // rule 2
      !isSplitTitle(r.title) && // rule 3
      (r.languageId === null || r.languageId === 1) // rule 4
  );

  // Rule 5: one book per position. Unnumbered rows collapse by normalised title.
  const groups = new Map<string, HcRow[]>();
  for (const r of kept) {
    const key = r.position === null ? `t:${r.title.trim().toLowerCase()}` : `p:${r.position}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const winners = [...groups.values()].map((g) => g.sort(better)[0]);

  winners.sort((a, b) => {
    if (a.position === null || b.position === null) return a.position === b.position ? a.bookId - b.bookId : a.position === null ? 1 : -1;
    return a.position - b.position;
  });

  return winners.map((r) => {
    const releaseDate = cleanDate(r.releaseDate, r.editionDates);
    return {
      bookId: r.bookId,
      title: r.title.trim(),
      position: r.position,
      kind: kindFor(r.position), // rule 7
      releaseDate,
      datePrecision: inferPrecision(releaseDate),
      usersReadCount: r.usersReadCount,
      description: r.description ?? null,
      coverUrl: r.coverUrl ?? null,
      tags: r.tags ?? {}
    };
  });
}

export interface SeriesRecordInfo {
  id: number;
  state: string | null;
  booksCount: number | null;
  canonicalId: number | null;
}

/** Rule 1: follow canonical_id off duplicates; never import an empty series. */
export function pickSeriesRecord(
  rec: SeriesRecordInfo,
  lookup: (id: number) => SeriesRecordInfo | null
): { id: number } | null {
  let target = rec;
  if (rec.state === 'duplicate') {
    const canon = rec.canonicalId ? lookup(rec.canonicalId) : null;
    if (!canon || canon.state === 'duplicate') return null;
    target = canon;
  }
  return (target.booksCount ?? 0) > 0 ? { id: target.id } : null;
}
