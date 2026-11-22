import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatReleaseDate } from '../../shared/dates';
import { api, type SeriesView } from '../api';
import BookRow from '../components/BookRow';
import ComingSoonCard from '../components/ComingSoonCard';

export default function Series() {
  const { id } = useParams();
  const [data, setData] = useState<SeriesView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);

  const [showHidden, setShowHidden] = useState(false);
  // Reload without blanking the page, so rating a book doesn't scroll you to the top.
  const reload = useCallback(() => { api.series(Number(id)).then(setData).catch((e) => setError(e.message)); }, [id]);
  useEffect(() => { setData(null); setError(null); reload(); }, [reload]);

  if (error) return <main className="page"><div className="error" role="alert">{error}</div></main>;
  if (!data) return <main className="page"><p className="muted">Loading…</p></main>;
  const { series, stats } = data;
  const up = stats.upNext;
  const out = stats.nextOut;

  return (
    <>
      <header className="band"><div className="band-inner"><h1>{series.name}</h1>{series.author && <p>{series.author}</p>}</div></header>
      <main className="page">
        <section className="tiles" aria-label="Series stats">
          <div className="tile"><div className="k">Read</div><div className="v">{stats.read} / {stats.total}</div></div>
          <div className="tile"><div className="k">Your avg</div><div className="v">{stats.avgRating === null ? '—' : `★ ${stats.avgRating.toFixed(1)}`}</div></div>
          <div className="tile"><div className="k">Up next</div><div className="v">{up ? `${up.label ?? ''} ${up.title}`.trim() : '—'}</div></div>
          <div className="tile"><div className="k">Next out</div><div className="v">{out ? formatReleaseDate(out.releaseDate, out.datePrecision) : '—'}</div></div>
        </section>

        <ul className="list" style={{ gap: 0 }}>{data.books.map((b) => <BookRow key={b.id} book={b} seriesId={series.id} onChanged={reload} />)}</ul>

        {data.comingSoon.length > 0 && (
          <>
            <h2 className="section">Coming soon</h2>
            <ul className="list">{data.comingSoon.map((b) => <ComingSoonCard key={b.id} book={b} />)}</ul>
          </>
        )}

        {data.extras.length > 0 && (
          <>
            <h2 className="section">Extras</h2>
            <button className="link-btn" onClick={() => setShowExtras((v) => !v)} aria-expanded={showExtras}>
              {showExtras ? 'Hide' : 'Show'} {data.extras.length} extras
            </button>
            {showExtras && <ul className="list" style={{ gap: 0 }}>{data.extras.map((b) => <BookRow key={b.id} book={b} seriesId={series.id} onChanged={reload} />)}</ul>}
          </>
        )}

        {data.hidden.length > 0 && (
          <>
            <h2 className="section">Hidden</h2>
            <button className="link-btn" onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden}>
              {showHidden ? 'Hide' : 'Show'} {data.hidden.length} hidden
            </button>
            {showHidden && (
              <ul className="list" style={{ gap: 0 }}>
                {data.hidden.map((b) => (
                  <li key={b.id} className="row"><div className="row-main"><div className="row-text"><h3>{b.title}</h3></div>
                    <button className="link-btn" onClick={() => api.editEntry(series.id, b.id, { hidden: false }).then(reload)}>Unhide</button></div></li>
                ))}
              </ul>
            )}
          </>
        )}

        <p className="muted" style={{ marginTop: 24 }}>
          Last checked {series.lastRefreshedAt ? new Date(series.lastRefreshedAt).toLocaleDateString() : 'never'}
        </p>
      </main>
    </>
  );
}
