import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  addViewer,
  defaultState,
  newNight,
  nominate,
  removeViewer,
  setPresent,
  setToken,
  type AppState,
  type Nomination,
} from './model.ts'
import type { Persistence } from './persistence.ts'

export interface AppActions {
  setToken(token: string | null): void
  addViewer(name: string): void
  removeViewer(id: string): void
  setPresent(id: string, present: boolean): void
  nominate(viewerId: string, nomination: Nomination): void
  newNight(): void
}

export type AppStore = StoreApi<AppState & AppActions>

// Merges one level deep so fields added by later versions get their defaults.
function mergeOverDefaults(stored: AppState | null): AppState {
  if (!stored) return defaultState
  return {
    ...defaultState,
    ...stored,
    settings: { ...defaultState.settings, ...stored.settings },
    night: { ...defaultState.night, ...stored.night },
  }
}

function dataOf(full: AppState & AppActions): AppState {
  return {
    version: full.version,
    settings: full.settings,
    roster: full.roster,
    night: full.night,
  }
}

export function createAppStore(persistence: Persistence): AppStore {
  const store = createStore<AppState & AppActions>()((set) => {
    const update = (fn: (s: AppState) => AppState) =>
      set((full) => fn(dataOf(full)))
    return {
      ...mergeOverDefaults(persistence.load()),
      setToken: (token) => update((s) => setToken(s, token)),
      addViewer: (name) =>
        update((s) => addViewer(s, name, crypto.randomUUID())),
      removeViewer: (id) => update((s) => removeViewer(s, id)),
      setPresent: (id, present) => update((s) => setPresent(s, id, present)),
      nominate: (viewerId, nomination) =>
        update((s) => nominate(s, viewerId, nomination)),
      newNight: () => update(newNight),
    }
  })

  store.subscribe((state, prev) => {
    if (
      state.settings !== prev.settings ||
      state.roster !== prev.roster ||
      state.night !== prev.night
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
