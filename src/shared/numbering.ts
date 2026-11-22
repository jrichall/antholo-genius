/** Two-digit labels with decimals kept: 1 -> "01", 3.5 -> "03.5", 0 -> "00". */
export function formatPosition(position: number, width = 2): string {
  const whole = Math.floor(position);
  const frac = Math.round((position - whole) * 1000) / 1000;
  const head = String(whole).padStart(width, '0');
  return frac ? head + String(frac).slice(1) : head;
}

/** 3 digits if any numbered entry is >= 100, else 2. */
export function labelWidth(positions: Array<number | null>): number {
  return positions.some((p) => p !== null && p >= 100) ? 3 : 2;
}

export interface Numberable {
  id: number;
  position: number | null;
  positionOverride?: number | null;
  releaseDate?: string | null;
}

export const effectivePosition = (e: Numberable): number | null =>
  e.positionOverride ?? e.position ?? null;

/**
 * Sort by effective position and label every entry.
 * Shared positions are ordered by release date and get a/b/c suffixes.
 * Unnumbered entries come back with label null, after the numbered ones.
 */
export function labelEntries<T extends Numberable>(entries: T[]): Array<T & { label: string | null }> {
  const width = labelWidth(entries.map(effectivePosition));
  const dateKey = (e: T) => e.releaseDate ?? '9999';
  const sorted = [...entries].sort((a, b) => {
    const pa = effectivePosition(a);
    const pb = effectivePosition(b);
    if (pa === null || pb === null) return pa === pb ? a.id - b.id : pa === null ? 1 : -1;
    return pa - pb || dateKey(a).localeCompare(dateKey(b)) || a.id - b.id;
  });
  const counts = new Map<number, number>();
  for (const e of sorted) {
    const p = effectivePosition(e);
    if (p !== null) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const seen = new Map<number, number>();
  return sorted.map((e) => {
    const p = effectivePosition(e);
    if (p === null) return { ...e, label: null };
    const n = seen.get(p) ?? 0;
    seen.set(p, n + 1);
    const suffix = (counts.get(p) ?? 1) > 1 ? String.fromCharCode(97 + n) : '';
    return { ...e, label: formatPosition(p, width) + suffix };
  });
}
