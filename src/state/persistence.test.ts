import { afterEach, describe, expect, test } from 'vitest'
import { addViewer, defaultState, setToken } from './model.ts'
import {
  createLocalStoragePersistence,
  createMemoryPersistence,
} from './persistence.ts'

afterEach(() => localStorage.clear())

const sample = addViewer(setToken(defaultState, 'tok'), 'Ann', 'a')

describe('localStorage persistence', () => {
  test('round-trips state', () => {
    const p = createLocalStoragePersistence(localStorage, 'k')
    p.save(sample)
    expect(createLocalStoragePersistence(localStorage, 'k').load()).toEqual(
      sample,
    )
  })

  test('load returns null for no data, corrupt JSON and another version', () => {
    const p = createLocalStoragePersistence(localStorage, 'k')
    expect(p.load()).toBeNull()
    localStorage.setItem('k', '{not json')
    expect(p.load()).toBeNull()
    localStorage.setItem('k', JSON.stringify({ ...sample, version: 2 }))
    expect(p.load()).toBeNull()
  })

  test('subscribe reports changes from other tabs for its key', () => {
    const p = createLocalStoragePersistence(localStorage, 'k')
    const seen: unknown[] = []
    const off = p.subscribe((s) => seen.push(s))
    const fire = (key: string) =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key,
          newValue: JSON.stringify(sample),
          storageArea: localStorage,
        }),
      )
    fire('other')
    fire('k')
    expect(seen).toEqual([sample])
    off()
    fire('k')
    expect(seen).toHaveLength(1)
  })
})

describe('memory persistence', () => {
  test('round-trips state', () => {
    const p = createMemoryPersistence()
    expect(p.load()).toBeNull()
    p.save(sample)
    expect(p.load()).toEqual(sample)
  })
})
