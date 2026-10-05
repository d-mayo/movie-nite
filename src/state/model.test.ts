import { describe, expect, test } from 'vitest'
import {
  addViewer,
  defaultState,
  newNight,
  nominate,
  removeViewer,
  setPresent,
  setToken,
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
  test('clears nominations, keeps roster, token and ticks', () => {
    let s = setToken(defaultState, 'tok')
    s = addViewer(s, 'Ann', 'a')
    s = nominate(s, 'a', film(1))
    s = newNight(s)
    expect(s.night.nominations).toEqual({})
    expect(s.night.presentIds).toEqual(['a'])
    expect(s.roster).toHaveLength(1)
    expect(s.settings.tmdbToken).toBe('tok')
  })
})
