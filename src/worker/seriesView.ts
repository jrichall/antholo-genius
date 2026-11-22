import { labelEntries } from '../shared/numbering';
import type { SeriesBookRow } from './db/queries';

/**
 * Turns D1 rows into labelled entries. Hidden entries are left out of numbering, so hiding one of
 * two books at 3.5 turns the other back into plain "03.5".
 */
export function toEntries(rows: SeriesBookRow[]) {
  const shape = (r: SeriesBookRow, label: string | null) => ({
    id: r.book_id,
    title: r.title,
    label,
    kind: label === null ? 'extra' : r.kind,
    releaseDate: r.release_date,
    datePrecision: r.date_precision as 'day' | 'month' | 'year' | null,
    coverUrl: r.cover_key ? `/img/${r.cover_key}` : null,
    safeLine: r.safe_line,
    status: r.status ?? 'unread',
    rating: r.rating,
    note: r.note,
    hidden: !!r.hidden,
    position: r.position,
    positionOverride: r.position_override
  });
  const shown = labelEntries(
    rows.filter((r) => !r.hidden).map((r) => ({ id: r.book_id, position: r.position, positionOverride: r.position_override, releaseDate: r.release_date, row: r }))
  ).map(({ row, label }) => shape(row, label));
  const hidden = rows.filter((r) => r.hidden).map((r) => ({ ...shape(r, null), kind: r.kind }));
  return [...shown, ...hidden];
}
