import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

// Phase 1 placeholder list. SeriesCards with progress arrive in Phase 2.
export default function Home() {
  const [series, setSeries] = useState<Array<{ id: number; name: string; author: string | null }> | null>(null);
  useEffect(() => { api.home().then((r) => setSeries(r.series)).catch(() => setSeries([])); }, []);
  return (
    <>
      <header className="band"><div className="band-inner"><h1>Antholo-genius</h1><p>Your series</p></div></header>
      <main className="page">
        {series === null ? <p className="muted">Loading…</p> : series.length === 0 ? (
          <div className="card"><p>No series yet.</p><Link className="btn" style={{ display: 'inline-flex', alignItems: 'center' }} to="/search">Search for a series</Link></div>
        ) : (
          <ul className="list">
            {series.map((s) => (
              <li key={s.id}><Link to={`/series/${s.id}`} className="card" style={{ display: 'block' }}><h3>{s.name}</h3><span className="muted">{s.author}</span></Link></li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
