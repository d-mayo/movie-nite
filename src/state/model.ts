import {
  defaultWheelSettings,
  effectiveSetting,
  isValidSliceCount,
  isValidWeight,
  isValidWildcardCount,
  type Adjustment,
  type WheelSettings,
} from '../wheel/edit.ts'
import { firstFreePreset, isPreset, maxViewers } from '../wheel/colors.ts'

export interface Nomination {
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null
  overview: string
  runtime: number | null
  genres: string[]
}

export interface Viewer {
  id: string
  name: string
  color: string
}

export interface AppState {
  version: 1
  settings: { tmdbToken: string | null; viewersHidden: boolean; wheel: WheelSettings }
  roster: Viewer[]
  night: {
    presentIds: string[]
    nominations: Record<string, Nomination>
    wonFilms: number[]
    watched: Nomination[]
    ended: boolean
    // What the host changed for a viewer tonight; the wheel is derived from these.
    adjustments: Record<string, Adjustment>
    // True once a spin has started this night; the first one clears the held film.
    spun: boolean
    // True while the held film's corner card is shrunk to the banner chip.
    holdoverDismissed: boolean
  }
  holdover: Nomination | null
}

export const defaultState: AppState = {
  version: 1,
  settings: { tmdbToken: null, viewersHidden: false, wheel: defaultWheelSettings },
  roster: [],
  night: {
    presentIds: [],
    nominations: {},
    wonFilms: [],
    watched: [],
    ended: false,
    adjustments: {},
    spun: false,
    holdoverDismissed: false,
  },
  holdover: null,
}

export function setToken(state: AppState, token: string | null): AppState {
  return { ...state, settings: { ...state.settings, tmdbToken: token } }
}

export function setViewersHidden(state: AppState, hidden: boolean): AppState {
  return { ...state, settings: { ...state.settings, viewersHidden: hidden } }
}

export const maxNameLength = 20
export { maxViewers }

export function addViewer(state: AppState, name: string, id: string): AppState {
  const trimmed = name.trim().slice(0, maxNameLength)
  if (!trimmed) return state
  if (state.roster.length >= maxViewers) return state
  const lower = trimmed.toLowerCase()
  if (state.roster.some((v) => v.name.toLowerCase() === lower)) return state
  const color = firstFreePreset(state.roster.map((v) => v.color))
  if (color === null) return state
  return {
    ...state,
    roster: [...state.roster, { id, name: trimmed, color }],
    night: { ...state.night, presentIds: [...state.night.presentIds, id] },
  }
}

export function setViewerColor(state: AppState, id: string, color: string): AppState {
  if (!isPreset(color)) return state
  const viewer = state.roster.find((v) => v.id === id)
  if (!viewer || viewer.color === color) return state
  if (state.roster.some((v) => v.color === color)) return state
  return { ...state, roster: state.roster.map((v) => (v.id === id ? { ...v, color } : v)) }
}

function withoutNomination(
  nominations: Record<string, Nomination>,
  viewerId: string,
): Record<string, Nomination> {
  const { [viewerId]: _dropped, ...rest } = nominations
  void _dropped
  return rest
}

export function removeViewer(state: AppState, id: string): AppState {
  const { [id]: _dropped, ...adjustments } = state.night.adjustments
  void _dropped
  return {
    ...state,
    roster: state.roster.filter((v) => v.id !== id),
    night: {
      ...state.night,
      presentIds: state.night.presentIds.filter((p) => p !== id),
      nominations: withoutNomination(state.night.nominations, id),
      adjustments,
    },
  }
}

function hasWon(night: AppState['night'], viewerId: string): boolean {
  const film = night.nominations[viewerId]
  return film !== undefined && night.wonFilms.includes(film.tmdbId)
}

export function setPresent(state: AppState, id: string, present: boolean): AppState {
  if (!state.roster.some((v) => v.id === id)) return state
  const isPresent = state.night.presentIds.includes(id)
  if (present === isPresent) return state
  // An away viewer keeps their film, so hiding someone briefly loses nothing.
  return {
    ...state,
    night: {
      ...state.night,
      presentIds: present
        ? [...state.night.presentIds, id]
        : state.night.presentIds.filter((p) => p !== id),
    },
  }
}

// Takes a viewer's film back off the wheel. A film that has won is not taken back.
export function removeNomination(state: AppState, viewerId: string): AppState {
  if (!state.night.nominations[viewerId] || hasWon(state.night, viewerId)) return state
  return {
    ...state,
    night: { ...state.night, nominations: withoutNomination(state.night.nominations, viewerId) },
  }
}

export function nominate(state: AppState, viewerId: string, nomination: Nomination): AppState {
  if (!state.night.presentIds.includes(viewerId)) return state
  if (hasWon(state.night, viewerId)) return state
  if (state.night.wonFilms.includes(nomination.tmdbId)) return state
  return {
    ...state,
    night: {
      ...state.night,
      nominations: { ...state.night.nominations, [viewerId]: nomination },
    },
  }
}

