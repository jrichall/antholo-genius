export const STATUSES = ['unread', 'reading', 'read', 'skipped'] as const;
export type Status = (typeof STATUSES)[number];

export interface TrackingPatch {
  status?: Status;
  rating?: number | null; // 1-5, or null to clear
  note?: string | null;
}

export interface TrackingState {
  status: Status;
  rating: number | null;
  note: string | null;
  finishedOn: string | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_NOTE = 2000;

export function parseTrackingPatch(input: unknown): Parsed<TrackingPatch> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Body must be an object' };
  const o = input as Record<string, unknown>;
  const patch: TrackingPatch = {};
  if ('status' in o) {
    if (typeof o.status !== 'string' || !(STATUSES as readonly string[]).includes(o.status)) return { ok: false, error: 'Invalid status' };
    patch.status = o.status as Status;
  }
  if ('rating' in o) {
    if (o.rating !== null && !(Number.isInteger(o.rating) && (o.rating as number) >= 1 && (o.rating as number) <= 5)) {
      return { ok: false, error: 'Rating must be a whole number from 1 to 5, or null' };
    }
    patch.rating = o.rating as number | null;
  }
  if ('note' in o) {
    if (o.note !== null && typeof o.note !== 'string') return { ok: false, error: 'Note must be text' };
    const note = o.note === null ? null : (o.note as string).trim();
    if (note && note.length > MAX_NOTE) return { ok: false, error: `Note is limited to ${MAX_NOTE} characters` };
    patch.note = note || null;
  }
  if (!('status' in patch) && !('rating' in patch) && !('note' in patch)) return { ok: false, error: 'Nothing to update' };
  return { ok: true, value: patch };
}

/**
 * Applies a patch to the current tracking state. Ratings are only allowed on books that are read
 * (after the patch). A stored rating is kept if the book later leaves "read", so an accidental tap
 * loses nothing; readers must ignore ratings on unread books (see seriesStats).
 */
export function applyTrackingPatch(current: TrackingState | null, patch: TrackingPatch, today: string): Parsed<TrackingState> {
  const base: TrackingState = current ?? { status: 'unread', rating: null, note: null, finishedOn: null };
  const status = patch.status ?? base.status;
  if (typeof patch.rating === 'number' && status !== 'read') {
    return { ok: false, error: 'Mark the book as read before rating it' };
  }
  const becameRead = status === 'read' && base.status !== 'read';
  return {
    ok: true,
    value: {
      status,
      rating: 'rating' in patch ? patch.rating ?? null : base.rating,
      note: 'note' in patch ? patch.note ?? null : base.note,
      finishedOn: becameRead && !base.finishedOn ? today : base.finishedOn
    }
  };
}

/** Position override: any finite number from 0 to 9999, or null to clear. */
export function parsePositionOverride(v: unknown): Parsed<number | null> {
  if (v === null) return { ok: true, value: null };
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 9999) return { ok: false, error: 'Position must be a number from 0 to 9999, or null' };
  return { ok: true, value: Math.round(v * 1000) / 1000 };
}
