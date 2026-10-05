const finishWindowMinutes = 15

function clock(date: Date): string {
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`
}

// Reveal time plus runtime, then 15 minutes more, in the browser's time zone.
export function finishWindow(
  revealedAt: Date,
  runtimeMinutes: number | null,
): { start: string; end: string } | null {
  if (runtimeMinutes === null) return null
  const start = new Date(revealedAt.getTime() + runtimeMinutes * 60_000)
  const end = new Date(start.getTime() + finishWindowMinutes * 60_000)
  return { start: clock(start), end: clock(end) }
}

export function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function synopsisSnippet(overview: string, maxChars: number): string {
  const text = overview.trim()
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  const space = cut.lastIndexOf(' ')
  const base = space > 0 ? cut.slice(0, space) : cut
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`
}
