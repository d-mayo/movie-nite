import { afterEach, expect, test, vi } from 'vitest'
import { defaultState, isBlind, watchedFilms, type Nomination } from './model.ts'
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
    settings: { viewersHidden: true, wheel: defaultState.settings.wheel },
  })
  expect(store.getState().settings.viewersHidden).toBe(true)
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
  expect(store.getState().settings).not.toHaveProperty('tmdbToken')
  expect(store.getState().night).toEqual({
    presentIds: ['x'],
    cardEffects: [],
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
  expect(watchedFilms(b.getState().night).map((f) => f.tmdbId)).toEqual([2])
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
  a.getState().setSoundMusic(0)
  a.getState().setSoundEffects(0)
  a.getState().setSoundVolume(35)
  a.getState().setSoundMuted(true)
  a.getState().setShowLabels(false)

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
    soundMusic: 0,
    soundEffects: 0,
    soundVolume: 35,
    soundMuted: true,
    showLabels: false,
    wildcardWheel: true,
    disabledCards: [],
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
      settings: { viewersHidden: false, wheel: { wildcardWeight: 4 } },
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
        settings: { viewersHidden: false, wheel },
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
        settings: { viewersHidden: false, wheel },
      } as never),
    ).getState().settings.wheel
  expect(load({})).toMatchObject({ soundMusic: 100, soundEffects: 100, soundVolume: 70 })
  expect(load({ soundMusic: 'no', soundEffects: 150, soundVolume: '30' })).toMatchObject({
    soundMusic: 100,
    soundEffects: 100,
    soundVolume: 70,
  })
  // The old on/off switches become 100 and 0.
  expect(load({ soundMusic: false, soundEffects: true })).toMatchObject({
    soundMusic: 0,
    soundEffects: 100,
  })
  expect(load({ soundMuted: 'yes' }).soundMuted).toBe(false)
  expect(load({}).showLabels).toBe(true)
  expect(load({ showLabels: 'no' }).showLabels).toBe(true)
  expect(load({ showLabels: false }).showLabels).toBe(false)
  expect(load({ soundVolume: 150 }).soundVolume).toBe(70)
  expect(load({ soundVolume: 7.5 }).soundVolume).toBe(70)
  expect(load({ soundMusic: 0, soundEffects: 0, soundVolume: 0 })).toMatchObject({
    soundMusic: 0,
    soundEffects: 0,
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
    createMemoryPersistence({ ...defaultState, settings: { viewersHidden: false }, roster } as never),
  ).getState()

test('a stored roster without colors loads with presets in roster order', () => {
  const s = loaded([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }])
  expect(s.roster.map((v) => v.color)).toEqual(presetColors.slice(0, 3))
  expect(s.settings).not.toHaveProperty('tmdbToken')
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

test('a stored token is dropped, saves leave it out, and everything else loads as before', () => {
  const wheel = { ...defaultState.settings.wheel, wildcardWeight: 4, soundVolume: 30 }
  const persistence = createMemoryPersistence({
    ...defaultState,
    settings: { tmdbToken: 'old', viewersHidden: true, wheel },
    roster: [{ id: 'a', name: 'Ann', color: '#e6194b' }],
    night: { ...defaultState.night, presentIds: ['a'], spun: true },
  } as never)
  const store = createAppStore(persistence)
  const loadedState = store.getState()
  expect(loadedState.settings).not.toHaveProperty('tmdbToken')
  expect(loadedState.settings.viewersHidden).toBe(true)
  expect(loadedState.settings.wheel).toMatchObject({ wildcardWeight: 4, soundVolume: 30 })
  expect(loadedState.roster).toEqual([{ id: 'a', name: 'Ann', color: '#e6194b' }])
  expect(loadedState.night.presentIds).toEqual(['a'])
  expect(loadedState.night.spun).toBe(true)
  store.getState().setViewersHidden(false)
  const saved = persistence.load()!
  expect(saved.settings).not.toHaveProperty('tmdbToken')
  expect(saved.version).toBe(1)
})

test('a Letterboxd link survives a reload, and an invalid stored one is dropped', () => {
  const persistence = createMemoryPersistence()
  const a = createAppStore(persistence)
  a.getState().addViewer('Ann')
  const ann = a.getState().roster[0].id
  a.getState().linkLetterboxd(ann, 'Jo')
  a.getState().setLetterboxdStatus(ann, 'jo', 'found')
  expect(createAppStore(persistence).getState().roster[0].letterboxd).toEqual({ username: 'jo', status: 'found' })
  a.getState().unlinkLetterboxd(ann)
  expect(createAppStore(persistence).getState().roster[0].letterboxd).toBeUndefined()

  const s = loaded([
    { id: 'a', name: 'A', letterboxd: { username: 'bad name', status: 'found' } },
    { id: 'b', name: 'B', letterboxd: { username: 'jo', status: 'odd' } },
    { id: 'c', name: 'C', letterboxd: 'jo' },
    { id: 'd', name: 'D', letterboxd: 7 },
    { id: 'e', name: 'E', letterboxd: { username: 'Sam', status: 'pending' } },
  ])
  expect(s.roster.map((v) => v.letterboxd)).toEqual([undefined, undefined, undefined, undefined, { username: 'sam', status: 'pending' }])
  expect(s.roster.map((v) => v.name)).toEqual(['A', 'B', 'C', 'D', 'E'])
  expect(s.roster.every((v) => !('letterboxd' in v) || v.letterboxd)).toBe(true)
  expect(s.version).toBe(1)
})

const effect = {
  cardId: 'wildcards',
  label: '+1 wildcard',
  change: { kind: 'wildcards' as const, amount: 1 },
}

test('a landed card effect is stored, survives a reload and is cleared by New night only', () => {
  const persistence = createMemoryPersistence()
  const a = createAppStore(persistence)
  a.getState().addViewer('Ann')
  const ann = a.getState().roster[0].id
  a.getState().addCardEffect(effect)
  a.getState().setViewerWeight(ann, 8)
  a.getState().resetAllViewerSettings()
  a.getState().resetViewerSettings(ann)
  expect(a.getState().night.cardEffects).toEqual([effect])
  a.getState().removeViewer(ann)
  expect(a.getState().night.cardEffects).toEqual([effect])
  expect(createAppStore(persistence).getState().night.cardEffects).toEqual([effect])
  a.getState().newNight()
  expect(a.getState().night.cardEffects).toEqual([])
})

test('a stored night loads only its valid card effects', () => {
  const persistence = createMemoryPersistence()
  persistence.save({
    ...defaultState,
    night: {
      ...defaultState.night,
      cardEffects: [effect, { cardId: 1 }, null, { cardId: 'x', label: 'y', change: { kind: 'bad' } }],
    } as never,
  })
  expect(createAppStore(persistence).getState().night.cardEffects).toEqual([effect])
  const old = createMemoryPersistence()
  const { cardEffects: _dropped, ...night } = defaultState.night
  void _dropped
  old.save({ ...defaultState, night: night as never })
  expect(createAppStore(old).getState().night.cardEffects).toEqual([])
})

test('the wildcard wheel setting loads as on unless stored as a boolean, and Restore turns it on', () => {
  const persistence = createMemoryPersistence()
  const wheel = { ...defaultWheelSettings, wildcardWheel: 'no' as never }
  persistence.save({ ...defaultState, settings: { ...defaultState.settings, wheel } })
  const store = createAppStore(persistence)
  expect(store.getState().settings.wheel.wildcardWheel).toBe(true)
  store.getState().setWildcardWheel(false)
  expect(store.getState().settings.wheel.wildcardWheel).toBe(false)
  expect(createAppStore(persistence).getState().settings.wheel.wildcardWheel).toBe(false)
  store.getState().restoreWheelSettings()
  expect(store.getState().settings.wheel.wildcardWheel).toBe(true)
})

test('a stored night with a pending Blind Spin loads blind, and a malformed one drops', () => {
  const persistence = createMemoryPersistence()
  const blind = (used: unknown) => ({
    cardId: 'blind-spin',
    label: 'Blind spin',
    change: { kind: 'blindSpin', used },
  })
  persistence.save({
    ...defaultState,
    night: { ...defaultState.night, cardEffects: [blind(false), blind('no')] } as never,
  })
  const store = createAppStore(persistence)
  expect(store.getState().night.cardEffects).toEqual([blind(false)])
  expect(isBlind(store.getState().night)).toBe(true)
  store.getState().startSpin()
  expect(isBlind(createAppStore(persistence).getState().night)).toBe(false)
})

test('the disabled cards load empty unless stored as an array, keep only unique strings, and Restore empties them', () => {
  const load = (disabledCards: unknown) => {
    const persistence = createMemoryPersistence()
    const wheel = { ...defaultWheelSettings, disabledCards: disabledCards as never }
    persistence.save({ ...defaultState, settings: { ...defaultState.settings, wheel } })
    return createAppStore(persistence)
  }
  expect(load('blind-spin').getState().settings.wheel.disabledCards).toEqual([])
  expect(load(undefined).getState().settings.wheel.disabledCards).toEqual([])
  const store = load(['blind-spin', 3, 'blind-spin', 'gone-card', null])
  expect(store.getState().settings.wheel.disabledCards).toEqual(['blind-spin', 'gone-card'])
  store.getState().setCardEnabled('reshuffle', false)
  store.getState().setCardEnabled('blind-spin', true)
  expect(store.getState().settings.wheel.disabledCards).toEqual(['gone-card', 'reshuffle'])
  const before = store.getState().settings.wheel
  store.getState().setCardEnabled('reshuffle', false)
  store.getState().setCardEnabled('blind-spin', true)
  expect(store.getState().settings.wheel).toBe(before)
  store.getState().setWildcardWheel(false)
  store.getState().restoreWheelSettings()
  expect(store.getState().settings.wheel.disabledCards).toEqual([])
  expect(store.getState().settings.wheel.wildcardWheel).toBe(true)
})

test('fffUnlocked loads false unless stored as true, and Restore All Defaults leaves it on', () => {
  for (const stored of [undefined, 'yes', 1, false]) {
    const persistence = createMemoryPersistence({
      ...defaultState,
      settings: { ...defaultState.settings, fffUnlocked: stored as never },
    })
    expect(createAppStore(persistence).getState().settings.fffUnlocked).toBe(false)
  }
  const persistence = createMemoryPersistence({ ...defaultState, settings: { ...defaultState.settings, fffUnlocked: true } })
  const store = createAppStore(persistence)
  expect(store.getState().settings.fffUnlocked).toBe(true)
  store.getState().restoreWheelSettings()
  expect(store.getState().settings.fffUnlocked).toBe(true)
  const off = createAppStore(createMemoryPersistence())
  off.getState().setFffUnlocked(true)
  expect(off.getState().settings.fffUnlocked).toBe(true)
})

test('a stored watched list loads its films and games and drops the malformed', () => {
  const game = { kind: 'game', name: 'Rento', url: 'https://rento.com/' }
  const persistence = createMemoryPersistence({
    ...defaultState,
    night: { ...defaultState.night, watched: [{ tmdbId: 1, title: 'A', year: null, posterPath: null, overview: '', runtime: null, genres: [] }, game, { kind: 'game', name: 3 }, { kind: 'other' }] as never },
  })
  const watched = createAppStore(persistence).getState().night.watched
  expect(watched).toHaveLength(2)
  expect(watched[1]).toEqual(game)
})
