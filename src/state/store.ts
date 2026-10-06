import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  addViewer,
  addWheelWildcard,
  clearHoldover,
  defaultState,
  endNight,
  moveWheelSlice,
  newNight,
  nominate,
  recordOutcome,
  removeViewer,
  removeWheelWildcard,
  resetLayout,
  setPresent,
  setToken,
  setViewerSliceCount,
  setViewerWeightOnWheel,
  setWildcardWeightOnWheel,
  spreadWheelEvenly,
  type AppState,
  type Nomination,
  type Outcome,
} from './model.ts'
import type { Persistence } from './persistence.ts'
import { normaliseLayout } from '../wheel/edit.ts'

export interface AppActions {
  setToken(token: string | null): void
  addViewer(name: string): void
  removeViewer(id: string): void
  setPresent(id: string, present: boolean): void
  nominate(viewerId: string, nomination: Nomination): void
  newNight(): void
  recordOutcome(nomination: Nomination, outcome: Outcome, fromWheel: boolean): void
  endNight(): void
  clearHoldover(): void
  setViewerWeight(viewerId: string, weight: number): void
  setViewerSlices(viewerId: string, count: number): void
  setWildcardWeight(weight: number): void
  addWildcard(): void
  removeWildcard(id: string): void
  moveSlice(from: number, to: number): void
  spreadEvenly(): void
  resetLayout(): void
}

export type AppStore = StoreApi<AppState & AppActions>

// Merges one level deep so fields added by later versions get their defaults.
function mergeOverDefaults(stored: AppState | null): AppState {
  if (!stored) return defaultState
  const night = { ...defaultState.night, ...stored.night }
  // Layouts saved before the shared wildcard weight need converting.
  if (night.layout && typeof night.layout === 'object') night.layout = normaliseLayout(night.layout)
  return {
    ...defaultState,
    ...stored,
    settings: { ...defaultState.settings, ...stored.settings },
    night,
  }
}

function dataOf(full: AppState & AppActions): AppState {
  return {
    version: full.version,
    settings: full.settings,
    roster: full.roster,
    night: full.night,
    holdover: full.holdover,
  }
}

export function createAppStore(persistence: Persistence): AppStore {
  const store = createStore<AppState & AppActions>()((set) => {
    const update = (fn: (s: AppState) => AppState) => set((full) => fn(dataOf(full)))
    return {
      ...mergeOverDefaults(persistence.load()),
      setToken: (token) => update((s) => setToken(s, token)),
      addViewer: (name) => update((s) => addViewer(s, name, crypto.randomUUID())),
      removeViewer: (id) => update((s) => removeViewer(s, id)),
      setPresent: (id, present) => update((s) => setPresent(s, id, present)),
      nominate: (viewerId, nomination) => update((s) => nominate(s, viewerId, nomination)),
      newNight: () => update(newNight),
      recordOutcome: (nomination, outcome, fromWheel) =>
        update((s) => recordOutcome(s, nomination, outcome, fromWheel)),
      endNight: () => update(endNight),
      clearHoldover: () => update(clearHoldover),
      setViewerWeight: (id, weight) => update((s) => setViewerWeightOnWheel(s, id, weight)),
      setViewerSlices: (id, count) => update((s) => setViewerSliceCount(s, id, count)),
      setWildcardWeight: (weight) => update((s) => setWildcardWeightOnWheel(s, weight)),
      addWildcard: () => update(addWheelWildcard),
      removeWildcard: (id) => update((s) => removeWheelWildcard(s, id)),
      moveSlice: (from, to) => update((s) => moveWheelSlice(s, from, to)),
      spreadEvenly: () => update(spreadWheelEvenly),
      resetLayout: () => update(resetLayout),
    }
  })

  store.subscribe((state, prev) => {
    if (
      state.settings !== prev.settings ||
      state.roster !== prev.roster ||
      state.night !== prev.night ||
      state.holdover !== prev.holdover
    ) {
      persistence.save(dataOf(state))
    }
  })
  persistence.subscribe((remote) => store.setState(mergeOverDefaults(remote)))
  return store
}

export const AppStoreContext = createContext<AppStore | null>(null)

export function useApp(): AppState & AppActions {
  const store = useContext(AppStoreContext)
  if (!store) throw new Error('AppStoreContext is missing')
  return useStore(store)
}
