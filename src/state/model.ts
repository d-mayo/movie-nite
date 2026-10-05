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
  }
}

export const defaultState: AppState = {
  version: 1,
  settings: { tmdbToken: null },
  roster: [],
  night: { presentIds: [], nominations: {} },
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

export function setPresent(
  state: AppState,
  id: string,
  present: boolean,
): AppState {
  if (!state.roster.some((v) => v.id === id)) return state
  const isPresent = state.night.presentIds.includes(id)
  if (present === isPresent) return state
  return {
    ...state,
    night: {
      ...state.night,
      presentIds: present
        ? [...state.night.presentIds, id]
        : state.night.presentIds.filter((p) => p !== id),
      nominations: present
        ? state.night.nominations
        : withoutNomination(state.night.nominations, id),
    },
  }
}

export function nominate(
  state: AppState,
  viewerId: string,
  nomination: Nomination,
): AppState {
  if (!state.night.presentIds.includes(viewerId)) return state
  return {
    ...state,
    night: {
      ...state.night,
      nominations: { ...state.night.nominations, [viewerId]: nomination },
    },
  }
}

export function newNight(state: AppState): AppState {
  return { ...state, night: { ...state.night, nominations: {} } }
}
