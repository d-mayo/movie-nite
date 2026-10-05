import { describe, expect, test } from 'vitest'
import {
  addViewer,
  clearHoldover,
  endNight,
  defaultState,
  newNight,
  nominate,
  recordOutcome,
  removeViewer,
  setPresent,
  setToken,
  viewersOnWheel,
  type Nomination,
} from './model.ts'

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
    expect(s.roster).toEqual([{ id: 'a', name: 'Ann' }])
    expect(s.night.presentIds).toEqual(['a'])
  })

  test('rejects empty and case-insensitive duplicate names', () => {
    const s = addViewer(defaultState, 'Ann', 'a')
    expect(addViewer(s, '   ', 'b')).toBe(s)
    expect(addViewer(s, ' ANN', 'b')).toBe(s)
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
  test('unticking drops the nomination, ticking again does not restore it', () => {
    let s = addViewer(defaultState, 'Ann', 'a')
    s = nominate(s, 'a', film(1))
    s = setPresent(s, 'a', false)
    expect(s.night.presentIds).toEqual([])
    expect(s.night.nominations).toEqual({})
    s = setPresent(s, 'a', true)
    expect(s.night.presentIds).toEqual(['a'])
    expect(s.night.nominations).toEqual({})
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
