import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatReleaseDate } from '../../shared/dates';
import { api, type SeriesCardData, type SingleBook } from '../api';
import BookControls from '../components/BookControls';
import SeriesCard from '../components/SeriesCard';

function SingleBookCard({ b, onSaved }: { b: SingleBook; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const meta = [b.releaseDate ? formatReleaseDate(b.releaseDate, b.datePrecision) : null, b.status, b.rating ? `★ ${b.rating}` : null].filter(Boolean).join(' · ');
  return (
    <li className="card">
      <button type="button" className="row-main plain" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {b.coverUrl ? <img className="cover" src={b.coverUrl} alt="" loading="lazy" /> : <span className="cover" aria-hidden />}
        <div className="row-text"><h3>{b.title}</h3><div className="meta">{meta}</div></div>
      </button>
      {open && <div className="panel"><BookControls bookId={b.id} status={b.status} rating={b.rating} note={b.note} onSaved={onSaved} /></div>}
    </li>
  );
}

export default function Home() {
  const [data, setData] = useState<{ series: SeriesCardData[]; books: SingleBook[] } | null>(null);
  const load = useCallback(() => { api.home().then(setData).catch(() => setData((d) => d ?? { series: [], books: [] })); }, []);
  useEffect(load, [load]);
  const empty = data && data.series.length === 0 && data.books.length === 0;
  return (
    <>
      <header className="band"><div className="band-inner"><h1>Antholo-genius</h1><p>Your series</p></div></header>
      <main className="page">
        {data === null ? <p className="muted">Loading…</p> : empty ? (
          <div className="card"><p>No series yet.</p><Link className="btn inline-btn" to="/search">Search for a series</Link></div>
        ) : (
          <>
            <ul className="list">{data.series.map((s) => <SeriesCard key={s.id} s={s} />)}</ul>
            {data.books.length > 0 && (
              <>
                <h2 className="section">Books</h2>
                <ul className="list">{data.books.map((b) => <SingleBookCard key={b.id} b={b} onSaved={load} />)}</ul>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
