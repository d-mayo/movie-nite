import { afterEach, expect, test, vi } from 'vitest'
import { defaultState, type Nomination } from './model.ts'
import { createMemoryPersistence } from './persistence.ts'
import { createAppStore } from './store.ts'

const film: Nomination = {
  tmdbId: 1,
  title: 'Film',
  year: 1999,
  posterPath: null,
  overview: 'o',
  runtime: 90,
  genres: ['Comedy'],
}

const data = (s: ReturnType<ReturnType<typeof createAppStore>['getState']>) => ({
  version: s.version,
  settings: s.settings,
  roster: s.roster,
  night: s.night,
  holdover: s.holdover,
})

test('state survives a simulated reload', () => {
  const persistence = createMemoryPersistence()
  const a = createAppStore(persistence)
  a.getState().setToken('tok')
  a.getState().addViewer('Ann')
  a.getState().addViewer('Bo')
  const ann = a.getState().roster[0].id
  a.getState().nominate(ann, film)
  a.getState().setPresent(a.getState().roster[1].id, false)

  const b = createAppStore(persistence)
  expect(data(b.getState())).toEqual(data(a.getState()))
  expect(b.getState().night.nominations[ann]).toEqual(film)
})

test('a remote change replaces the state', () => {
  const persistence = createMemoryPersistence()
  const store = createAppStore(persistence)
  persistence.emitRemoteChange({
    ...defaultState,
    settings: { tmdbToken: 'remote' },
  })
  expect(store.getState().settings.tmdbToken).toBe('remote')
})

test('stored data missing a field is merged over the defaults', () => {
  const persistence = createMemoryPersistence({
    version: 1,
    settings: { tmdbToken: 'tok' },
    roster: [],
    night: { presentIds: ['x'] },
  } as never)
  const store = createAppStore(persistence)
  expect(store.getState().settings.tmdbToken).toBe('tok')
  expect(store.getState().night).toEqual({
    presentIds: ['x'],
    nominations: {},
    wonFilms: [],
    watched: [],
    ended: false,
    layout: null,
  })
  expect(store.getState().holdover).toBeNull()
})

test('night progress and the holdover survive a reload, and clearing is saved', () => {
  const persistence = createMemoryPersistence()
  const a = createAppStore(persistence)
  a.getState().addViewer('Ann')
  const ann = a.getState().roster[0].id
  a.getState().nominate(ann, film)
  a.getState().recordOutcome(film, 'tooLong', true)
  a.getState().recordOutcome({ ...film, tmdbId: 2 }, 'watch', false)

  const b = createAppStore(persistence)
  expect(b.getState().night.wonFilms).toEqual([1])
  expect(b.getState().night.watched.map((f) => f.tmdbId)).toEqual([2])
  expect(b.getState().night.ended).toBe(true)
  expect(b.getState().holdover).toEqual(film)

  b.getState().clearHoldover()
  expect(createAppStore(persistence).getState().holdover).toBeNull()
})

test('an edited layout survives a reload, including hand-placed', () => {
  const persistence = createMemoryPersistence()
  const a = createAppStore(persistence)
  a.getState().addViewer('Ann')
  a.getState().addViewer('Bo')
  a.getState().setViewerWeight(a.getState().roster[0].id, 9)
  a.getState().moveSlice(0, 2)

  const b = createAppStore(persistence)
  expect(b.getState().night.layout).toEqual(a.getState().night.layout)
  expect(b.getState().night.layout?.handPlaced).toBe(true)
  expect(b.getState().night.layout?.viewers[a.getState().roster[0].id].weight).toBe(9)
})

test('a stored document without a layout loads with null', () => {
  const store = createAppStore(
    createMemoryPersistence({ ...defaultState, night: { ...defaultState.night, layout: undefined } } as never),
  )
  expect(store.getState().night.layout ?? null).toBeNull()
})

afterEach(() => vi.unstubAllGlobals())

test('adding viewers works without crypto.randomUUID, as on a plain-HTTP origin', () => {
  const real = globalThis.crypto
  vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
  const store = createAppStore(createMemoryPersistence())
  store.getState().addViewer('Ann')
  store.getState().addViewer('Bo')
  const { roster, night } = store.getState()
  expect(roster.map((v) => v.name)).toEqual(['Ann', 'Bo'])
  expect(roster[0].id).not.toBe('')
  expect(roster[0].id).not.toBe(roster[1].id)
  expect(night.presentIds).toEqual(roster.map((v) => v.id))
})
