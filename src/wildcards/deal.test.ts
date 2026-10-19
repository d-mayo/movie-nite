import { describe, expect, it } from 'vitest'
import type { DealContext } from './cards.ts'
import { dealCards } from './deal.ts'
import { seeded } from './seeded.ts'

const context: DealContext = {
  viewers: ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), slices: 3, weight: 5 })),
  wildcardCount: 3,
}

describe('dealCards', () => {
  it('deals eight rolled cards with weights from 1 to 5', () => {
    const dealt = dealCards(context, seeded(11))
    expect(dealt).toHaveLength(8)
    for (const card of dealt) {
      expect(Number.isInteger(card.weight)).toBe(true)
      expect(card.weight).toBeGreaterThanOrEqual(1)
      expect(card.weight).toBeLessThanOrEqual(5)
      expect(card.label).toBeTruthy()
      expect(card.title).toBeTruthy()
      expect(card.text).toBeTruthy()
      expect(card.fff).toBe(false)
      expect(card.effect.label).toBe(card.label)
      const { change } = card.effect
      if (change.kind === 'wildcards') {
        expect(change.amount).toBeGreaterThanOrEqual(1)
        expect(change.amount).toBeLessThanOrEqual(3)
      } else {
        expect(change.viewerIds.every((id) => ['a', 'b', 'c'].includes(id))).toBe(true)
      }
    }
  })

  it('gives the same deal for the same seed', () => {
    expect(dealCards(context, seeded(5))).toEqual(dealCards(context, seeded(5)))
  })

  it('never deals a card the limits forbid', () => {
    const tight: DealContext = {
      viewers: [{ id: 'a', name: 'A', slices: 12, weight: 0.5 }],
      wildcardCount: 12,
    }
    for (let seed = 1; seed < 40; seed++) {
      for (const card of dealCards(tight, seeded(seed))) {
        const { change } = card.effect
        expect(change.kind).not.toBe('wildcards')
        if (change.kind === 'slices') expect(change.amount).toBeLessThan(0)
        if (change.kind === 'weight') expect(change.amount).toBeGreaterThan(0)
      }
    }
  })

  it('deals none when no card is eligible', () => {
    expect(dealCards({ viewers: [], wildcardCount: 12 }, seeded(1))).toEqual([])
  })
})
