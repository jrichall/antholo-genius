import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchBookHit, SearchSeriesHit } from '../../shared/types';
import { api } from '../api';

type Mode = 'series' | 'book';

export default function Search() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>('series');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchSeriesHit[] | null>(null);
  const [bookHits, setBookHits] = useState<SearchBookHit[] | null>(null);
  const [ask, setAsk] = useState<SearchBookHit | null>(null);
  const [busy, setBusy] = useState<number | 'search' | null>(null);
  const [error, setError] = useState<string | null>(null);

  function switchMode(m: Mode) { setMode(m); setHits(null); setBookHits(null); setError(null); setAsk(null); }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy('search'); setError(null);
    try {
      if (mode === 'series') setHits((await api.search(q)).results);
      else setBookHits((await api.searchBooks(q)).results);
    } catch (err) { setError((err as Error).message); setHits(null); setBookHits(null); }
    setBusy(null);
  }
  async function track(h: SearchSeriesHit) {
    setBusy(h.hardcoverId); setError(null);
    try { nav(`/series/${(await api.track(h.hardcoverId, h.author)).id}`); }
    catch (err) { setError((err as Error).message); setBusy(null); }
  }
  async function trackBook(h: SearchBookHit, wholeSeries: boolean) {
    setAsk(null); setBusy(h.hardcoverId); setError(null);
    try {
      const r = await api.trackBook(h.hardcoverId, wholeSeries, h.author);
      nav(r.seriesId ? `/series/${r.seriesId}` : '/');
    } catch (err) { setError((err as Error).message); setBusy(null); }
  }

  return (
    <>
      <header className="band"><div className="band-inner"><h1>Search</h1><p>{mode === 'series' ? 'Find a series to track' : 'Find a book to track'}</p></div></header>
      <main className="page">
        <div className="seg" role="group" aria-label="Search for">
          <button type="button" aria-pressed={mode === 'series'} onClick={() => switchMode('series')}>Series</button>
          <button type="button" aria-pressed={mode === 'book'} onClick={() => switchMode('book')}>Books</button>
        </div>
        <form className="search" onSubmit={run} role="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === 'series' ? 'Series name' : 'Book title'} aria-label={mode === 'series' ? 'Series name' : 'Book title'} />
          <button className="btn" disabled={busy === 'search'}>Search</button>
        </form>
        {error && <div className="error" role="alert">{error}</div>}
        {((mode === 'series' && hits && hits.length === 0) || (mode === 'book' && bookHits && bookHits.length === 0)) && <p className="muted">No matches.</p>}
        <ul className="list">
          {hits?.map((h) => (
            <li key={h.hardcoverId} className="card hit">
              <div><h3>{h.name}</h3><span className="muted">{[h.author, h.booksCount ? `${h.booksCount} books` : null].filter(Boolean).join(' · ')}</span></div>
              <button className="btn accent" disabled={busy !== null} onClick={() => track(h)}>{busy === h.hardcoverId ? 'Tracking…' : 'Track'}</button>
            </li>
          ))}
          {bookHits?.map((h) => (
            <li key={h.hardcoverId} className="card hit">
              <div><h3>{h.title}</h3><span className="muted">{[h.author, h.releaseYear].filter(Boolean).join(' · ')}</span></div>
              <button className="btn accent" disabled={busy !== null} onClick={() => setAsk(h)}>{busy === h.hardcoverId ? 'Tracking…' : 'Track'}</button>
            </li>
          ))}
        </ul>
        {ask && (
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Track the whole series, or just this book?">
            <div className="sheet-body card">
              <h3>Track the whole series, or just this book?</h3>
              <p className="muted">{ask.title}</p>
              <div className="sheet-actions">
                <button className="btn" onClick={() => trackBook(ask, true)}>Whole series</button>
                <button className="btn accent" onClick={() => trackBook(ask, false)}>Just this book</button>
                <button className="link-btn" onClick={() => setAsk(null)}>Cancel</button>
              </div>
              <p className="muted small">If the book isn't in a series, it's tracked on its own.</p>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
