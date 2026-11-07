import { useCallback, useState } from 'react'
import type { SeasonId } from '../seasons/seasons.ts'

// The unsaved forces the debug popover sets: they start off and reset on reload.
export interface DebugOptions {
  closeCalls: boolean
  catches: boolean
  countdowns: boolean
  wildcards: boolean
  // The id of the card every dealt card is, when it is eligible ('' deals normally).
  card: string
  // The season every theme follows: '' by the date, 'none' for none, or a season id.
  season: '' | 'none' | SeasonId
}

export const defaultDebugOptions: DebugOptions = {
  closeCalls: false,
  catches: false,
  countdowns: false,
  wildcards: false,
  card: '',
  season: '',
}

// The forced season as the season rule takes it: undefined by date, null for None.
export function forcedSeason(season: DebugOptions['season']): SeasonId | null | undefined {
  if (season === '') return undefined
  return season === 'none' ? null : season
}

export function useDebugOptions() {
  const [options, setOptions] = useState<DebugOptions>(defaultDebugOptions)
  const update = useCallback((change: Partial<DebugOptions>) => setOptions((o) => ({ ...o, ...change })), [])
  return [options, update] as const
}
