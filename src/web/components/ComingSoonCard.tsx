import { formatReleaseDate } from '../../shared/dates';
import type { BookView } from '../api';

export default function ComingSoonCard({ book }: { book: BookView }) {
  return (
    <li className="soon">
      <span className="badge muted">{book.label ?? '—'}</span>
      <div>
        <h3>{book.title}</h3>
        <div className="meta muted">{formatReleaseDate(book.releaseDate, book.datePrecision)}</div>
      </div>
    </li>
  );
}
