// jsdom has no matchMedia, so a missing one means motion is allowed.
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

// Calls `onChange` whenever the preference flips; returns the unsubscribe.
// Guarded for matchMedia results without addEventListener (jsdom test stubs).
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (typeof query?.addEventListener !== 'function') return () => {}
  const listener = (event: MediaQueryListEvent) => onChange(event.matches)
  query.addEventListener('change', listener)
  return () => query.removeEventListener?.('change', listener)
}
