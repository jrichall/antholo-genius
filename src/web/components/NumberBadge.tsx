export default function NumberBadge({ label, kind }: { label: string | null; kind?: string }) {
  const cls = label === null ? 'muted' : kind === 'novella' ? 'novella' : '';
  return <span className={`badge ${cls}`} aria-label={label ? `Number ${label}` : 'Unnumbered'}>{label ?? '—'}</span>;
}
