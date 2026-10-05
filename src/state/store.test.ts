import { expect, test } from 'vitest'
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
