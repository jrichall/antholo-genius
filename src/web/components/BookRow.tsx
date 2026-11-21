import { formatReleaseDate } from '../../shared/dates';
import type { BookView } from '../api';
import NumberBadge from './NumberBadge';

export default function BookRow({ book }: { book: BookView }) {
  const year = book.releaseDate ? formatReleaseDate(book.releaseDate, book.datePrecision) : null;
  return (
    <li className={`row ${book.kind === 'novella' ? 'novella' : ''}`}>
      <NumberBadge label={book.label} kind={book.kind} />
      {book.coverUrl ? <img className="cover" src={book.coverUrl} alt="" loading="lazy" /> : <span className="cover" aria-hidden />}
      <div>
        <h3>{book.title}</h3>
        <div className="meta">{[year, book.kind].filter(Boolean).join(' · ')}</div>
      </div>
    </li>
  );
}
