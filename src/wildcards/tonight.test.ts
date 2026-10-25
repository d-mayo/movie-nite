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

const picks: CardEffect = {
  cardId: 'picks-again',
  label: 'Sam picks again',
  change: { kind: 'picksAgain', viewerIds: ['s'], tmdbId: 1 },
}
const reshuffle: CardEffect = {
  cardId: 'reshuffle',
  label: 'Reshuffle Sam',
  change: { kind: 'reshuffle', viewerIds: ['s'], tmdbId: 2 },
}
const blind = (used: boolean): CardEffect => ({
  cardId: 'blind-spin',
  label: 'Blind spin',
  change: { kind: 'blindSpin', used },
})

describe('the Picks Again, Reshuffle and Blind Spin cards', () => {
  it('keeps a viewer card while its viewer is on the roster, and Blind Spin all night', () => {
    const all = [picks, reshuffle, blind(false), blind(true)]
    expect(chipEffects(all, ['s'])).toEqual(all)
    expect(chipEffects(all, [])).toEqual([blind(false), blind(true)])
  })

  it('lists Picks Again and Reshuffle for their viewer, never Blind Spin', () => {
    expect(viewerCardLabels([picks, reshuffle, blind(false)], 's')).toEqual([
      'Sam picks again',
      'Reshuffle Sam',
    ])
    expect(viewerCardLabels([picks, reshuffle, blind(false)], 'j')).toEqual([])
  })
})

const movie: CardEffect = { cardId: 'genre-night', label: 'Horror night', change: { kind: 'movie' } }

describe('the movie cards', () => {
  it('never shows a movie card as a chip or lists it for a viewer', () => {
    expect(chipEffects([movie, wildcards], ['s'])).toEqual([wildcards])
    expect(viewerCardLabels([movie, picks], 's')).toEqual(['Sam picks again'])
  })
})

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

describe('the wildcard-spins card', () => {
  const spins: CardEffect = { cardId: 'wildcard-spins', label: '3× wildcard spins', change: { kind: 'spins', count: 3 } }

  it('is never a chip or a cell icon', () => {
    expect(chipEffects([spins, weight('Sam +2 weight', 's')], ['s'])).toEqual([weight('Sam +2 weight', 's')])
    expect(viewerCardLabels([spins], 's')).toEqual([])
  })
})