// Leftover nominations (films that never won) carry over until their viewer changes them.
export function newNight(state: AppState): AppState {
  const nominations = Object.fromEntries(
    Object.entries(state.night.nominations).filter(
      ([, film]) => !state.night.wonFilms.includes(film.tmdbId),
    ),
  )
  return {
    ...state,
    night: {
      ...state.night,
      nominations,
      wonFilms: [],
      watched: [],
      ended: false,
      adjustments: {},
      spun: false,
      holdoverDismissed: false,
    },
  }
}

export function viewersOnWheel(night: AppState['night']): string[] {
  return night.presentIds.filter((id) => !hasWon(night, id))
}

function withWheel(state: AppState, change: Partial<WheelSettings>): AppState {
  return { ...state, settings: { ...state.settings, wheel: { ...state.settings.wheel, ...change } } }
}

// Turning One per viewer off keeps the wildcards the wheel had: the count
// becomes tonight's number of viewers on the wheel.
export function setWildcardsPerViewer(state: AppState, on: boolean): AppState {
  if (state.settings.wheel.wildcardsPerViewer === on) return state
  return withWheel(state, {
    wildcardsPerViewer: on,
    ...(on ? {} : { wildcardCount: viewersOnWheel(state.night).length }),
  })
}

export function setWildcardCount(state: AppState, count: number): AppState {
  if (!isValidWildcardCount(count) || count === state.settings.wheel.wildcardCount) return state
  return withWheel(state, { wildcardCount: count })
}

export function setWildcardWeight(state: AppState, weight: number): AppState {
  if (!isValidWeight(weight) || weight === state.settings.wheel.wildcardWeight) return state
  return withWheel(state, { wildcardWeight: weight })
}

export function setDefaultSlices(state: AppState, count: number): AppState {
  if (!isValidSliceCount(count) || count === state.settings.wheel.defaultSlices) return state
  return withWheel(state, { defaultSlices: count })
}

export function setDefaultWeight(state: AppState, weight: number): AppState {
  if (!isValidWeight(weight) || weight === state.settings.wheel.defaultWeight) return state
  return withWheel(state, { defaultWeight: weight })
}

function adjust(state: AppState, viewerId: string, change: Adjustment): AppState {
  if (!state.roster.some((v) => v.id === viewerId)) return state
  return {
    ...state,
    night: {
      ...state.night,
      adjustments: {
        ...state.night.adjustments,
        [viewerId]: { ...state.night.adjustments[viewerId], ...change },
      },
    },
  }
}

// A set that matches the current effective value records nothing; any other
// valid set is kept as an adjustment, even one that equals the default.
export function setViewerWeightOnWheel(state: AppState, viewerId: string, weight: number): AppState {
  const now = effectiveSetting(state.settings.wheel, state.night.adjustments, viewerId)
  if (!isValidWeight(weight) || weight === now.weight) return state
  return adjust(state, viewerId, { weight })
}

export function setViewerSliceCount(state: AppState, viewerId: string, count: number): AppState {
  const now = effectiveSetting(state.settings.wheel, state.night.adjustments, viewerId)
  if (!isValidSliceCount(count) || count === now.slices) return state
  return adjust(state, viewerId, { slices: count })
}

export function resetViewerSetting(state: AppState, viewerId: string): AppState {
  if (!state.night.adjustments[viewerId]) return state
  const { [viewerId]: _dropped, ...adjustments } = state.night.adjustments
  void _dropped
  return { ...state, night: { ...state.night, adjustments } }
}

// Deletes every adjustment, away viewers' included.
export function resetViewerSettings(state: AppState): AppState {
  if (Object.keys(state.night.adjustments).length === 0) return state
  return { ...state, night: { ...state.night, adjustments: {} } }
}

export type Outcome = 'watch' | 'tooLong'

export function recordOutcome(
  state: AppState,
  nomination: Nomination,
  outcome: Outcome,
  fromWheel: boolean,
): AppState {
  const night = {
    ...state.night,
    wonFilms: fromWheel ? [...state.night.wonFilms, nomination.tmdbId] : state.night.wonFilms,
    watched: outcome === 'watch' ? [...state.night.watched, nomination] : state.night.watched,
  }
  if (fromWheel && viewersOnWheel(night).length === 0) night.ended = true
  if (outcome === 'tooLong') night.holdoverDismissed = false
  return {
    ...state,
    night,
    holdover: outcome === 'tooLong' ? nomination : state.holdover,
  }
}

export function endNight(state: AppState): AppState {
  return { ...state, night: { ...state.night, ended: true } }
}

export function clearHoldover(state: AppState): AppState {
  return { ...state, holdover: null }
}

// The first spin of a night uses up the film held from an earlier one.
export function startSpin(state: AppState): AppState {
  if (state.night.spun) return state
  return { ...state, night: { ...state.night, spun: true }, holdover: null }
}

export function setHoldoverDismissed(state: AppState, dismissed: boolean): AppState {
  return { ...state, night: { ...state.night, holdoverDismissed: dismissed } }
}
