import { describe, expect, test } from 'vitest'
import {
  addViewer,
  clearHoldover,
  endNight,
  defaultState,
  addWheelWildcard,
  moveWheelSlice,
  newNight,
  nominate,
  recordOutcome,
  removeNomination,
  removeViewer,
  resetLayout,
  setPresent,
  setToken,
  setViewerSliceCount,
  setViewerWeightOnWheel,
  spreadWheelEvenly,
  viewersOnWheel,
  type Nomination,
  setViewerColor,
  maxViewers,
} from './model.ts'
import { presetColors } from '../wheel/colors.ts'

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
  test('clears won films, watched, ended and the holdover; keeps leftovers, roster, ticks, token', () => {
    let s = nominate(addViewer(setToken(three(), 'tok'), 'Di', 'd'), 'd', film(3))
    s = recordOutcome(s, film(1), 'tooLong', true)
    s = endNight(recordOutcome(s, film(2), 'watch', true))
    s = newNight(s)
    expect(Object.keys(s.night.nominations)).toEqual(['d'])
    expect(s.night.wonFilms).toEqual([])
    expect(s.night.watched).toEqual([])
    expect(s.night.ended).toBe(false)
    expect(s.night.presentIds).toEqual(['a', 'b', 'c', 'd'])
    expect(s.holdover).toBeNull()
    expect(s.settings.tmdbToken).toBe('tok')
  })
})

describe('an edited wheel', () => {
  const kinds = (s: typeof defaultState) =>
    s.night.layout!.order.map((r) => (r.kind === 'wildcard' ? 'W' : r.viewerId))
  const count = (s: typeof defaultState, id: string) => kinds(s).filter((x) => x === id).length

  function edited(handPlaced = false) {
    let s = addViewer(defaultState, 'Ann', 'a')
    s = addViewer(s, 'Bo', 'b')
    s = addViewer(s, 'Cy', 'c')
    s = nominate(s, 'a', film(1))
    s = nominate(s, 'b', film(2))
    s = nominate(s, 'c', film(3))
    s = setViewerWeightOnWheel(s, 'b', 8)
    return handPlaced ? moveWheelSlice(s, 0, 1) : s
  }

  test('the first edit saves the layout; an invalid edit leaves the wheel derived', () => {
    expect(setViewerWeightOnWheel(defaultState, 'a', 0)).toBe(defaultState)
    const s = addViewer(defaultState, 'Ann', 'a')
    expect(setViewerWeightOnWheel(s, 'a', 100)).toBe(s)
    expect(edited().night.layout?.viewers.b.weight).toBe(8)
  })

  test('a win on an auto-spread wheel removes the winner and a wildcard and re-spreads', () => {
    const s = recordOutcome(edited(), film(1), 'watch', true)
    expect(count(s, 'a')).toBe(0)
    expect(kinds(s)).toHaveLength(8)
    expect(s.night.layout!.wildcards).toHaveLength(2)
    expect(s.night.layout!.viewers.b.weight).toBe(8)
  })

  test('a win on a hand-placed wheel keeps the remaining order', () => {
    const start = edited(true)
    const s = recordOutcome(start, film(1), 'tooLong', true)
    const expected = start.night
      .layout!.order.filter((r) => r.kind === 'wildcard' || r.viewerId !== 'a')
      .map((r) => r.id)
    const got = s.night.layout!.order.map((r) => r.id)
    expect(expected.filter((id) => got.includes(id))).toEqual(got)
  })

  test('duplicates remove both viewers and two wildcards; fromWheel false changes nothing', () => {
    let s = edited()
    s = nominate(s, 'b', film(1))
    const out = recordOutcome(s, film(1), 'watch', true)
    expect(count(out, 'a') + count(out, 'b')).toBe(0)
    expect(out.night.layout!.wildcards).toHaveLength(1)
    const unchanged = recordOutcome(edited(), film(9), 'watch', false)
    expect(unchanged.night.layout).toEqual(edited().night.layout)
  })

  test('unticking removes the viewer and a wildcard; re-ticking restores their settings', () => {
    const off = setPresent(edited(), 'b', false)
    expect(count(off, 'b')).toBe(0)
    expect(off.night.layout!.wildcards).toHaveLength(2)
    const on = setPresent(setViewerSliceCount(setPresent(edited(), 'b', true), 'b', 4), 'b', false)
    const back = setPresent(on, 'b', true)
    expect(count(back, 'b')).toBe(4)
    expect(back.night.layout!.viewers.b).toEqual({ weight: 8, slices: 4 })
  })

  test('removeViewer drops the entry; addViewer adds a joiner', () => {
    const gone = removeViewer(edited(), 'b')
    expect(gone.night.layout!.viewers.b).toBeUndefined()
    expect(count(gone, 'b')).toBe(0)
    const joined = addViewer(edited(), 'Di', 'd')
    expect(count(joined, 'd')).toBe(3)
    expect(joined.night.layout!.wildcards).toHaveLength(4)
  })

  test('nominating changes nothing on the wheel', () => {
    const s = edited()
    expect(nominate(s, 'a', film(7)).night.layout).toBe(s.night.layout)
  })

  test('unticking everyone empties the wheel; re-ticking one brings back kept settings', () => {
    let s = addWheelWildcard(edited())
    for (const id of ['a', 'b', 'c']) s = setPresent(s, id, false)
    expect(s.night.layout!.order).toEqual([])
    expect(s.night.layout!.wildcards).toEqual([])
    s = setPresent(s, 'b', true)
    expect(count(s, 'b')).toBe(3)
    expect(s.night.layout!.wildcards).toHaveLength(1)
    expect(s.night.layout!.viewers.b.weight).toBe(8)
  })

  test('reset returns to the derived wheel without won viewers; new night too', () => {
    let s = recordOutcome(edited(), film(1), 'watch', true)
    expect(resetLayout(s).night.layout).toBeNull()
    expect(newNight(s).night.layout).toBeNull()
    s = resetLayout(s)
    expect(viewersOnWheel(s.night)).toEqual(['b', 'c'])
  })

  test('spread evenly keeps the order hand-placed', () => {
    const s = spreadWheelEvenly(edited(true))
    expect(s.night.layout!.handPlaced).toBe(true)
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
