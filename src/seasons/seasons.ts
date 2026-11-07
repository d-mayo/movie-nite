// The seasons the app themes itself for: the one place their windows are defined.

export type SeasonId = 'halloween' | 'christmas' | 'valentines'

// A window from a month and day to a month and day (1-based months), inclusive at both ends.
export interface SeasonWindow {
  from: [number, number]
  to: [number, number]
}

export interface Season {
  id: SeasonId
  name: string
  window: SeasonWindow
}

export const seasons: readonly Season[] = [
  { id: 'halloween', name: 'Halloween', window: { from: [10, 1], to: [10, 31] } },
  { id: 'christmas', name: 'Christmas', window: { from: [12, 1], to: [12, 25] } },
  { id: 'valentines', name: "Valentine's Day", window: { from: [2, 1], to: [2, 14] } },
]

export function seasonById(id: SeasonId): Season {
  return seasons.find((season) => season.id === id)!
}

export function isSeasonId(value: unknown): value is SeasonId {
  return seasons.some((season) => season.id === value)
}

// Whether a local date falls in a window.
export function inWindow(date: Date, { from, to }: SeasonWindow): boolean {
  const day = (date.getMonth() + 1) * 100 + date.getDate()
  return day >= from[0] * 100 + from[1] && day <= to[0] * 100 + to[1]
}

// The season a local date falls in, or null.
export function seasonOf(date: Date): SeasonId | null {
  return seasons.find((season) => inWindow(date, season.window))?.id ?? null
}

// The theme in force: a forced season, or forced None (null), wins over everything; otherwise
// none while themes are off, and otherwise the date's season. `forced` undefined means by date.
export function activeSeason({
  forced,
  enabled,
  date,
}: {
  forced: SeasonId | null | undefined
  enabled: boolean
  date: Date
}): SeasonId | null {
  if (forced !== undefined) return forced
  return enabled ? seasonOf(date) : null
}
