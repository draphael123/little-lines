export function Stars({ count, of = 3, label }: { count: number; of?: number; label?: string }) {
  const filled = Math.max(0, Math.min(of, count))
  return (
    <span className="stars" aria-label={label ?? `${filled} of ${of} stars`} role="img">
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < filled ? undefined : 'dim'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}
