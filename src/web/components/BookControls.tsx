import { useState } from 'react';
import { api, type Status, type TrackingPatch } from '../api';
import StarRating from './StarRating';

const STATUS_LABEL: Record<Status, string> = { unread: 'Unread', reading: 'Reading', read: 'Read', skipped: 'Skipped' };

/** Status, rating (read books only) and the "what I remember" note. Saves each change to D1. */
export default function BookControls({ bookId, status, rating, note, onSaved }: {
  bookId: number; status: Status; rating: number | null; note: string | null; onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(note ?? '');

  async function save(patch: TrackingPatch) {
    setBusy(true); setError(null);
    try { await api.setTracking(bookId, patch); onSaved(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="controls">
      <div className="seg" role="group" aria-label="Reading status">
        {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
          <button key={s} type="button" disabled={busy} aria-pressed={status === s} onClick={() => status !== s && save({ status: s })}>{STATUS_LABEL[s]}</button>
        ))}
      </div>
      {status === 'read' && <StarRating value={rating} disabled={busy} onChange={(v) => save({ rating: v })} />}
      <label className="field">
        <span className="muted">What I remember</span>
        <textarea rows={3} value={draft} maxLength={2000} onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== (note ?? '') && save({ note: draft.trim() || null })} />
      </label>
      {error && <div className="error" role="alert">{error}</div>}
    </div>
  );
}
