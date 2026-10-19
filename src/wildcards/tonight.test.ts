import { describe, expect, it } from 'vitest'
import type { CardEffect } from './cards.ts'
import { chipEffects, viewerCardLabels } from './tonight.ts'

const weight = (label: string, ...viewerIds: string[]): CardEffect => ({
  cardId: 'x-weight',
  label,
  change: { kind: 'weight', amount: 2, viewerIds },
})
const wildcards: CardEffect = {
  cardId: 'wildcards',
  label: '+1 wildcard',
  change: { kind: 'wildcards', amount: 1 },
}

describe('chipEffects', () => {
  it('keeps landing order and two equal labels as two entries', () => {
    const a = weight('Sam +2 weight', 's')
    const b = weight('Sam +2 weight', 's')
    expect(chipEffects([a, wildcards, b], ['s'])).toEqual([a, wildcards, b])
  })

  it('drops a card whose named viewers are all off the roster', () => {
    const gone = weight('Jo +1 weight', 'j')
    const some = weight('Everyone +1 weight', 'j', 's')
    expect(chipEffects([gone, some], ['s'])).toEqual([some])
  })

  it('always keeps a wildcards card and returns none when all are removed', () => {
    expect(chipEffects([weight('Jo +1 weight', 'j'), wildcards], [])).toEqual([wildcards])
    expect(chipEffects([weight('Jo +1 weight', 'j')], ['s'])).toEqual([])
  })
})

describe('viewerCardLabels', () => {
  it('lists the labels naming the viewer in order, ignoring wildcards', () => {
    const effects = [
      weight('Sam +2 weight', 's'),
      wildcards,
      weight('Everyone −1 slices', 's', 'j'),
      weight('Jo +1 weight', 'j'),
    ]
    expect(viewerCardLabels(effects, 's')).toEqual(['Sam +2 weight', 'Everyone −1 slices'])
    expect(viewerCardLabels(effects, 'z')).toEqual([])
  })
})
