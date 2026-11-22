import { describe, expect, it } from 'vitest';
import { cleanDate, importFilter, inferPrecision, isSplitTitle, pickSeriesRecord } from './importFilter';
import type { HcRow } from './types';

let nextId = 1;
const row = (title: string, position: number | null, o: Partial<HcRow> = {}): HcRow => ({
  bookId: nextId++,
  title,
  position,
  featured: true,
  compilation: false,
  usersReadCount: 0,
  releaseDate: '2010-01-01',
  languageId: null,
  ...o
});
const labels = (rows: HcRow[], today = '2026-11-21') =>
  importFilter(rows, today).map((b) => `${b.position}:${b.title}`);

// Rows copied from spike/REPORT.md (The Stormlight Archive, record #997).
const stormlight = (): HcRow[] => [
  row('The Way of Kings Prime', 0.1, { releaseDate: '2020-07-07', usersReadCount: 300 }),
  row('O caminho dos reis: Livro 1', 1, { featured: false, usersReadCount: 20 }),
  row('Архив Буресвета. Книга 1: Путь королей', 1, { featured: false, usersReadCount: 15 }),
  row('Droga królów', 1, { featured: false, usersReadCount: 10 }),
  row('The Stormlight Archive, Books 1-5 : The Way of Kings Book, Words of Radiance Book, Oathbringer Book, Rythm of War Book & Wind and Truth', 1, { compilation: true, usersReadCount: 900 }),
  row('Пътят на кралете, Том 1', 1, { usersReadCount: 3 }),
  row('The Stormlight Archive, Books 1-3: The Way of Kings, Words of Radiance, Oathbringer', 1, { compilation: true, usersReadCount: 800 }),
  row('The Way of Kings', 1, { usersReadCount: 5000, releaseDate: '2010-08-31' }),
  row('Пътят на кралете, Том 2', 1, { usersReadCount: 2 }),
  row('Stormlight Archive MM Boxed Set I, Books 1-3: The Way of Kings, Words of Radiance, Oathbringer', 1, { compilation: true, usersReadCount: 100 }),
  row('Kralların Yolu, Cilt 1', 1, { usersReadCount: 7 }),
  row('La voie des rois', 1, { usersReadCount: 40 }),
  row('The Way of Kings: Book One of the Stormlight Archive', 1, { featured: false, usersReadCount: 600 }),
  row('The Way of Kings, Part 1', 1.1, { usersReadCount: 50 }),
  row('The Way of Kings (1 of 5) [Dramatized Adaptation]', 1.1, { featured: false }),
  row('The Way of Kings (2 of 5) [Dramatized Adaptation]', 1.2),
  row('The Way of Kings, Part 2', 1.2),
  row('The Way of Kings (5 of 5) [Dramatized Adaptation]', 1.5),
  row('Words of Radiance', 2, { usersReadCount: 4000, releaseDate: '2014-03-04' }),
  row('Words of Radiance (5 of 5) [Dramatized Adaptation]', 2, { usersReadCount: 4500 }),
  row('Slova paprsku', 2, { featured: false, usersReadCount: 5 }),
  row('Le livre des Radieux', 2, { usersReadCount: 60 }),
  row('Elsecaller and King Lopen the First of Alethkar', 2.1, { releaseDate: '2025-12-01', usersReadCount: 80 }),
  row('Words of Radiance, Part 1', 2.1),
  row('Words of Radiance (Part 1 of 5) [Dramatized Adaptation]', 2.1),
  row(' Words of Radiance, Part 2', 2.2),
  row('Words of Radiance (5 of 5) [Dramatized Adaptation]', 2.5, { usersReadCount: 1 }),
  row('Edgedancer', 2.5, { releaseDate: '2016-11-08', usersReadCount: 2500 }),
  row('Justicière, Volume 2', 3, { releaseDate: '2017-11-14', usersReadCount: 30 }),
  row('Oathbringer', 3, { releaseDate: '2017-11-14', usersReadCount: 3500 }),
  row('Давший клятву', 3, { releaseDate: '2017-11-14', usersReadCount: 12 }),
  row('Dawnshard', 3.5, { releaseDate: '2020-11-17', usersReadCount: 1800 }),
  row('Rhythm of War', 4, { releaseDate: '2020-11-17', usersReadCount: 2800 }),
  row('Ритм войны. Том 1', 4, { usersReadCount: 9 }),
  row('Wind and Truth', 5, { releaseDate: '2024-12-06', usersReadCount: 1500 }),
  row('Wiatr i Prawda I', 5, { releaseDate: '2024-12-06', usersReadCount: 4 })
];

