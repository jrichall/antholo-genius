import { describe, expect, it } from 'vitest';
import { formatPosition, labelEntries } from './numbering';

describe('formatPosition', () => {
  it.each([
    [1, 2, '01'],
    [3.5, 2, '03.5'],
    [0, 2, '00'],
    [12, 2, '12'],
    [3.25, 2, '03.25'],
    [7, 3, '007']
  ])('%s (width %s) -> %s', (p, w, out) => expect(formatPosition(p, w)).toBe(out));
});

describe('labelEntries', () => {
  const mk = (id: number, position: number | null, releaseDate: string | null = null, positionOverride: number | null = null) => ({ id, position, releaseDate, positionOverride });

  it('labels a plain series', () => {
    const out = labelEntries([1, 2, 3, 3.5, 4, 5].map((p, i) => mk(i, p)));
    expect(out.map((e) => e.label).join(' ')).toBe('01 02 03 03.5 04 05');
  });
  it('uses width 3 when any entry is >= 100', () => {
    expect(labelEntries([mk(1, 7), mk(2, 104)]).map((e) => e.label)).toEqual(['007', '104']);
  });
  it('splits shared positions by release date with a/b suffixes', () => {
    const out = labelEntries([mk(1, 3.5, '2021-05-01'), mk(2, 3.5, '2019-05-01')]);
    expect(out.map((e) => [e.id, e.label])).toEqual([[2, '03.5a'], [1, '03.5b']]);
  });
  it('lets the override win and re-sorts', () => {
    const out = labelEntries([mk(1, 1), mk(2, 2, null, 0.5)]);
    expect(out.map((e) => [e.id, e.label])).toEqual([[2, '00.5'], [1, '01']]);
  });
  it('puts unnumbered entries last with a null label', () => {
    const out = labelEntries([mk(1, null), mk(2, 1)]);
    expect(out.map((e) => e.label)).toEqual(['01', null]);
  });
});
