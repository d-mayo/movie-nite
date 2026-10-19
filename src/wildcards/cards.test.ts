import { describe, expect, it } from 'vitest'
import { seeded } from './seeded.ts'
import { cards, validCardEffects, type DealContext, type DealViewer } from './cards.ts'

const viewer = (id: string, slices = 3, weight = 5): DealViewer => ({
  id,
  name: id.toUpperCase(),
  slices,
  weight,
  film: null,
  canReshuffle: false,
})

const byId = (id: string) => cards.find((c) => c.id === id)!

describe('the wheel cards', () => {
  it('has the eight cards, none flagged FFF', () => {
    expect(cards.map((c) => c.id)).toEqual([
      'viewer-weight',
      'viewer-slices',
      'everyone-weight',
      'everyone-slices',
      'wildcards',
      'picks-again',
      'reshuffle',
      'blind-spin',
    ])
    expect(cards.every((c) => c.type === 'wheel' && !c.fff)).toBe(true)
  })

  it('rolls a weight card with its label, title, text and effect', () => {
    const context: DealContext = { viewers: [viewer('sam')], wildcardCount: 3 }
    for (let seed = 1; seed < 40; seed++) {
      const rolled = byId('viewer-weight').roll(context, seeded(seed))
      const { change } = rolled.effect
      expect(change.kind).toBe('weight')
      if (change.kind !== 'weight') continue
      expect(Math.abs(change.amount)).toBeGreaterThanOrEqual(1)
      expect(Math.abs(change.amount)).toBeLessThanOrEqual(3)
      expect(change.viewerIds).toEqual(['sam'])
      const sign = change.amount > 0 ? '+' : '−'
      expect(rolled.label).toBe(`SAM ${sign}${Math.abs(change.amount)} weight`)
      expect(rolled.title).toBe(`SAM ${sign}${Math.abs(change.amount)} Weight`)
      expect(rolled.text).toBe(
        `SAM's weight goes from 5 to ${5 + change.amount} for the rest of the night.`,
      )
      expect(rolled.effect.label).toBe(rolled.label)
    }
  })

  it('rolls plus and minus in roughly equal numbers when both are allowed', () => {
    const context: DealContext = { viewers: [viewer('sam')], wildcardCount: 3 }
    const random = seeded(7)
    let plus = 0
    for (let i = 0; i < 400; i++) {
      const change = byId('viewer-slices').roll(context, random).effect.change
      if (change.kind === 'slices' && change.amount > 0) plus++
    }
    expect(plus).toBeGreaterThan(150)
    expect(plus).toBeLessThan(250)
  })

  it('names every viewer on the wheel in an Everyone card', () => {
    const context: DealContext = { viewers: [viewer('a'), viewer('b')], wildcardCount: 2 }
    const rolled = byId('everyone-slices').roll(context, seeded(3))
    expect(rolled.title).toMatch(/^Everyone [+−]\d Slices$/)
    expect(rolled.effect.change).toMatchObject({ kind: 'slices', viewerIds: ['a', 'b'] })
  })

  it('rolls a wildcards card trimmed to stay at 12', () => {
    const context: DealContext = { viewers: [viewer('a')], wildcardCount: 11 }
    for (let seed = 1; seed < 20; seed++) {
      const rolled = byId('wildcards').roll(context, seeded(seed))
      expect(rolled.effect.change).toEqual({ kind: 'wildcards', amount: 1 })
      expect(rolled.label).toBe('+1 wildcard')
    }
  })

  it('is never eligible beyond the limits', () => {
    // Weight 0.5 can't go down by 1, but can go up.
    const low: DealContext = { viewers: [viewer('a', 3, 0.5)], wildcardCount: 3 }
    for (let seed = 1; seed < 30; seed++) {
      const change = byId('viewer-weight').roll(low, seeded(seed)).effect.change
      expect(change.kind === 'weight' && change.amount > 0).toBe(true)
    }
    // At 12 slices a plus can't be rolled.
    const high: DealContext = { viewers: [viewer('a', 12, 5)], wildcardCount: 3 }
    for (let seed = 1; seed < 30; seed++) {
      const change = byId('viewer-slices').roll(high, seeded(seed)).effect.change
      expect(change.kind === 'slices' && change.amount < 0).toBe(true)
    }
  })

  it('is ineligible with no allowed roll', () => {
    expect(byId('wildcards').eligible({ viewers: [viewer('a')], wildcardCount: 12 })).toBe(false)
    expect(byId('everyone-weight').eligible({ viewers: [], wildcardCount: 0 })).toBe(false)
    // One viewer at each end of the weight range: no sign suits both.
    const split: DealContext = {
      viewers: [viewer('a', 3, 0.5), viewer('b', 3, 20)],
      wildcardCount: 3,
    }
    expect(byId('everyone-weight').eligible(split)).toBe(false)
    expect(byId('viewer-weight').eligible(split)).toBe(true)
  })

  it('keeps an Everyone card within the limits for all of them', () => {
    const context: DealContext = {
      viewers: [viewer('a', 3, 19), viewer('b', 3, 2)],
      wildcardCount: 3,
    }
    for (let seed = 1; seed < 30; seed++) {
      const change = byId('everyone-weight').roll(context, seeded(seed)).effect.change
      expect(change.kind === 'weight' && Math.abs(change.amount)).toBe(1)
    }
  })
})

