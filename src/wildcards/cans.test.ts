import { describe, expect, it } from 'vitest'
import type { Nomination } from '../state/model.ts'
import {
  finishTake,
  hasCans,
  newCans,
  openChoice,
  phaseOf,
  pickCan,
  settleTick,
  takeFilm,
  tickDelayMs,
  tickPath,
} from './cans.ts'
import { seeded } from './seeded.ts'

const film = (tmdbId: number): Nomination => ({
  tmdbId,
  title: `Film ${tmdbId}`,
  year: 2000,
  posterPath: null,
  overview: '',
  runtime: 100,
  genres: [],
})
const three = () => newCans([film(1), film(2), film(3)])

describe('three cans', () => {
  it('opens the picked can, then ticks to exactly one other, chosen by random', () => {
    const seen = new Set<number>()
    for (const r of [0, 0.99]) {
      const picked = pickCan(three(), 1, () => r)
      expect(picked.picked).toBe(1)
      expect(picked.opened).toEqual([1])
      expect(phaseOf(picked)).toBe('ticking')
      const settled = settleTick(picked)
      expect(settled.opened).toHaveLength(2)
      expect(phaseOf(settled)).toBe('choosing')
      seen.add(settled.opened[1])
    }
    expect(seen).toEqual(new Set([0, 2]))
  })

  it('takes an open film, or the sealed one, which opens first, then finishes the take', () => {
    const settled = settleTick(pickCan(three(), 0, () => 0)) // opens 0 and 1; 2 stays sealed
    const open = takeFilm(settled, 1)
    expect(phaseOf(open)).toBe('closing')
    expect(finishTake(open).taken?.tmdbId).toBe(2)
    const sealed = takeFilm(settled, 2)
    expect(phaseOf(sealed)).toBe('opening')
    expect(sealed.taken).toBeNull()
    const opened = openChoice(sealed)
    expect(opened.opened).toEqual([0, 1, 2])
    expect(phaseOf(opened)).toBe('closing')
    const done = finishTake(opened)
    expect(done.taken?.tmdbId).toBe(3)
    expect(phaseOf(done)).toBe('taken')
  })

  it('refuses a second pick, a take before the arrow lands, a second take and a can that is not there', () => {
    const cans = three()
    expect(takeFilm(cans, 0)).toBe(cans)
    const picked = pickCan(cans, 0, () => 0)
    expect(takeFilm(picked, 1)).toBe(picked)
    expect(pickCan(picked, 2, () => 0)).toBe(picked)
    expect(pickCan(cans, 5, () => 0)).toBe(cans)
    const settled = settleTick(picked)
    expect(takeFilm(settled, 9)).toBe(settled)
    const chosen = takeFilm(settled, 1)
    expect(takeFilm(chosen, 0)).toBe(chosen)
    expect(openChoice(chosen)).toBe(chosen)
    expect(finishTake(settled)).toBe(settled)
    expect(settleTick(settled)).toBe(settled)
  })

  it('ticks the arrow between the two other cans and ends on the one that opens', () => {
    for (let seed = 1; seed < 40; seed++) {
      const random = seeded(seed)
      const picked = pickCan(three(), seed % 3, random)
      const path = tickPath(picked, random)
      expect(path.length).toBeGreaterThanOrEqual(7)
      expect(path.length).toBeLessThanOrEqual(9)
      expect(path.at(-1)).toBe(picked.second)
      expect(path.every((c) => c !== picked.picked)).toBe(true)
      path.slice(1).forEach((c, i) => expect(c).not.toBe(path[i]))
    }
    expect(tickPath(three(), () => 0)).toEqual([])
  })

  it('slows the ticks as the arrow settles', () => {
    const delays = Array.from({ length: 8 }, (_, i) => tickDelayMs(i, 8))
    expect(delays).toEqual([...delays].sort((a, b) => a - b))
    expect(delays[0]).toBeLessThan(delays[7])
  })
})

describe('two cans', () => {
  it('chooses the picked film at once, and takes it once it is seen open', () => {
    const cans = pickCan(newCans([film(1), film(2)]), 1, () => 0)
    expect(cans.opened).toEqual([1])
    expect(phaseOf(cans)).toBe('closing')
    expect(finishTake(cans).taken?.tmdbId).toBe(2)
    expect(pickCan(cans, 0, () => 0)).toBe(cans)
  })

  it('has no separate take', () => {
    const cans = newCans([film(1), film(2)])
    expect(takeFilm(cans, 0)).toBe(cans)
  })
})

describe('one film', () => {
  it('has no cans and is taken outright', () => {
    const cans = newCans([film(7)])
    expect(hasCans(cans)).toBe(false)
    expect(pickCan(cans, 0, () => 0)).toBe(cans)
    expect(takeFilm(cans, 0).taken?.tmdbId).toBe(7)
    expect(takeFilm(cans, 1)).toBe(cans)
  })
})
