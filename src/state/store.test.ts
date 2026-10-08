import { afterEach, expect, test, vi } from 'vitest'
import { defaultState, type Nomination } from './model.ts'
import { createMemoryPersistence } from './persistence.ts'
import { createAppStore } from './store.ts'
import { presetColors } from '../wheel/colors.ts'

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

test('a stored layout with per-wildcard weights loads normalised', () => {
  const old = {
    viewers: { a: { weight: 50, slices: 3 } },
    wildcards: [{ id: 'w0', weight: 2 }, { id: 'w1', weight: 30 }],
    order: [],
    handPlaced: false,
  }
  const store = createAppStore(
    createMemoryPersistence({ ...defaultState, night: { ...defaultState.night, layout: old } } as never),
  )
  const layout = store.getState().night.layout
  expect(layout?.wildcardWeight).toBe(2)
  expect(layout?.wildcards).toEqual([{ id: 'w0' }, { id: 'w1' }])
  expect(layout?.viewers.a.weight).toBe(20)
})

test('a stored layout of null loads as null', () => {
  const store = createAppStore(createMemoryPersistence({ ...defaultState } as never))
  expect(store.getState().night.layout).toBeNull()
})

test('a saved roster name longer than 20 characters loads unchanged', () => {
  const name = 'a very long viewer name indeed'
  const store = createAppStore(
    createMemoryPersistence({ ...defaultState, roster: [{ id: 'x', name }] } as never),
  )
  expect(store.getState().roster[0].name).toBe(name)
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

const loaded = (roster: unknown[]) =>
  createAppStore(
    createMemoryPersistence({ ...defaultState, settings: { tmdbToken: 'tok' }, roster } as never),
  ).getState()

test('a stored roster without colours loads with presets in roster order', () => {
  const s = loaded([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }])
  expect(s.roster.map((v) => v.color)).toEqual(presetColors.slice(0, 3))
  expect(s.settings.tmdbToken).toBe('tok')
  expect(s.version).toBe(1)
})

test('duplicate, invalid and non-preset colours are replaced, the earlier holder keeps theirs', () => {
  const first = presetColors[4]
  for (const bad of [first, 'nonsense', '#123456']) {
    const s = loaded([
      { id: 'a', name: 'A', color: first },
      { id: 'b', name: 'B', color: bad },
    ])
    expect(s.roster[0].color).toBe(first)
    expect(s.roster[1].color).toBe(presetColors[0])
  }
})

test('a later valid colour is reserved before earlier viewers without one are filled', () => {
  const s = loaded([
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B', color: presetColors[0] },
  ])
  expect(s.roster.map((v) => v.color)).toEqual([presetColors[1], presetColors[0]])
})

test('a stored roster of 14 loads, the last two taking presets 0 and 1', () => {
  const s = loaded(Array.from({ length: 14 }, (_, i) => ({ id: `i${i}`, name: `N${i}` })))
  expect(s.roster).toHaveLength(14)
  expect(s.roster[12].color).toBe(presetColors[0])
  expect(s.roster[13].color).toBe(presetColors[1])
})
