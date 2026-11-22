// 5 buttons with a 40px hit area. Tap a star to set it; tap the same star again to clear.
function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden fill={filled ? 'var(--accent)' : 'none'} stroke={filled ? 'var(--accent)' : 'var(--muted)'} strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z" />
    </svg>
  );
}

export default function StarRating({ value, onChange, disabled }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean }) {
  return (
    <div className="stars">
      <div role="group" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className="star" disabled={disabled} aria-label={`Rate ${n} of 5`} aria-pressed={value === n} onClick={() => onChange(value === n ? null : n)}>
            <Star filled={value !== null && n <= value} />
          </button>
        ))}
      </div>
      <span className="muted stars-text">{value === null ? 'Not rated' : `${value} of 5`}</span>
    </div>
  );
}
