import { describe, expect, it } from 'vitest'
import type { DealContext } from './cards.ts'
import { canDeal, dealCards } from './deal.ts'
import { seeded } from './seeded.ts'

const context: DealContext = {
  viewers: ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), slices: 3, weight: 5, film: null, canReshuffle: false })),
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
      } else if (change.kind !== 'blindSpin') {
        expect(change.viewerIds.every((id) => ['a', 'b', 'c'].includes(id))).toBe(true)
      }
    }
  })

  it('gives the same deal for the same seed', () => {
    expect(dealCards(context, seeded(5))).toEqual(dealCards(context, seeded(5)))
  })

  it('never deals a card the limits forbid', () => {
    const tight: DealContext = {
      viewers: [{ id: 'a', name: 'A', slices: 12, weight: 0.5, film: null, canReshuffle: false }],
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

  it('still deals, only Blind Spin, when nothing else is eligible', () => {
    const dealt = dealCards({ viewers: [], wildcardCount: 12 }, seeded(1))
    expect(dealt.length).toBeGreaterThan(0)
    expect(dealt.every((c) => c.cardId === 'blind-spin')).toBe(true)
  })
})

describe('dealing the new cards', () => {
  const rich: DealContext = {
    viewers: ['a', 'b', 'c'].map((id, i) => ({
      id,
      name: id.toUpperCase(),
      slices: 3,
      weight: 5,
      film: { tmdbId: i + 1, title: `Film ${i + 1}` },
      canReshuffle: true,
    })),
    wildcardCount: 3,
  }

  it('all three come up over many deals', () => {
    const ids = new Set<string>()
    for (let seed = 1; seed < 30; seed++) {
      for (const card of dealCards(rich, seeded(seed))) ids.add(card.cardId)
    }
    expect(ids.has('picks-again')).toBe(true)
    expect(ids.has('reshuffle')).toBe(true)
    expect(ids.has('blind-spin')).toBe(true)
  })

  it('never deals Reshuffle when no viewer can be reshuffled, and still deals with no viewers', () => {
    const none: DealContext = {
      ...rich,
      viewers: rich.viewers.map((v) => ({ ...v, canReshuffle: false })),
    }
    for (let seed = 1; seed < 30; seed++) {
      expect(dealCards(none, seeded(seed)).some((c) => c.cardId === 'reshuffle')).toBe(false)
    }
    expect(canDeal({ viewers: [], wildcardCount: 12 })).toBe(true)
  })
})
