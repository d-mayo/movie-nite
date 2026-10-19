import { describe, expect, it } from 'vitest'
import type { DealContext } from './cards.ts'
import { canDeal, dealCards } from './deal.ts'
import { seeded } from './seeded.ts'

// A March day: no seasonal card is eligible.
const today = new Date(2026, 2, 15)

const context: DealContext = {
  viewers: ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), slices: 3, weight: 5, film: null, canReshuffle: false, canBacklog: false })),
  wildcardCount: 3, today, commonGround: false,
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
      } else if (change.kind !== 'blindSpin' && change.kind !== 'movie') {
        expect(change.viewerIds.every((id) => ['a', 'b', 'c'].includes(id))).toBe(true)
      }
    }
  })

  it('gives the same deal for the same seed', () => {
    expect(dealCards(context, seeded(5))).toEqual(dealCards(context, seeded(5)))
  })

  it('never deals a card the limits forbid', () => {
    const tight: DealContext = {
      viewers: [{ id: 'a', name: 'A', slices: 12, weight: 0.5, film: null, canReshuffle: false, canBacklog: false }],
      wildcardCount: 12, today, commonGround: false,
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

  it('still deals, only Blind Spin and the movie cards, when no wheel card is eligible', () => {
    const dealt = dealCards({ viewers: [], wildcardCount: 12, today, commonGround: false }, seeded(1))
    expect(dealt.length).toBeGreaterThan(0)
    expect(dealt.every((c) => c.type === 'movie' || c.cardId === 'blind-spin')).toBe(true)
  })

  it('always deals the seasonal card while it is eligible, and never one out of season', () => {
    const on = (month: number, day: number): DealContext => ({ viewers: [], wildcardCount: 12, today: new Date(2026, month - 1, day), commonGround: false })
    const dealtIds = (context: DealContext, seed: number) => dealCards(context, seeded(seed)).map((c) => c.cardId)
    for (let seed = 1; seed < 200; seed++) {
      expect(dealtIds(on(10, 31), seed)).toContain('halloween')
      expect(dealtIds(on(12, 25), seed)).toContain('christmas')
      expect(dealtIds(on(2, 1), seed)).toContain('romance')
      expect(dealtIds(on(8, 31), seed)).toContain('creature-feature')
      expect(dealtIds(on(10, 31), seed)).toHaveLength(8)
      expect(dealtIds(on(3, 15), seed)).not.toContain('halloween')
    }
  })

  it('deals every non-seasonal movie card and only the seasonal card of the month', () => {
    const october: DealContext = { viewers: [], wildcardCount: 12, today: new Date(2026, 9, 15), commonGround: false }
    const ids = new Set<string>()
    for (let seed = 1; seed < 300; seed++) for (const c of dealCards(october, seeded(seed))) ids.add(c.cardId)
    for (const id of ['genre-night', 'halloween', 'critics-darlings', 'so-bad-its-good', 'decade-roulette', 'world-cinema']) {
      expect(ids.has(id)).toBe(true)
    }
    for (const id of ['christmas', 'romance', 'creature-feature', 'shortest-on-the-board']) {
      expect(ids.has(id)).toBe(false)
    }
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
      canReshuffle: true, canBacklog: false,
    })),
    wildcardCount: 3, today, commonGround: false,
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
    expect(canDeal({ viewers: [], wildcardCount: 12, today, commonGround: false })).toBe(true)
  })

  it('deals the Letterboxd cards when marked eligible and not otherwise', () => {
    const open: DealContext = {
      ...context,
      viewers: context.viewers.map((v) => ({ ...v, canBacklog: true })),
      commonGround: true,
    }
    const seen = new Set<string>()
    for (let seed = 1; seed < 80; seed++) {
      for (const card of dealCards(open, seeded(seed))) seen.add(card.cardId)
      for (const card of dealCards(context, seeded(seed))) {
        expect(['backlog', 'common-ground']).not.toContain(card.cardId)
      }
    }
    expect(seen.has('backlog')).toBe(true)
    expect(seen.has('common-ground')).toBe(true)
  })
})
