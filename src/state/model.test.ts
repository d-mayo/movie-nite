import { describe, expect, test } from 'vitest'
import {
  addViewer,
  clearHoldover,
  endNight,
  defaultState,
  newNight,
  nominate,
  recordOutcome,
  removeNomination,
  resetViewerSetting,
  resetViewerSettings,
  setDefaultSlices,
  setDefaultWeight,
  setSpinSeconds,
  setSpinTurnsPerSecond,
  setWildcardCount,
  setWildcardsPerViewer,
  setWildcardWeight,
  removeViewer,
  setHoldoverDismissed,
  setPresent,
  setToken,
  setViewersHidden,
  startSpin,
  setViewerSliceCount,
  setViewerWeightOnWheel,
  viewersOnWheel,
  type Nomination,
  setViewerColor,
  maxViewers,
} from './model.ts'
import { presetColors } from '../wheel/colors.ts'
import { defaultWheelSettings, effectiveSetting } from '../wheel/edit.ts'

const film = (tmdbId: number): Nomination => ({
  tmdbId,
  title: `Film ${tmdbId}`,
  year: 2000,
  posterPath: '/p.jpg',
  overview: 'o',
  runtime: 100,
  genres: ['Drama'],
})

describe('addViewer', () => {
  test('trims the name and adds the viewer ticked', () => {
    const s = addViewer(defaultState, '  Ann ', 'a')
    expect(s.roster).toEqual([{ id: 'a', name: 'Ann', color: presetColors[0] }])
    expect(s.night.presentIds).toEqual(['a'])
  })

  test('rejects empty and case-insensitive duplicate names', () => {
    const s = addViewer(defaultState, 'Ann', 'a')
    expect(addViewer(s, '   ', 'b')).toBe(s)
    expect(addViewer(s, ' ANN', 'b')).toBe(s)
  })

  test('keeps only the first 20 characters, before the duplicate check', () => {
    const long = 'abcdefghijklmnopqrstuvwxy'
    const s = addViewer(defaultState, long, 'a')
    expect(s.roster[0].name).toBe('abcdefghijklmnopqrst')
    expect(addViewer(s, 'ABCDEFGHIJKLMNOPQRSTzzz', 'b')).toBe(s)
  })
})

describe('removeViewer', () => {
  test('drops the viewer from roster, ticks and nominations', () => {
    let s = addViewer(defaultState, 'Ann', 'a')
    s = addViewer(s, 'Bo', 'b')
    s = nominate(s, 'a', film(1))
    s = nominate(s, 'b', film(2))
    s = removeViewer(s, 'a')
    expect(s.roster.map((v) => v.id)).toEqual(['b'])
    expect(s.night.presentIds).toEqual(['b'])
    expect(Object.keys(s.night.nominations)).toEqual(['b'])
  })
})

describe('setPresent', () => {
  test('marking away keeps the nomination, and coming back finds it', () => {
    let s = addViewer(defaultState, 'Ann', 'a')
    s = nominate(s, 'a', film(1))
    s = setPresent(s, 'a', false)
    expect(s.night.presentIds).toEqual([])
    expect(s.night.nominations.a.tmdbId).toBe(1)
    s = setPresent(s, 'a', true)
    expect(s.night.presentIds).toEqual(['a'])
    expect(s.night.nominations.a.tmdbId).toBe(1)
  })
})

describe('nominate', () => {
  test('replaces, ignores non-present viewers, allows the same film twice', () => {
    let s = addViewer(defaultState, 'Ann', 'a')
    s = addViewer(s, 'Bo', 'b')
    s = nominate(s, 'a', film(1))
    s = nominate(s, 'a', film(2))
    expect(s.night.nominations.a.tmdbId).toBe(2)
    s = nominate(s, 'b', film(2))
    expect(s.night.nominations.b.tmdbId).toBe(2)
    const unticked = setPresent(s, 'b', false)
    expect(nominate(unticked, 'b', film(3))).toBe(unticked)
    expect(nominate(s, 'ghost', film(3))).toBe(s)
  })
})

