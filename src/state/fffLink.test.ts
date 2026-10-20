import { expect, test, vi } from 'vitest'
import { applyFffLink } from './fffLink.ts'
import { createMemoryPersistence } from './persistence.ts'
import { createAppStore } from './store.ts'

function run(search: string, hash = '') {
  const store = createAppStore(createMemoryPersistence())
  const replaceState = vi.fn()
  applyFffLink(store, { pathname: '/movie-nite/', search, hash }, { replaceState, state: null })
  return { store, replaceState }
}

test('?fff unlocks the cards and is removed from the address', () => {
  const { store, replaceState } = run('?fff')
  expect(store.getState().settings.fffUnlocked).toBe(true)
  expect(replaceState).toHaveBeenCalledWith(null, '', '/movie-nite/')
})

test('the path, the other parameters and the hash stay', () => {
  const { store, replaceState } = run('?debug&fff', '#x')
  expect(store.getState().settings.fffUnlocked).toBe(true)
  expect(replaceState).toHaveBeenCalledWith(null, '', '/movie-nite/?debug#x')
})

test('a query without fff changes nothing', () => {
  const { store, replaceState } = run('?debug')
  expect(store.getState().settings.fffUnlocked).toBe(false)
  expect(replaceState).not.toHaveBeenCalled()
})
