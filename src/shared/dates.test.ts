import { expect, it } from 'vitest';
import { formatReleaseDate } from './dates';

it('formats by precision', () => {
  expect(formatReleaseDate('2027-03-03', 'day')).toBe('Mar 3, 2027');
  expect(formatReleaseDate('2027-03-01', 'month')).toBe('Mar 2027');
  expect(formatReleaseDate('2027-01-01', 'year')).toBe('2027');
  expect(formatReleaseDate(null, null)).toBe('Date TBA');
});