describe('newNight', () => {
  test('keeps leftover nominations, roster, token and ticks', () => {
    let s = setToken(defaultState, 'tok')
    s = addViewer(s, 'Ann', 'a')
    s = nominate(s, 'a', film(1))
    s = newNight(s)
    expect(s.night.nominations.a.tmdbId).toBe(1)
    expect(s.night.presentIds).toEqual(['a'])
    expect(s.roster).toHaveLength(1)
    expect(s.settings.tmdbToken).toBe('tok')
  })
})

function three() {
  let s = addViewer(defaultState, 'Ann', 'a')
  s = addViewer(s, 'Bo', 'b')
  s = addViewer(s, 'Cy', 'c')
  s = nominate(s, 'a', film(1))
  s = nominate(s, 'b', film(1))
  return nominate(s, 'c', film(2))
}

describe('viewersOnWheel', () => {
  test('keeps tick order, drops winners and duplicates, keeps the un-nominated', () => {
    let s = addViewer(three(), 'Di', 'd')
    expect(viewersOnWheel(s.night)).toEqual(['a', 'b', 'c', 'd'])
    s = recordOutcome(s, film(2), 'watch', true)
    expect(viewersOnWheel(s.night)).toEqual(['a', 'b', 'd'])
    s = recordOutcome(s, film(1), 'watch', true)
    expect(viewersOnWheel(s.night)).toEqual(['d'])
  })

  test('unticking drops a viewer; a done viewer keeps their film and stays off', () => {
    let s = setPresent(three(), 'c', false)
    expect(viewersOnWheel(s.night)).toEqual(['a', 'b'])
    s = recordOutcome(s, film(1), 'watch', true)
    s = setPresent(s, 'a', false)
    expect(s.night.nominations.a.tmdbId).toBe(1)
    s = setPresent(s, 'a', true)
    expect(viewersOnWheel(s.night)).toEqual([])
  })
})

describe('recordOutcome', () => {
  test('watch from the wheel records the win and the film', () => {
    const s = recordOutcome(three(), film(1), 'watch', true)
    expect(s.night.wonFilms).toEqual([1])
    expect(s.night.watched.map((f) => f.tmdbId)).toEqual([1])
    expect(s.night.ended).toBe(false)
  })

  test('too long sets and replaces the holdover and leaves watched alone', () => {
    let s = recordOutcome(three(), film(1), 'tooLong', true)
    expect(s.holdover?.tmdbId).toBe(1)
    expect(s.night.watched).toEqual([])
    s = recordOutcome(s, film(2), 'tooLong', true)
    expect(s.holdover?.tmdbId).toBe(2)
  })

  test('a wildcard pick never touches wonFilms or ends the night', () => {
    const s = recordOutcome(three(), film(9), 'watch', false)
    expect(s.night.wonFilms).toEqual([])
    expect(s.night.watched.map((f) => f.tmdbId)).toEqual([9])
    expect(s.night.ended).toBe(false)
    expect(recordOutcome(three(), film(9), 'tooLong', false).holdover?.tmdbId).toBe(9)
  })

  test('ends the night when nobody is left on the wheel', () => {
    let s = recordOutcome(three(), film(1), 'watch', true)
    expect(s.night.ended).toBe(false)
    s = recordOutcome(s, film(2), 'tooLong', true)
    expect(s.night.ended).toBe(true)
  })
})

describe('won films', () => {
  test('nominate ignores a viewer whose film has won and a film that has won', () => {
    let s = addViewer(three(), 'Di', 'd')
    s = recordOutcome(s, film(1), 'watch', true)
    expect(nominate(s, 'a', film(5))).toBe(s)
    expect(nominate(s, 'd', film(1))).toBe(s)
    expect(nominate(s, 'd', film(5)).night.nominations.d.tmdbId).toBe(5)
  })
})

describe('endNight and clearHoldover', () => {
  test('set the flag and clear the holdover', () => {
    expect(endNight(defaultState).night.ended).toBe(true)
    const s = recordOutcome(three(), film(1), 'tooLong', true)
    expect(clearHoldover(s).holdover).toBeNull()
  })
})

