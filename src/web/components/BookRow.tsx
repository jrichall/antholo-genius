import { useState } from 'react';
import { formatReleaseDate } from '../../shared/dates';
import { api, type BookView } from '../api';
import BookControls from './BookControls';
import NumberBadge from './NumberBadge';

function StatusMark({ status }: { status: string }) {
  if (status === 'reading') return <span className="pill accent">Reading</span>;
  if (status === 'skipped') return <span className="pill soft">Skipped</span>;
  if (status === 'read')
    return (
      <span className="check" role="img" aria-label="Read">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
    );
  return null;
}

export default function BookRow({ book, seriesId, onChanged }: { book: BookView; seriesId: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(book.positionOverride === null ? '' : String(book.positionOverride));
  const [error, setError] = useState<string | null>(null);
  const year = book.releaseDate ? formatReleaseDate(book.releaseDate, book.datePrecision) : null;
  const stars = book.status === 'read' && book.rating ? `★ ${book.rating}` : null;

  async function edit(e: { positionOverride?: number | null; hidden?: boolean }) {
    setError(null);
    try { await api.editEntry(seriesId, book.id, e); onChanged(); } catch (err) { setError((err as Error).message); }
  }
  const savePos = () => {
    const n = Number(pos);
    if (pos.trim() === '' || !Number.isFinite(n)) return setError('Enter a number like 3 or 3.5');
    edit({ positionOverride: n });
  };

  return (
    <li className={`row ${book.kind === 'novella' ? 'novella' : ''}`}>
      <div className="row-main">
        <NumberBadge label={book.label} kind={book.kind} />
        {book.coverUrl ? <img className="cover" src={book.coverUrl} alt="" loading="lazy" /> : <span className="cover" aria-hidden />}
        <div className="row-text">
          <h3>{book.title}</h3>
          <div className="meta">{[year, book.kind, stars].filter(Boolean).join(' · ')}</div>
          {book.safeLine && <div className="meta">{book.safeLine}</div>}
        </div>
        <StatusMark status={book.status} />
        <button type="button" className="icon-btn" aria-expanded={open} aria-label={`${open ? 'Close' : 'Open'} details for ${book.title}`} onClick={() => setOpen((v) => !v)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : undefined }}><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>
      {open && (
        <div className="panel">
          <BookControls bookId={book.id} status={book.status} rating={book.rating} note={book.note} onSaved={onChanged} />
          <div className="edit">
            <label className="field">
              <span className="muted">Position{book.position !== null ? ` (source: ${book.position})` : ''}</span>
              <div className="inline">
                <input inputMode="decimal" value={pos} placeholder="e.g. 3.5" onChange={(e) => setPos(e.target.value)} />
                <button type="button" className="btn" onClick={savePos}>Save</button>
                {book.positionOverride !== null && <button type="button" className="link-btn" onClick={() => { setPos(''); edit({ positionOverride: null }); }}>Reset</button>}
              </div>
            </label>
            <button type="button" className="link-btn" onClick={() => edit({ hidden: true })}>Hide this entry</button>
            {error && <div className="error" role="alert">{error}</div>}
          </div>
        </div>
      )}
    </li>
  );
}
