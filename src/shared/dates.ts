import type { DatePrecision } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'day' -> "Mar 3, 2027", 'month' -> "Mar 2027", 'year' -> "2027". */
export function formatReleaseDate(date: string | null, precision: DatePrecision | null): string {
  if (!date) return 'Date TBA';
  const [y, m, d] = date.split('-').map(Number);
  if (precision === 'year' || !m) return String(y);
  if (precision === 'month' || !d) return `${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