describe('newNight with a night in progress', () => {
  test('clears won films, watched and ended; keeps the holdover, leftovers, roster, ticks, token', () => {
    let s = nominate(addViewer(setToken(three(), 'tok'), 'Di', 'd'), 'd', film(3))
    s = recordOutcome(s, film(1), 'tooLong', true)
    s = endNight(recordOutcome(s, film(2), 'watch', true))
    s = newNight(s)
    expect(Object.keys(s.night.nominations)).toEqual(['d'])
    expect(s.night.wonFilms).toEqual([])
    expect(s.night.watched).toEqual([])
    expect(s.night.ended).toBe(false)
    expect(s.night.presentIds).toEqual(['a', 'b', 'c', 'd'])
    expect(s.holdover?.tmdbId).toBe(1)
    expect(s.settings.tmdbToken).toBe('tok')
  })
})

describe('global wheel settings', () => {
  const three = () => {
    let s = defaultState
    for (const [id, name] of [['a', 'Ann'], ['b', 'Bo'], ['c', 'Cy']]) s = addViewer(s, name, id)
    return s
  }

  test('start at the factory values', () => {
    expect(defaultState.settings.wheel).toEqual({
      wildcardsPerViewer: true,
      wildcardCount: 3,
      wildcardWeight: 1,
      defaultSlices: 3,
      defaultWeight: 5,
      spinSeconds: 6,
      spinTurnsPerSecond: 0.8,
    })
  })

  test('each setter accepts its range and ignores values outside it', () => {
    expect(setWildcardCount(defaultState, 0).settings.wheel.wildcardCount).toBe(0)
    expect(setWildcardCount(defaultState, 12).settings.wheel.wildcardCount).toBe(12)
    expect(setWildcardCount(defaultState, 13)).toBe(defaultState)
    expect(setWildcardCount(defaultState, -1)).toBe(defaultState)
    expect(setWildcardWeight(defaultState, 20).settings.wheel.wildcardWeight).toBe(20)
    expect(setWildcardWeight(defaultState, 0)).toBe(defaultState)
    expect(setWildcardWeight(defaultState, 1.3)).toBe(defaultState)
    expect(setDefaultSlices(defaultState, 12).settings.wheel.defaultSlices).toBe(12)
    expect(setDefaultSlices(defaultState, 0)).toBe(defaultState)
    expect(setDefaultWeight(defaultState, 0.5).settings.wheel.defaultWeight).toBe(0.5)
    expect(setDefaultWeight(defaultState, 21)).toBe(defaultState)
    expect(setSpinSeconds(defaultState, 15).settings.wheel.spinSeconds).toBe(15)
    expect(setSpinSeconds(defaultState, 2).settings.wheel.spinSeconds).toBe(2)
    expect(setSpinSeconds(defaultState, 1.5)).toBe(defaultState)
    expect(setSpinSeconds(defaultState, 6.25)).toBe(defaultState)
    expect(setSpinTurnsPerSecond(defaultState, 3).settings.wheel.spinTurnsPerSecond).toBe(3)
    expect(setSpinTurnsPerSecond(defaultState, 0.3).settings.wheel.spinTurnsPerSecond).toBe(0.3)
    expect(setSpinTurnsPerSecond(defaultState, 0.2)).toBe(defaultState)
    expect(setSpinTurnsPerSecond(defaultState, 0.85)).toBe(defaultState)
  })

  test('turning One per viewer off sets the count to the viewers on the wheel; on leaves it', () => {
    const off = setWildcardsPerViewer(three(), false)
    expect(off.settings.wheel.wildcardsPerViewer).toBe(false)
    expect(off.settings.wheel.wildcardCount).toBe(3)
    const fewer = setWildcardsPerViewer(setPresent(three(), 'c', false), false)
    expect(fewer.settings.wheel.wildcardCount).toBe(2)
    const on = setWildcardsPerViewer(setWildcardCount(off, 7), true)
    expect(on.settings.wheel.wildcardCount).toBe(7)
    const same = three()
    expect(setWildcardsPerViewer(same, true)).toBe(same)
  })

  test('a changed default is followed by unadjusted viewers only', () => {
    let s = setViewerWeightOnWheel(three(), 'a', 8)
    s = setDefaultWeight(s, 6)
    expect(effectiveSetting(s.settings.wheel, s.night.adjustments, 'a').weight).toBe(8)
    expect(effectiveSetting(s.settings.wheel, s.night.adjustments, 'b').weight).toBe(6)
  })

  test('New night keeps the settings', () => {
    const s = setSpinTurnsPerSecond(
      setSpinSeconds(setDefaultSlices(setWildcardsPerViewer(three(), false), 5), 9),
      1.5,
    )
    expect(newNight(s).settings.wheel).toEqual(s.settings.wheel)
  })
})

