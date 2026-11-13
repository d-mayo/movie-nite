// @vitest-environment node
import { expect, test, vi } from 'vitest'
import { applyDebugLink } from './debugLink.ts'
import { createMemoryPersistence } from './persistence.ts'
import { createAppStore } from './store.ts'
import { defaultState } from './model.ts'

function run(search: string, enabled = false, hash = '') {
  const store = createAppStore(
    createMemoryPersistence({ ...defaultState, settings: { ...defaultState.settings, debugEnabled: enabled } }),
  )
  const replaceState = vi.fn()
  applyDebugLink(store, { pathname: '/movie-nite/', search, hash }, { replaceState, state: null })
  return { store, replaceState }
}

test('?debug turns the debug options on and leaves the address alone', () => {
  const { store, replaceState } = run('?debug')
  expect(store.getState().settings.debugEnabled).toBe(true)
  expect(replaceState).not.toHaveBeenCalled()
})

test('they stay on without the parameter, and load off unless stored as true', () => {
  expect(run('', true).store.getState().settings.debugEnabled).toBe(true)
  expect(run('').store.getState().settings.debugEnabled).toBe(false)
  const odd = createMemoryPersistence({ ...defaultState, settings: { ...defaultState.settings, debugEnabled: 'yes' as never } })
  expect(createAppStore(odd).getState().settings.debugEnabled).toBe(false)
})

test('?debug=off turns them off and is removed, keeping the rest of the address', () => {
  const { store, replaceState } = run('?fff&debug=off', true, '#x')
  expect(store.getState().settings.debugEnabled).toBe(false)
  expect(replaceState).toHaveBeenCalledWith(null, '', '/movie-nite/?fff#x')
})
