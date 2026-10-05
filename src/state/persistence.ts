import type { AppState } from './model.ts'

export interface Persistence {
  load(): AppState | null
  save(state: AppState): void
  subscribe(onRemoteChange: (state: AppState) => void): () => void
}

const defaultKey = 'movie-nite'

function parse(raw: string | null): AppState | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (
      typeof data === 'object' &&
      data !== null &&
      (data as { version?: unknown }).version === 1
    ) {
      return data as AppState
    }
  } catch {
    // unparsable data is treated as missing
  }
  return null
}

export function createLocalStoragePersistence(
  storage: Storage = window.localStorage,
  key: string = defaultKey,
): Persistence {
  return {
    load: () => {
      try {
        return parse(storage.getItem(key))
      } catch {
        return null
      }
    },
    save: (state) => {
      try {
        storage.setItem(key, JSON.stringify(state))
      } catch {
        // storage full or blocked: keep running in memory
      }
    },
    subscribe: (onRemoteChange) => {
      const listener = (e: StorageEvent) => {
        if (e.storageArea !== storage || e.key !== key) return
        const state = parse(e.newValue)
        if (state) onRemoteChange(state)
      }
      window.addEventListener('storage', listener)
      return () => window.removeEventListener('storage', listener)
    },
  }
}

export function createMemoryPersistence(
  initial: AppState | null = null,
): Persistence & { emitRemoteChange(state: AppState): void } {
  let current = initial
  const listeners = new Set<(state: AppState) => void>()
  return {
    load: () => current,
    save: (state) => {
      current = structuredClone(state)
    },
    subscribe: (onRemoteChange) => {
      listeners.add(onRemoteChange)
      return () => listeners.delete(onRemoteChange)
    },
    emitRemoteChange: (state) => {
      current = structuredClone(state)
      listeners.forEach((l) => l(state))
    },
  }
}