describe('adjustments', () => {
  const three = () => {
    let s = defaultState
    for (const [id, name] of [['a', 'Ann'], ['b', 'Bo'], ['c', 'Cy']]) s = addViewer(s, name, id)
    return s
  }

  test('setting a changed value records only that field', () => {
    expect(setViewerSliceCount(three(), 'b', 4).night.adjustments).toEqual({ b: { slices: 4 } })
    expect(setViewerWeightOnWheel(three(), 'b', 8).night.adjustments).toEqual({ b: { weight: 8 } })
  })

  test('setting it back to the default keeps the adjustment; a no-op records nothing', () => {
    const back = setViewerSliceCount(setViewerSliceCount(three(), 'b', 4), 'b', 3)
    expect(back.night.adjustments).toEqual({ b: { slices: 3 } })
    const s = three()
    expect(setViewerSliceCount(s, 'b', 3)).toBe(s)
    expect(setViewerWeightOnWheel(s, 'b', 5)).toBe(s)
  })

  test('invalid values and unknown viewers change nothing', () => {
    const s = three()
    expect(setViewerWeightOnWheel(s, 'a', 0)).toBe(s)
    expect(setViewerWeightOnWheel(s, 'a', 100)).toBe(s)
    expect(setViewerSliceCount(s, 'a', 13)).toBe(s)
    expect(setViewerSliceCount(s, 'zz', 4)).toBe(s)
  })

  test('reset deletes one viewer entry, reset all deletes every entry, away viewers included', () => {
    let s = setViewerWeightOnWheel(setViewerSliceCount(three(), 'a', 4), 'b', 2)
    s = setPresent(s, 'b', false)
    expect(resetViewerSetting(s, 'a').night.adjustments).toEqual({ b: { weight: 2 } })
    expect(resetViewerSetting(s, 'c')).toBe(s)
    expect(resetViewerSettings(s).night.adjustments).toEqual({})
    const none = three()
    expect(resetViewerSettings(none)).toBe(none)
  })

  test('New night clears them, Remove drops the entry, leaving and joining keeps them', () => {
    const s = setViewerSliceCount(three(), 'b', 4)
    expect(newNight(s).night.adjustments).toEqual({})
    expect(removeViewer(s, 'b').night.adjustments).toEqual({})
    const back = setPresent(setPresent(s, 'b', false), 'b', true)
    expect(back.night.adjustments).toEqual({ b: { slices: 4 } })
    expect(defaultWheelSettings.defaultSlices).toBe(3)
  })

  test('a win does not change the adjustments', () => {
    let s = setViewerSliceCount(three(), 'b', 4)
    s = nominate(s, 'a', film(1))
    expect(recordOutcome(s, film(1), 'watch', true).night.adjustments).toEqual(s.night.adjustments)
  })
})

describe('viewer colors', () => {
  const withViewers = (n: number) => {
    let s = defaultState
    for (let i = 0; i < n; i++) s = addViewer(s, `V${i}`, `id${i}`)
    return s
  }

  test('new viewers get the first free preset', () => {
    const s = withViewers(2)
    expect(s.roster.map((v) => v.color)).toEqual([presetColors[0], presetColors[1]])
    const freed = addViewer(removeViewer(s, 'id0'), 'New', 'n')
    expect(freed.roster.at(-1)?.color).toBe(presetColors[0])
  })

  test('a changed color is skipped by the next new viewer', () => {
    const s = setViewerColor(withViewers(1), 'id0', presetColors[5])
    expect(addViewer(s, 'Bo', 'b').roster[1].color).toBe(presetColors[0])
    const t = addViewer(addViewer(s, 'Bo', 'b'), 'Cy', 'c')
    expect(t.roster.map((v) => v.color)).not.toContain(undefined)
    expect(new Set(withViewers(6).roster.map((v) => v.color)).size).toBe(6)
  })

  test('the roster is capped at 12 and removal frees a color', () => {
    const full = withViewers(maxViewers)
    expect(addViewer(full, 'Extra', 'x')).toBe(full)
    const freed = addViewer(removeViewer(full, 'id3'), 'Extra', 'x')
    expect(freed.roster.at(-1)?.color).toBe(presetColors[3])
  })

  test('setViewerColor refuses non-presets and colors held by others', () => {
    const s = withViewers(2)
    expect(setViewerColor(s, 'id0', '#123456')).toBe(s)
    expect(setViewerColor(s, 'id0', presetColors[1])).toBe(s)
    expect(setViewerColor(s, 'id0', presetColors[7]).roster[0].color).toBe(presetColors[7])
  })
})

