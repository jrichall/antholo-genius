import { describe, expect, it } from 'vitest';
import { applyTrackingPatch, parsePositionOverride, parseTrackingPatch, type TrackingState } from './tracking';

const TODAY = '2026-11-22';
const read: TrackingState = { status: 'read', rating: 4, note: null, finishedOn: '2026-01-01' };

describe('parseTrackingPatch', () => {
  it('accepts status, rating and note', () => {
    expect(parseTrackingPatch({ status: 'read', rating: 5, note: ' a ' })).toEqual({ ok: true, value: { status: 'read', rating: 5, note: 'a' } });
  });
  it('rejects bad status, rating and empty bodies', () => {
    expect(parseTrackingPatch({ status: 'done' }).ok).toBe(false);
    expect(parseTrackingPatch({ rating: 0 }).ok).toBe(false);
    expect(parseTrackingPatch({ rating: 3.5 }).ok).toBe(false);
    expect(parseTrackingPatch({ rating: 6 }).ok).toBe(false);
    expect(parseTrackingPatch({}).ok).toBe(false);
    expect(parseTrackingPatch(null).ok).toBe(false);
  });
  it('null rating clears and blank note becomes null', () => {
    expect(parseTrackingPatch({ rating: null, note: '  ' })).toEqual({ ok: true, value: { rating: null, note: null } });
  });
  it('limits note length', () => {
    expect(parseTrackingPatch({ note: 'x'.repeat(2001) }).ok).toBe(false);
  });
});

describe('applyTrackingPatch', () => {
  it('only allows ratings on read books', () => {
    expect(applyTrackingPatch(null, { rating: 4 }, TODAY).ok).toBe(false);
    expect(applyTrackingPatch({ ...read, status: 'reading' }, { rating: 4 }, TODAY).ok).toBe(false);
    expect(applyTrackingPatch(null, { status: 'read', rating: 4 }, TODAY)).toEqual({
      ok: true, value: { status: 'read', rating: 4, note: null, finishedOn: TODAY }
    });
  });
  it('clearing a rating works on a read book', () => {
    const r = applyTrackingPatch(read, { rating: null }, TODAY);
    expect(r).toEqual({ ok: true, value: { ...read, rating: null } });
  });
  it('keeps the rating when a book leaves read, and sets finishedOn only once', () => {
    const unread = applyTrackingPatch(read, { status: 'unread' }, TODAY);
    expect(unread).toEqual({ ok: true, value: { ...read, status: 'unread' } });
    const again = applyTrackingPatch({ ...read, status: 'unread', finishedOn: null }, { status: 'read' }, TODAY);
    expect(again.ok && again.value.finishedOn).toBe(TODAY);
    const keep = applyTrackingPatch(read, { status: 'read' }, TODAY);
    expect(keep.ok && keep.value.finishedOn).toBe('2026-01-01');
  });
  it('note edits leave status and rating alone', () => {
    expect(applyTrackingPatch(read, { note: 'Kaladin is great' }, TODAY)).toEqual({ ok: true, value: { ...read, note: 'Kaladin is great' } });
  });
});

describe('parsePositionOverride', () => {
  it('accepts numbers and null, rejects junk', () => {
    expect(parsePositionOverride(3.5)).toEqual({ ok: true, value: 3.5 });
    expect(parsePositionOverride(0)).toEqual({ ok: true, value: 0 });
    expect(parsePositionOverride(null)).toEqual({ ok: true, value: null });
    expect(parsePositionOverride(-1).ok).toBe(false);
    expect(parsePositionOverride('2').ok).toBe(false);
    expect(parsePositionOverride(NaN).ok).toBe(false);
  });
});
