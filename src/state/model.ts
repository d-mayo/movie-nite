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
}

export interface AppState {
  version: 1
  settings: { tmdbToken: string | null }
  roster: Viewer[]
  night: {
    presentIds: string[]
    nominations: Record<string, Nomination>
    wonFilms: number[]
    watched: Nomination[]
    ended: boolean
  }
  holdover: Nomination | null
}

export const defaultState: AppState = {
  version: 1,
  settings: { tmdbToken: null },
  roster: [],
  night: {
    presentIds: [],
    nominations: {},
    wonFilms: [],
    watched: [],
    ended: false,
  },
  holdover: null,
}

export function setToken(state: AppState, token: string | null): AppState {
  return { ...state, settings: { ...state.settings, tmdbToken: token } }
}

export function addViewer(state: AppState, name: string, id: string): AppState {
  const trimmed = name.trim()
  if (!trimmed) return state
  const lower = trimmed.toLowerCase()
  if (state.roster.some((v) => v.name.toLowerCase() === lower)) return state
  return {
    ...state,
    roster: [...state.roster, { id, name: trimmed }],
    night: { ...state.night, presentIds: [...state.night.presentIds, id] },
  }
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
  return {
    ...state,
    roster: state.roster.filter((v) => v.id !== id),
    night: {
      ...state.night,
      presentIds: state.night.presentIds.filter((p) => p !== id),
      nominations: withoutNomination(state.night.nominations, id),
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
  const isDone = hasWon(state.night, id)
  return {
    ...state,
    night: {
      ...state.night,
      presentIds: present
        ? [...state.night.presentIds, id]
        : state.night.presentIds.filter((p) => p !== id),
      nominations:
        present || isDone
          ? state.night.nominations
          : withoutNomination(state.night.nominations, id),
    },
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
    night: { ...state.night, nominations, wonFilms: [], watched: [], ended: false },
    holdover: null,
  }
}

export function viewersOnWheel(night: AppState['night']): string[] {
  return night.presentIds.filter((id) => !hasWon(night, id))
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