describe('removeNomination', () => {
  test('takes a film off its viewer, but not one that has won', () => {
    let s = addViewer(defaultState, 'Ann', 'a')
    s = nominate(s, 'a', film(1))
    const removed = removeNomination(s, 'a')
    expect(removed.night.nominations).toEqual({})
    expect(removeNomination(removed, 'a')).toBe(removed)
    const won = recordOutcome(s, film(1), 'watch', true)
    expect(removeNomination(won, 'a')).toBe(won)
  })
})

describe('the held film across nights', () => {
  test('defaults are false and newNight keeps the film and resets both flags', () => {
    expect(defaultState.night.spun).toBe(false)
    expect(defaultState.night.holdoverDismissed).toBe(false)
    let s = recordOutcome(three(), film(1), 'tooLong', true)
    s = setHoldoverDismissed(startSpin(s), true)
    expect(s.night.spun).toBe(true)
    s = newNight(s)
    expect(s.holdover).toBeNull()
    let t = setHoldoverDismissed(recordOutcome(three(), film(1), 'tooLong', true), true)
    t = newNight(t)
    expect(t.holdover?.tmdbId).toBe(1)
    expect(t.night.spun).toBe(false)
    expect(t.night.holdoverDismissed).toBe(false)
  })

  test('the first spin clears the film, a Too long on it sets a new one, later spins leave it', () => {
    let s = newNight(recordOutcome(three(), film(1), 'tooLong', true))
    s = startSpin(s)
    expect(s.night.spun).toBe(true)
    expect(s.holdover).toBeNull()
    s = recordOutcome(s, film(2), 'tooLong', true)
    s = startSpin(s)
    expect(s.holdover?.tmdbId).toBe(2)
  })

  test('on a night already spun a spin start leaves the film', () => {
    let s = startSpin(three())
    s = recordOutcome(s, film(3), 'tooLong', true)
    expect(startSpin(s)).toBe(s)
  })

  test('too long reopens a dismissed card, watch leaves the flag, dismiss and reopen toggle it', () => {
    let s = setHoldoverDismissed(recordOutcome(three(), film(1), 'tooLong', true), true)
    expect(s.night.holdoverDismissed).toBe(true)
    s = recordOutcome(s, film(2), 'watch', true)
    expect(s.holdover?.tmdbId).toBe(1)
    expect(s.night.holdoverDismissed).toBe(true)
    s = recordOutcome(s, film(3), 'tooLong', false)
    expect(s.holdover?.tmdbId).toBe(3)
    expect(s.night.holdoverDismissed).toBe(false)
    expect(setHoldoverDismissed(s, true).night.holdoverDismissed).toBe(true)
  })
})

describe('setViewersHidden', () => {
  test('defaults to false, toggles, and touches only the setting', () => {
    expect(defaultState.settings.viewersHidden).toBe(false)
    const s = setToken(addViewer(defaultState, 'Ann', 'a'), 'tok')
    const hidden = setViewersHidden(s, true)
    expect(hidden.settings).toEqual({
      tmdbToken: 'tok',
      viewersHidden: true,
      wheel: defaultWheelSettings,
    })
    expect(hidden.roster).toBe(s.roster)
    expect(hidden.night).toBe(s.night)
    expect(hidden.holdover).toBe(s.holdover)
    expect(setViewersHidden(hidden, false).settings.viewersHidden).toBe(false)
  })
})
