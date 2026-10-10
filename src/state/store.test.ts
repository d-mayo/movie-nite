import { afterEach, expect, test, vi } from 'vitest'
import { defaultState, type Nomination } from './model.ts'
import { createMemoryPersistence } from './persistence.ts'
import { createAppStore } from './store.ts'
import { presetColors } from '../wheel/colors.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'
import { buildWedges } from '../wheel/wedges.ts'

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
    settings: { tmdbToken: 'remote', viewersHidden: false, wheel: defaultState.settings.wheel },
  })
  expect(store.getState().settings.tmdbToken).toBe('remote')
})

test('viewersHidden defaults to false for an older save and survives a reload', () => {
  const persistence = createMemoryPersistence({ ...defaultState, settings: { tmdbToken: 'tok' } } as never)
  const a = createAppStore(persistence)
  expect(a.getState().settings.viewersHidden).toBe(false)
  a.getState().setViewersHidden(true)
  expect(createAppStore(persistence).getState().settings.viewersHidden).toBe(true)
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
    adjustments: {},
    spun: false,
    holdoverDismissed: false,
  })
  expect(store.getState().holdover).toBeNull()
})

test('the held film flags load false from older saved state and survive a reload once set', () => {
  const persistence = createMemoryPersistence({
    ...defaultState,
    night: { presentIds: [] },
    holdover: film,
  } as never)
  const a = createAppStore(persistence)
  expect(a.getState().night.spun).toBe(false)
  expect(a.getState().night.holdoverDismissed).toBe(false)
  expect(a.getState().holdover).toEqual(film)
  a.getState().setHoldoverDismissed(true)
  expect(createAppStore(persistence).getState().night.holdoverDismissed).toBe(true)
  a.getState().startSpin()
  const b = createAppStore(persistence).getState()
  expect(b.night.spun).toBe(true)
  expect(b.holdover).toBeNull()
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

test('wheel settings and adjustments survive a reload', () => {
  const persistence = createMemoryPersistence()
  const a = createAppStore(persistence)
  a.getState().addViewer('Ann')
  a.getState().addViewer('Bo')
  const ann = a.getState().roster[0].id
  a.getState().setViewerWeight(ann, 9)
  a.getState().setWildcardsPerViewer(false)
  a.getState().setWildcardCount(5)
  a.getState().setWildcardWeight(4)
  a.getState().setDefaultSlices(2)
  a.getState().setDefaultWeight(7)
  a.getState().setSpinSeconds(10)
  a.getState().setSpinTurnsPerSecond(1.5)
  a.getState().setSoundMusic(false)
  a.getState().setSoundEffects(false)
  a.getState().setSoundVolume(35)

  const b = createAppStore(persistence).getState()
  expect(b.night.adjustments).toEqual({ [ann]: { weight: 9 } })
  expect(b.settings.wheel).toEqual({
    wildcardsPerViewer: false,
    wildcardCount: 5,
    wildcardWeight: 4,
    defaultSlices: 2,
    defaultWeight: 7,
    spinSeconds: 10,
    spinTurnsPerSecond: 1.5,
    soundMusic: false,
    soundEffects: false,
    soundVolume: 35,
  })
})

test('a stored state without settings.wheel loads the factory settings, field by field', () => {
  const none = createAppStore(
    createMemoryPersistence({ ...defaultState, settings: { tmdbToken: 'tok' } } as never),
  )
  expect(none.getState().settings.wheel).toEqual(defaultState.settings.wheel)
  const partial = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok', viewersHidden: false, wheel: { wildcardWeight: 4 } },
    } as never),
  )
  expect(partial.getState().settings.wheel).toEqual({
    ...defaultState.settings.wheel,
    wildcardWeight: 4,
  })
})

test('stored spin settings that are missing or invalid load as the factory values', () => {
  const load = (wheel: object) =>
    createAppStore(
      createMemoryPersistence({
        ...defaultState,
        settings: { tmdbToken: 'tok', viewersHidden: false, wheel },
      } as never),
    ).getState().settings.wheel
  expect(load({ wildcardWeight: 4 })).toMatchObject({
    wildcardWeight: 4,
    spinSeconds: 6,
    spinTurnsPerSecond: 0.8,
  })
  expect(load({ spinSeconds: 40 }).spinSeconds).toBe(6)
  expect(load({ spinSeconds: 9, spinTurnsPerSecond: 5 })).toMatchObject({
    spinSeconds: 9,
    spinTurnsPerSecond: 0.8,
  })
})

