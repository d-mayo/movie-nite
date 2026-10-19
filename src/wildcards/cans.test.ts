import { describe, expect, it } from 'vitest'
import type { Nomination } from '../state/model.ts'
import { canTake, hasCans, newCans, pickCan, takeFilm } from './cans.ts'

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
  it('opens the picked can and exactly one other, chosen by random', () => {
    const seen = new Set<number>()
    for (const r of [0, 0.99]) {
      const cans = pickCan(three(), 1, () => r)
      expect(cans.picked).toBe(1)
      expect(cans.opened).toHaveLength(2)
      expect(cans.opened[0]).toBe(1)
      expect(cans.taken).toBeNull()
      seen.add(cans.opened[1])
    }
    expect(seen).toEqual(new Set([0, 2]))
  })

  it('takes an open film or the sealed one, which then opens', () => {
    const picked = pickCan(three(), 0, () => 0) // opens 0 and 1; 2 stays sealed
    expect(picked.opened).toEqual([0, 1])
    expect(takeFilm(picked, 1).taken?.tmdbId).toBe(2)
    expect(takeFilm(picked, 0).taken?.tmdbId).toBe(1)
    const sealed = takeFilm(picked, 2)
    expect(sealed.taken?.tmdbId).toBe(3)
    expect(sealed.opened).toEqual([0, 1, 2])
  })

  it('refuses a second pick, a take before the pick, a second take and a can that is not there', () => {
    const cans = three()
    expect(takeFilm(cans, 0)).toBe(cans)
    expect(canTake(cans)).toBe(false)
    const picked = pickCan(cans, 0, () => 0)
    expect(canTake(picked)).toBe(true)
    expect(pickCan(picked, 2, () => 0)).toBe(picked)
    expect(pickCan(cans, 5, () => 0)).toBe(cans)
    const taken = takeFilm(picked, 1)
    expect(takeFilm(taken, 0)).toBe(taken)
    expect(canTake(taken)).toBe(false)
    expect(takeFilm(picked, 9)).toBe(picked)
  })
})

describe('two cans', () => {
  it('takes the picked film at once', () => {
    const cans = pickCan(newCans([film(1), film(2)]), 1, () => 0)
    expect(cans.opened).toEqual([1])
    expect(cans.taken?.tmdbId).toBe(2)
    expect(canTake(cans)).toBe(false)
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
