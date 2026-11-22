import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchSeriesHit } from '../../shared/types';
import { api } from '../api';

export default function Search() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchSeriesHit[] | null>(null);
  const [busy, setBusy] = useState<number | 'search' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy('search'); setError(null);
    try { setHits((await api.search(q)).results); } catch (err) { setError((err as Error).message); setHits(null); }
    setBusy(null);
  }
  async function track(h: SearchSeriesHit) {
    setBusy(h.hardcoverId); setError(null);
    try { nav(`/series/${(await api.track(h.hardcoverId, h.author)).id}`); }
    catch (err) { setError((err as Error).message); setBusy(null); }
  }

  return (
    <>
      <header className="band"><div className="band-inner"><h1>Search</h1><p>Find a series to track</p></div></header>
      <main className="page">
        <form className="search" onSubmit={run} role="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Series name" aria-label="Series name" />
          <button className="btn" disabled={busy === 'search'}>Search</button>
        </form>
        {error && <div className="error" role="alert">{error}</div>}
        {hits && hits.length === 0 && <p className="muted">No matches.</p>}
        <ul className="list">
          {hits?.map((h) => (
            <li key={h.hardcoverId} className="card hit">
              <div><h3>{h.name}</h3><span className="muted">{[h.author, h.booksCount ? `${h.booksCount} books` : null].filter(Boolean).join(' · ')}</span></div>
              <button className="btn accent" disabled={busy !== null} onClick={() => track(h)}>{busy === h.hardcoverId ? 'Tracking…' : 'Track'}</button>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