test('stored sound settings that are missing or invalid load as the factory values', () => {
  const load = (wheel: object) =>
    createAppStore(
      createMemoryPersistence({
        ...defaultState,
        settings: { tmdbToken: 'tok', viewersHidden: false, wheel },
      } as never),
    ).getState().settings.wheel
  expect(load({})).toMatchObject({ soundMusic: true, soundEffects: true, soundVolume: 70 })
  expect(load({ soundMusic: 'no', soundEffects: 0, soundVolume: '30' })).toMatchObject({
    soundMusic: true,
    soundEffects: true,
    soundVolume: 70,
  })
  expect(load({ soundVolume: 150 }).soundVolume).toBe(70)
  expect(load({ soundVolume: 7.5 }).soundVolume).toBe(70)
  expect(load({ soundMusic: false, soundEffects: false, soundVolume: 0 })).toMatchObject({
    soundMusic: false,
    soundEffects: false,
    soundVolume: 0,
  })
})

test('a stored night without adjustments loads with none', () => {
  const store = createAppStore(
    createMemoryPersistence({ ...defaultState, night: { ...defaultState.night, adjustments: undefined } } as never),
  )
  expect(store.getState().night.adjustments).toEqual({})
})

test('a stored layout becomes adjustments and is not kept', () => {
  const layout = {
    viewers: {
      a: { slices: 3, weight: 5 },
      b: { slices: 5, weight: 5 },
      c: { slices: 2, weight: 9 },
      d: { slices: 3, weight: 40 },
    },
    wildcardWeight: 4,
    wildcards: [{ id: 'w0' }],
    order: [
      { kind: 'nomination', id: 'b#0', viewerId: 'b' },
      { kind: 'wildcard', id: 'w0' },
    ],
    handPlaced: true,
  }
  const roster = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id.toUpperCase(), color: presetColors[i] }))
  const { adjustments: _none, ...oldNight } = defaultState.night
  void _none
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      roster,
      night: { ...oldNight, presentIds: ['a', 'b'], layout },
    } as never),
  )
  const state = store.getState()
  expect(state.night.adjustments).toEqual({
    b: { slices: 5 },
    c: { slices: 2, weight: 9 },
    d: { weight: 20 },
  })
  expect('layout' in state.night).toBe(false)
  expect(state.settings.wheel.wildcardWeight).toBe(1)
  const wedges = buildWedges(state.night, state.roster, state.settings.wheel)
  expect(wedges.filter((w) => w.slice.kind === 'nomination' && w.slice.viewerId === 'b')).toHaveLength(5)
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
    createMemoryPersistence({ ...defaultState, settings: { tmdbToken: 'tok', viewersHidden: false }, roster } as never),
  ).getState()

test('a stored roster without colors loads with presets in roster order', () => {
  const s = loaded([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }])
  expect(s.roster.map((v) => v.color)).toEqual(presetColors.slice(0, 3))
  expect(s.settings.tmdbToken).toBe('tok')
  expect(s.version).toBe(1)
})

test('duplicate, invalid and non-preset colors are replaced, the earlier holder keeps theirs', () => {
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

test('a later valid color is reserved before earlier viewers without one are filled', () => {
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

test('restoring the wheel settings is saved and keeps adjustments', () => {
  const persistence = createMemoryPersistence()
  const a = createAppStore(persistence)
  a.getState().addViewer('Ann')
  const ann = a.getState().roster[0].id
  a.getState().setViewerWeight(ann, 9)
  a.getState().setWildcardWeight(4)
  a.getState().setSpinSeconds(10)
  a.getState().restoreWheelSettings()

  const b = createAppStore(persistence).getState()
  expect(b.settings.wheel).toEqual(defaultWheelSettings)
  expect(b.night.adjustments).toEqual({ [ann]: { weight: 9 } })
})
