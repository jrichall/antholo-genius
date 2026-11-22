import { describe, expect, it } from 'vitest';
import { partitionEntries, seriesStats, type ProgressEntry } from './progress';

const TODAY = '2026-11-22';
const e = (label: string | null, o: Partial<ProgressEntry & { title: string }> = {}) => ({
  id: Number(label ?? 99), label, kind: label === null ? 'extra' : 'novel', releaseDate: '2015-01-01', status: 'unread', rating: null as number | null,
  hidden: false, title: `Book ${label}`, ...o
});

describe('partitionEntries', () => {
  it('separates coming soon, extras and hidden; hidden is in no count', () => {
    const all = [e('01'), e('02', { hidden: true }), e('03', { releaseDate: '2027-03-01' }), e(null)];
    const p = partitionEntries(all, TODAY);
    expect(p.books.map((b) => b.label)).toEqual(['01']);
    expect(p.comingSoon.map((b) => b.label)).toEqual(['03']);
    expect(p.extras).toHaveLength(1);
    expect(p.hidden.map((b) => b.label)).toEqual(['02']);
  });
});

describe('seriesStats', () => {
  it('averages only rated books that are read, to one decimal', () => {
    const s = seriesStats([
      e('01', { status: 'read', rating: 5 }),
      e('02', { status: 'read', rating: 4 }),
      e('03', { status: 'read', rating: 4 }),
      e('04', { status: 'reading', rating: 1 }), // stale rating on a non-read book: ignored
      e('05', { status: 'read' }) // read, unrated: counts as read, not in the average
    ]);
    expect(s.read).toBe(4);
    expect(s.total).toBe(5);
    expect(s.avgRating).toBe(4.3);
  });
  it('has no average when nothing is rated', () => {
    expect(seriesStats([e('01', { status: 'read' })]).avgRating).toBeNull();
    expect(seriesStats([]).avgRating).toBeNull();
  });
  it('next up skips read and skipped books', () => {
    const s = seriesStats([e('01', { status: 'read' }), e('02', { status: 'skipped' }), e('03', { status: 'reading' }), e('04')]);
    expect(s.nextUp).toEqual({ id: 3, label: '03', title: 'Book 03' });
    expect(seriesStats([e('01', { status: 'read' })]).nextUp).toBeNull();
  });
});
