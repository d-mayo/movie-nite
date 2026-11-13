// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { activeSeason, seasonById, seasonOf, seasons } from './seasons.ts'

const d = (month: number, day: number) => new Date(2026, month - 1, day, 12)

describe('seasonOf', () => {
  it('gives each season on its first and last day', () => {
    expect(seasonOf(d(10, 1))).toBe('halloween')
    expect(seasonOf(d(10, 31))).toBe('halloween')
    expect(seasonOf(d(12, 1))).toBe('christmas')
    expect(seasonOf(d(12, 25))).toBe('christmas')
    expect(seasonOf(d(2, 1))).toBe('valentines')
    expect(seasonOf(d(2, 14))).toBe('valentines')
  })

  it('gives null the day before and after each window and mid-year', () => {
    for (const [m, day] of [[9, 30], [11, 1], [11, 30], [12, 26], [1, 31], [2, 15], [6, 15]]) {
      expect(seasonOf(d(m, day))).toBeNull()
    }
  })

  it('names each season', () => {
    expect(seasonById('halloween').name).toBe('Halloween')
    expect(seasonById('christmas').name).toBe('Christmas')
    expect(seasonById('valentines').name).toBe("Valentine's Day")
    expect(seasons).toHaveLength(3)
  })
})

describe('activeSeason', () => {
  it('gives the forced season whatever the switch and date', () => {
    expect(activeSeason({ forced: 'halloween', enabled: false, date: d(12, 10) })).toBe('halloween')
    expect(activeSeason({ forced: 'christmas', enabled: true, date: d(11, 7) })).toBe('christmas')
  })
  it('gives null for forced None whatever they say', () => {
    expect(activeSeason({ forced: null, enabled: true, date: d(12, 10) })).toBeNull()
  })
  it('gives null with the switch off and no force', () => {
    expect(activeSeason({ forced: undefined, enabled: false, date: d(12, 10) })).toBeNull()
  })
  it('gives the date season otherwise', () => {
    expect(activeSeason({ forced: undefined, enabled: true, date: d(12, 10) })).toBe('christmas')
    expect(activeSeason({ forced: undefined, enabled: true, date: d(11, 7) })).toBeNull()
  })
})