describe('importFilter: Stormlight', () => {
  it('yields one real book per position, no translations, box sets or split editions', () => {
    expect(labels(stormlight())).toEqual([
      '0.1:The Way of Kings Prime',
      '1:The Way of Kings',
      '2:Words of Radiance',
      '2.1:Elsecaller and King Lopen the First of Alethkar',
      '2.5:Edgedancer',
      '3:Oathbringer',
      '3.5:Dawnshard',
      '4:Rhythm of War',
      '5:Wind and Truth'
    ]);
  });
});

describe('isSplitTitle', () => {
  it.each([
    'The Way of Kings, Part 2',
    'The Way of Kings (2 of 5) [Dramatized Adaptation]',
    'Words of Radiance (Part 1 of 5) [Dramatized Adaptation]',
    'Justicière, Volume 2',
    'Murderbot Diaries, Vol. 1',
    'Journal d\'un AssaSynth, Tome 4',
    'Kralların Yolu, Cilt 1',
    'The Stormlight Archive (Split Volume Edition)'
  ])('flags %s', (t) => expect(isSplitTitle(t)).toBe(true));
  it.each(['The Way of Kings', 'Partly Cloudy', 'Rhythm of War', 'Part of Your World'])('keeps %s', (t) =>
    expect(isSplitTitle(t)).toBe(false)
  );
});

describe('importFilter rules', () => {
  it('drops compilations flagged on the row or the book', () => {
    expect(labels([row('A', 1), row('Boxed', 2, { compilation: true })])).toEqual(['1:A']);
  });
  it('prefers English editions and keeps unknown-language rows', () => {
    const out = labels([row('Tormenta', 1, { languageId: 5, usersReadCount: 900 }), row('Storm Front', 1, { languageId: 1, usersReadCount: 5 })]);
    expect(out).toEqual(['1:Storm Front']);
    expect(labels([row('Storm Front', 1, { languageId: null })])).toEqual(['1:Storm Front']);
  });
  it('breaks read-count ties by featured, then earliest date', () => {
    expect(labels([row('Plain', 1, { featured: false }), row('Featured', 1)])).toEqual(['1:Featured']);
    expect(labels([row('Late', 1, { releaseDate: '2012-01-01' }), row('Early', 1, { releaseDate: '2001-01-01' })])).toEqual(['1:Early']);
  });
  it('marks kinds: fractional = novella, null = extra', () => {
    const kinds = importFilter([row('Main', 1), row('Short', 1.5), row('Companion', null)], '2026-11-21').map((b) => b.kind);
    expect(kinds).toEqual(['novel', 'novella', 'extra']);
  });
  it('collapses duplicate unnumbered titles', () => {
    expect(labels([row('Guide', null), row('guide', null)])).toHaveLength(1);
  });
});

describe('dates', () => {
  it('nulls dates before 1800', () => {
    expect(cleanDate('0002-01-01', [])).toBeNull();
  });
  it('falls back to the earliest sane English edition date', () => {
    expect(cleanDate('0002-01-01', ['2017-05-02', '2018-01-01'])).toBe('2017-05-02');
    expect(cleanDate(null, ['2019-01-01'])).toBe('2019-01-01');
  });
  it('infers precision', () => {
    expect(inferPrecision('2010-01-01')).toBe('year');
    expect(inferPrecision('2010-08-31')).toBe('day');
    expect(inferPrecision(null)).toBeNull();
  });
  it('is decided on the kept book only: translation with future date never wins', () => {
    const out = importFilter([row('Real', 1, { releaseDate: '2020-01-01', usersReadCount: 100 }), row('Traduction', 1, { releaseDate: '2030-01-01', usersReadCount: 1 })], '2026-11-21');
    expect(out).toHaveLength(1);
    expect(out[0].releaseDate).toBe('2020-01-01');
  });
});

describe('pickSeriesRecord', () => {
  const rec = (id: number, state: string, books: number, canonical: number | null = null) => ({ id, state, booksCount: books, canonicalId: canonical });
  it('uses the record itself when active with books', () => {
    expect(pickSeriesRecord(rec(997, 'active', 28), () => null)).toEqual({ id: 997 });
  });
  it('follows canonical_id from a duplicate', () => {
    const canon = rec(990, 'active', 60);
    expect(pickSeriesRecord(rec(7126, 'duplicate', 0, 990), (id) => (id === 990 ? canon : null))).toEqual({ id: 990 });
  });
  it('refuses empty series', () => {
    expect(pickSeriesRecord(rec(1882, 'duplicate', 0), () => null)).toBeNull();
    expect(pickSeriesRecord(rec(5, 'active', 0), () => null)).toBeNull();
  });
});
