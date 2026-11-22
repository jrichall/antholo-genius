import { Link } from 'react-router-dom';
import { formatReleaseDate } from '../../shared/dates';
import type { SeriesCardData } from '../api';

export default function SeriesCard({ s }: { s: SeriesCardData }) {
  const pct = s.total ? Math.round((s.read / s.total) * 100) : 0;
  return (
    <li>
      <Link to={`/series/${s.id}`} className="card scard">
        {s.coverUrl ? <img className="cover big" src={s.coverUrl} alt="" loading="lazy" /> : <span className="cover big" aria-hidden />}
        <div className="scard-body">
          <h3>{s.name}</h3>
          <div className="meta">{[s.author, s.avgRating !== null ? `★ ${s.avgRating.toFixed(1)}` : null, `${s.read}/${s.total} read`].filter(Boolean).join(' · ')}</div>
          {s.next ? (
            <div className="next"><span className="pill accent">{s.next.label ?? 'Next'}</span> <span>{s.next.title}</span></div>
          ) : s.total > 0 ? (
            <div className="next muted">{s.comingSoon ? `Next out ${formatReleaseDate(s.comingSoon.releaseDate, s.comingSoon.datePrecision)}` : 'All caught up'}</div>
          ) : null}
          <div className="progress" role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
        </div>
      </Link>
    </li>
  );
}