describe('validCardEffects for the new kinds', () => {
  const ok = [
    { cardId: 'picks-again', label: 'a', change: { kind: 'picksAgain', viewerIds: ['s'], tmdbId: 5 } },
    { cardId: 'reshuffle', label: 'b', change: { kind: 'reshuffle', viewerIds: ['s'], tmdbId: 6 } },
    { cardId: 'blind-spin', label: 'c', change: { kind: 'blindSpin', used: false } },
  ]

  it('keeps well-formed effects', () => {
    expect(validCardEffects(ok)).toEqual(ok)
  })

  it('drops a missing film id, a bad viewer list or a non-boolean used', () => {
    const bad = [
      { cardId: 'p', label: 'a', change: { kind: 'picksAgain', viewerIds: ['s'] } },
      { cardId: 'p', label: 'a', change: { kind: 'picksAgain', viewerIds: [], tmdbId: 1 } },
      { cardId: 'r', label: 'a', change: { kind: 'reshuffle', viewerIds: ['s', 't'], tmdbId: 1 } },
      { cardId: 'r', label: 'a', change: { kind: 'reshuffle', viewerIds: ['s'], tmdbId: 1.5 } },
      { cardId: 'b', label: 'a', change: { kind: 'blindSpin', used: 'no' } },
      { cardId: 'b', label: 'a', change: { kind: 'blindSpin' } },
    ]
    expect(validCardEffects([...bad, ...ok])).toEqual(ok)
  })
})

describe('Picks Again, Reshuffle and Blind Spin', () => {
  const withFilm = (id: string, tmdbId: number): DealViewer => ({
    ...viewer(id),
    film: { tmdbId, title: `Film ${tmdbId}` },
  })
  const reshufflable = (id: string): DealViewer => ({ ...viewer(id), canReshuffle: true })

  it('Picks Again is eligible only with a nominated film, and names that viewer and film', () => {
    const none: DealContext = { viewers: [viewer('a')], wildcardCount: 3 }
    expect(byId('picks-again').eligible(none)).toBe(false)
    const context: DealContext = { viewers: [viewer('a'), withFilm('b', 7)], wildcardCount: 3 }
    expect(byId('picks-again').eligible(context)).toBe(true)
    const rolled = byId('picks-again').roll(context, seeded(3))
    expect(rolled.label).toBe('B picks again')
    expect(rolled.title).toBe('B Picks Again')
    expect(rolled.text).toBe('Film 7 comes off the wheel, and B picks a different film.')
    expect(rolled.effect).toEqual({
      cardId: 'picks-again',
      label: 'B picks again',
      change: { kind: 'picksAgain', viewerIds: ['b'], tmdbId: 7 },
    })
  })

  it('Reshuffle is dealt only for a viewer marked reshufflable', () => {
    const none: DealContext = { viewers: [viewer('a'), withFilm('b', 7)], wildcardCount: 3 }
    expect(byId('reshuffle').eligible(none)).toBe(false)
    const context: DealContext = { viewers: [viewer('a'), reshufflable('b')], wildcardCount: 3 }
    expect(byId('reshuffle').eligible(context)).toBe(true)
    for (let seed = 1; seed < 20; seed++) {
      const rolled = byId('reshuffle').roll(context, seeded(seed))
      expect(rolled.label).toBe('Reshuffle B')
      expect(rolled.title).toBe('Reshuffle B')
      expect(rolled.effect.change).toMatchObject({ kind: 'reshuffle', viewerIds: ['b'] })
    }
  })

  it('Blind Spin is always eligible, even after earlier ones', () => {
    const context: DealContext = { viewers: [], wildcardCount: 12 }
    expect(byId('blind-spin').eligible(context)).toBe(true)
    const rolled = byId('blind-spin').roll(context, seeded(1))
    expect(rolled.label).toBe('Blind spin')
    expect(rolled.title).toBe('Blind Spin')
    expect(rolled.text).toBe('The next spin hides the names, titles and posters until it lands.')
    expect(rolled.effect.change).toEqual({ kind: 'blindSpin', used: false })
  })
})
