CREATE TABLE series (
  id INTEGER PRIMARY KEY,
  hardcover_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  author TEXT,
  is_completed INTEGER,
  primary_books_count INTEGER,
  tags_json TEXT,
  tracked INTEGER NOT NULL DEFAULT 1,
  last_refreshed_at TEXT,
  next_refresh_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  hardcover_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  release_date TEXT,
  date_precision TEXT,
  cover_key TEXT,
  cover_source_url TEXT,
  blurb TEXT,
  safe_line TEXT,
  safe_line_locked INTEGER NOT NULL DEFAULT 0,
  users_read_count INTEGER,
  tags_json TEXT,
  updated_at TEXT
);

CREATE TABLE series_books (
  series_id INTEGER NOT NULL REFERENCES series(id),
  book_id INTEGER NOT NULL REFERENCES books(id),
  position REAL,
  position_override REAL,
  kind TEXT NOT NULL DEFAULT 'novel',
  hidden INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (series_id, book_id)
);

CREATE TABLE tracking (
  book_id INTEGER PRIMARY KEY REFERENCES books(id),
  status TEXT NOT NULL DEFAULT 'unread',
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  finished_on TEXT,
  note TEXT,
  updated_at TEXT
);

CREATE TABLE characters (
  id INTEGER PRIMARY KEY,
  series_id INTEGER NOT NULL REFERENCES series(id),
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  UNIQUE (series_id, name)
);

CREATE TABLE recs (
  series_id INTEGER NOT NULL REFERENCES series(id),
  rec_hardcover_series_id INTEGER NOT NULL,
  rec_name TEXT NOT NULL,
  rec_author TEXT,
  score REAL,
  why TEXT,
  dismissed INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (series_id, rec_hardcover_series_id)
);

CREATE TABLE changes (
  id INTEGER PRIMARY KEY,
  series_id INTEGER NOT NULL REFERENCES series(id),
  type TEXT NOT NULL,
  detail TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_series_next_refresh ON series(next_refresh_at);
CREATE INDEX idx_books_release ON books(release_date);
