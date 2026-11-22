export type BookKind = 'novel' | 'novella' | 'short' | 'extra';
export type DatePrecision = 'day' | 'month' | 'year';

/** One book_series row from Hardcover, flattened. Input to the import filter. */
export interface HcRow {
  bookId: number;
  title: string;
  position: number | null;
  featured: boolean;
  compilation: boolean; // book_series.compilation OR books.compilation
  usersReadCount: number | null;
  releaseDate: string | null; // ISO date as Hardcover gave it
  languageId: number | null; // default edition language; 1 = English; null = unknown
  /** Release dates of the book's English editions, if known. */
  editionDates?: string[];
  description?: string | null;
  coverUrl?: string | null;
  tags?: Record<string, string[]>;
}

export interface ImportedBook {
  bookId: number;
  title: string;
  position: number | null;
  kind: BookKind;
  releaseDate: string | null;
  datePrecision: DatePrecision | null;
  usersReadCount: number | null;
  description: string | null;
  coverUrl: string | null;
  tags: Record<string, string[]>;
}

export interface SearchSeriesHit {
  hardcoverId: number;
  name: string;
  author: string | null;
  booksCount: number | null;
  coverUrl: string | null;
}

export interface SearchBookHit {
  hardcoverId: number;
  title: string;
  author: string | null;
  releaseYear: number | null;
  coverUrl: string | null;
}
