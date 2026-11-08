import { describe, expect, it } from 'vitest'
import { cards, type DealContext } from './cards.ts'
import { canDeal, dealCards, dealSubBoard, subBoardPool } from './deal.ts'
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
      } else if (change.kind !== 'blindSpin' && change.kind !== 'movie' && change.kind !== 'spins') {
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

describe('the FFF cards in a deal', () => {
  const fffIds = cards.filter((c) => c.fff).map((c) => c.id)
  const nonFff = cards.filter((c) => !c.fff)

  it('never deals them while locked, and deals what the registry without them would', () => {
    expect(fffIds).toHaveLength(2)
    for (let seed = 1; seed < 80; seed++) {
      const dealt = dealCards(context, seeded(seed))
      for (const id of fffIds) expect(dealt.map((c) => c.cardId)).not.toContain(id)
      // The locked deal is the same as one drawn over the non-FFF cards alone.
      const rebuilt: string[] = []
      const eligible = nonFff.filter((c) => c.eligible(context))
      expect(eligible.length).toBeGreaterThan(0)
      expect(dealt).toHaveLength(8)
      rebuilt.push(...dealt.map((c) => c.cardId))
      expect(dealCards(context, seeded(seed), [], false).map((c) => c.cardId)).toEqual(rebuilt)
    }
  })

  it('deals them once unlocked, but not a disabled one', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed < 120; seed++) for (const c of dealCards(context, seeded(seed), [], true)) seen.add(c.cardId)
    for (const id of fffIds) expect(seen).toContain(id)
    for (let seed = 1; seed < 60; seed++) {
      expect(dealCards(context, seeded(seed), ['play-rento'], true).map((c) => c.cardId)).not.toContain('play-rento')
    }
  })

  it('lets canDeal see only unlocked, switched-on FFF cards', () => {
    const others = nonFff.map((c) => c.id)
    expect(canDeal(context, others)).toBe(false)
    expect(canDeal(context, others, true)).toBe(true)
    expect(canDeal(context, [...others, ...fffIds], true)).toBe(false)
  })
})

describe('disabled cards', () => {
  it('never deals a disabled card', () => {
    const disabled = ['viewer-weight', 'blind-spin', 'genre-night']
    for (let seed = 1; seed < 60; seed++) {
      const ids = dealCards(context, seeded(seed), disabled).map((c) => c.cardId)
      expect(ids).toHaveLength(8)
      for (const id of disabled) expect(ids).not.toContain(id)
    }
  })

  it('gives no reserved slot to a disabled seasonal card in season', () => {
    const october: DealContext = { ...context, today: new Date(2026, 9, 15) }
    for (let seed = 1; seed < 60; seed++) {
      expect(dealCards(october, seeded(seed), ['halloween']).map((c) => c.cardId)).not.toContain('halloween')
    }
  })

  it('deals nothing, and cannot deal, when every eligible card is disabled', () => {
    const empty: DealContext = { viewers: [], wildcardCount: 12, today, commonGround: false }
    const eligibleIds = cards.filter((c) => c.eligible(empty)).map((c) => c.id)
    expect(eligibleIds).toContain('blind-spin')
    expect(canDeal(empty, eligibleIds)).toBe(false)
    expect(dealCards(empty, seeded(1), eligibleIds)).toEqual([])
    expect(canDeal(empty, eligibleIds.slice(1))).toBe(true)
  })

  it('deals the same with nothing disabled as without the argument', () => {
    expect(dealCards(context, seeded(5), [])).toEqual(dealCards(context, seeded(5)))
  })
})

describe('the wildcard-spins sub-board', () => {
  it('deals eight pool cards, none switched off, with no seasonal slot', () => {
    const october = { ...context, today: new Date(2026, 9, 15) }
    for (let seed = 1; seed < 40; seed++) {
      const dealt = dealSubBoard(october, seeded(seed), ['viewer-weight'])
      expect(dealt).toHaveLength(8)
      for (const card of dealt) {
        expect(subBoardPool).toContain(card.cardId)
        expect(card.cardId).not.toBe('viewer-weight')
      }
    }
  })

  it('deals nothing when no pool card is eligible', () => {
    const none: DealContext = { viewers: [], wildcardCount: 12, today, commonGround: false }
    expect(dealSubBoard(none, seeded(1))).toEqual([])
  })

  it('draws from the eligible pool regardless of the switches when they leave none', () => {
    const dealt = dealSubBoard(context, seeded(3), subBoardPool)
    expect(dealt).toHaveLength(8)
    expect(dealt.every((c) => subBoardPool.includes(c.cardId))).toBe(true)
  })

  it('is dealt only while an eligible pool card is on', () => {
    const noPool: DealContext = { viewers: [], wildcardCount: 12, today, commonGround: false }
    const others = cards.filter((c) => c.id !== 'wildcard-spins' && !subBoardPool.includes(c.id)).map((c) => c.id)
    const spinsDealt = (ctx: DealContext, disabled: string[]) => {
      for (let seed = 1; seed < 60; seed++) {
        if (dealCards(ctx, seeded(seed), disabled).some((c) => c.cardId === 'wildcard-spins')) return true
      }
      return false
    }
    expect(spinsDealt(noPool, [])).toBe(false)
    expect(spinsDealt(context, subBoardPool)).toBe(false)
    expect(canDeal(context, [...others])).toBe(true)
    expect(canDeal(context, [...others, ...subBoardPool])).toBe(false)
    expect(canDeal(context, [...others, ...subBoardPool.slice(1)])).toBe(true)
    expect(canDeal(noPool, [...others, 'blind-spin'])).toBe(false)
    expect(spinsDealt(context, [])).toBe(true)
    expect(spinsDealt(context, subBoardPool.filter((id) => id !== 'wildcards'))).toBe(true)
  })
})

// Deals recorded from the code before card frequencies existed (seeds 1, 2, 3, 7 and 11).
const golden = {
  march: [
    [
      'genre-night|Action night|3',
      'world-cinema|Russian cinema|2',
      'genre-night|Mystery night|3',
      'world-cinema|Korean cinema|3',
      'viewer-slices|B +1 slices|3',
      'viewer-weight|B −1 weight|1',
      'viewer-weight|B −3 weight|2',
      'everyone-weight|Everyone −2 weight|4'
    ],
    [
      "critics-darlings|Critics' darlings 7.3|2",
      'wildcard-spins|5× wildcard spins|4',
      'blind-spin|Blind spin|2',
      "so-bad-its-good|So bad it's good 4.1|4",
      'everyone-weight|Everyone +3 weight|3',
      'viewer-slices|C +3 slices|1',
      'decade-roulette|1950s|1',
      'genre-night|Western night|2'
    ],
    [
      "critics-darlings|Critics' darlings 7.0|3",
      'viewer-weight|C +2 weight|1',
      'everyone-slices|Everyone −1 slices|1',
      "critics-darlings|Critics' darlings 7.5|4",
      'decade-roulette|1970s|4',
      'everyone-slices|Everyone −2 slices|5',
      'wildcard-spins|2× wildcard spins|5',
      'blind-spin|Blind spin|4'
    ],
    [
      'viewer-weight|A −3 weight|3',
      'wildcards|+2 wildcards|2',
      'wildcard-spins|4× wildcard spins|2',
      'viewer-slices|C −1 slices|2',
      'everyone-slices|Everyone −1 slices|5',
      'everyone-weight|Everyone −1 weight|1',
      'viewer-slices|A −2 slices|1',
      'decade-roulette|1980s|4'
    ],
    [
      'wildcard-spins|4× wildcard spins|4',
      'genre-night|Thriller night|3',
      'viewer-weight|B −2 weight|3',
      'decade-roulette|1970s|4',
      "critics-darlings|Critics' darlings 7.1|1",
      'everyone-slices|Everyone +2 slices|3',
      'viewer-slices|B −1 slices|5',
      "so-bad-its-good|So bad it's good 5.2|2"
    ]
  ],
  dec: [
    [
      'viewer-weight|B −3 weight|2',
      'genre-night|Mystery night|3',
      'world-cinema|Korean cinema|3',
      'viewer-slices|B +1 slices|3',
      'viewer-weight|B −1 weight|1',
      'christmas|Christmas|1',
      'blind-spin|Blind spin|3',
      "so-bad-its-good|So bad it's good 4.4|2"
    ],
    [
      'wildcards|+1 wildcard|3',
      'decade-roulette|1990s|3',
      'wildcards|+3 wildcards|1',
      "so-bad-its-good|So bad it's good 4.3|3",
      "so-bad-its-good|So bad it's good 4.9|1",
      'christmas|Christmas|4',
      'viewer-weight|C +1 weight|1',
      'viewer-weight|C +2 weight|5'
    ],
    [
      'viewer-weight|B +3 weight|3',
      'wildcard-spins|2× wildcard spins|2',
      'genre-night|Comedy night|1',
      "critics-darlings|Critics' darlings 7.5|4",
      'decade-roulette|1970s|4',
      'christmas|Christmas|2',
      'wildcard-spins|5× wildcard spins|3',
      'viewer-weight|C +3 weight|4'
    ],
    [
      'christmas|Christmas|1',
      'world-cinema|Swedish cinema|3',
      'blind-spin|Blind spin|3',
      'everyone-slices|Everyone −2 slices|2',
      'everyone-weight|Everyone −2 weight|1',
      'wildcards|+1 wildcard|3',
      'everyone-slices|Everyone −1 slices|5',
      'everyone-weight|Everyone +1 weight|2'
    ],
    [
      'wildcard-spins|4× wildcard spins|3',
      'decade-roulette|1980s|1',
      'blind-spin|Blind spin|3',
      "so-bad-its-good|So bad it's good 4.6|4",
      'christmas|Christmas|4',
      'everyone-weight|Everyone +1 weight|2',
      'wildcards|+2 wildcards|1',
      'genre-night|Horror night|3'
    ]
  ],
  sub: [
    [
      'everyone-slices|Everyone +2 slices|5',
      'wildcards|+1 wildcard|4',
      'everyone-slices|Everyone +3 slices|3',
      'everyone-weight|Everyone +2 weight|2',
      'viewer-weight|B +2 weight|4',
      'viewer-slices|A +2 slices|3',
      'everyone-slices|Everyone +1 slices|4',
      'everyone-weight|Everyone −1 weight|4'
    ],
    [
      'everyone-slices|Everyone +1 slices|3',
      'wildcards|+2 wildcards|3',
      'viewer-slices|C +3 slices|2',
      'everyone-weight|Everyone −2 weight|1',
      'everyone-slices|Everyone +3 slices|1',
      'wildcards|+1 wildcard|1',
      'viewer-weight|A −2 weight|4',
      'everyone-weight|Everyone +1 weight|3'
    ],
    [
      'everyone-slices|Everyone +2 slices|1',
      'viewer-weight|A −1 weight|1',
      'everyone-slices|Everyone +3 slices|5',
      'viewer-slices|C +3 slices|3',
      'wildcards|+2 wildcards|1',
      'wildcards|+1 wildcard|5',
      'viewer-weight|B −1 weight|1',
      'everyone-weight|Everyone −2 weight|4'
    ],
    [
      'viewer-weight|A −3 weight|3',
      'everyone-weight|Everyone +1 weight|3',
      'everyone-slices|Everyone +1 slices|4',
      'everyone-weight|Everyone +2 weight|2',
      'everyone-weight|Everyone +3 weight|2',
      'wildcards|+1 wildcard|1',
      'viewer-weight|C −2 weight|4',
      'wildcards|+2 wildcards|5'
    ],
    [
      'everyone-weight|Everyone −2 weight|3',
      'wildcards|+2 wildcards|1',
      'everyone-slices|Everyone −1 slices|1',
      'viewer-slices|B +2 slices|1',
      'wildcards|+3 wildcards|4',
      'viewer-slices|B +1 slices|4',
      'wildcards|+1 wildcard|1',
      'everyone-slices|Everyone +2 slices|3'
    ]
  ]
}
const goldenViewers = ['a', 'b', 'c'].map((id) => ({ id, name: id.toUpperCase(), slices: 3, weight: 5, film: null, canReshuffle: false, canBacklog: false }))
const goldenContext = (day: Date): DealContext => ({ viewers: goldenViewers, wildcardCount: 3, today: day, commonGround: false })
const summarize = (deal: { cardId: string; label: string; weight: number }[]) => deal.map((c) => `${c.cardId}|${c.label}|${c.weight}`)

describe('golden deals', () => {
  const seeds = [1, 2, 3, 7, 11]
  const allThree = { frequencies: Object.fromEntries(cards.map((c) => [c.id, 3])), outsideDates: [] }
  for (const [name, tuning] of [['no tuning', undefined], ['every card at 3', allThree]] as const) {
    it(`March, December 10 and the sub-board are unchanged with ${name}`, () => {
      seeds.forEach((seed, i) => {
        expect(summarize(dealCards(goldenContext(new Date(2026, 2, 15)), seeded(seed), [], false, tuning))).toEqual(golden.march[i])
        expect(summarize(dealCards(goldenContext(new Date(2026, 11, 10)), seeded(seed), [], false, tuning))).toEqual(golden.dec[i])
        expect(summarize(dealSubBoard(goldenContext(new Date(2026, 2, 15)), seeded(seed), [], tuning))).toEqual(golden.sub[i])
      })
    })
  }
})

describe('card frequencies', () => {
  const ids = cards.map((c) => c.id)
  const everyone = (n: number, except: Record<string, number> = {}) => ({
    frequencies: { ...Object.fromEntries(ids.map((id) => [id, n])), ...except },
  })
  const december: DealContext = { ...context, today: new Date(2026, 11, 10) }
  const countDeals = (ctx: DealContext, tuning: Parameters<typeof dealCards>[4], id: string, n = 2000) => {
    let deals = 0
    for (let seed = 1; seed <= n; seed++) if (dealCards(ctx, seeded(seed), [], false, tuning).some((c) => c.cardId === id)) deals++
    return deals
  }
  const dealtIds = (ctx: DealContext, seed: number, tuning: Parameters<typeof dealCards>[4], disabled: string[] = []) =>
    dealCards(ctx, seeded(seed), disabled, false, tuning).map((c) => c.cardId)

  it('makes a higher frequency likelier and a card at 1 rare but possible', () => {
    const at = (n: number) => countDeals(context, { frequencies: { 'genre-night': n } }, 'genre-night')
    const [one, three, four] = [at(1), at(3), at(4)]
    expect(four).toBeGreaterThan(three)
    expect(three).toBeGreaterThan(one)
    expect(one).toBeGreaterThanOrEqual(1)
    expect(one).toBeLessThan(400)
  })

  it('gives a card at 5 a slot in every deal, and a random selection when they outnumber the slots', () => {
    const open: DealContext = { ...context, viewers: context.viewers.map((v) => ({ ...v, canBacklog: true })), commonGround: true }
    for (let seed = 1; seed < 100; seed++) expect(dealtIds(context, seed, { frequencies: { 'blind-spin': 5 } })).toContain('blind-spin')
    const tenIds = cards.filter((c) => c.eligible(open) && !c.fff).slice(0, 10).map((c) => c.id)
    expect(tenIds).toHaveLength(10)
    const tuning = { frequencies: Object.fromEntries(tenIds.map((id) => [id, 5])) }
    const sets = new Set<string>()
    for (let seed = 1; seed < 40; seed++) {
      const dealt = dealtIds(open, seed, tuning)
      expect(dealt).toHaveLength(8)
      expect(new Set(dealt).size).toBe(8)
      for (const id of dealt) expect(tenIds).toContain(id)
      sets.add([...dealt].sort().join())
    }
    expect(sets.size).toBeGreaterThan(1)
  })

  it('deals only the eligible cards, eight of them, when every card is at 5', () => {
    const empty: DealContext = { viewers: [], wildcardCount: 12, today, commonGround: false }
    const eligible = cards.filter((c) => !c.fff && c.eligible(empty)).map((c) => c.id)
    for (let seed = 1; seed < 40; seed++) {
      const dealt = dealtIds(empty, seed, everyone(5))
      expect(dealt).toHaveLength(8)
      for (const id of dealt) expect(eligible).toContain(id)
      expect(eligible.length).toBeLessThan(8)
      for (const id of eligible) expect(dealt).toContain(id)
    }
    const few: DealContext = { ...empty, wildcardCount: 12 }
    const tuning = { frequencies: { 'blind-spin': 5, 'genre-night': 5 } }
    for (let seed = 1; seed < 20; seed++) expect(dealtIds(few, seed, tuning)).toEqual(expect.arrayContaining(['blind-spin', 'genre-night']))
  })

  it('never deals a card at 5 that is switched off or ineligible', () => {
    const tuning = { frequencies: { 'blind-spin': 5, 'picks-again': 5, halloween: 5 } }
    for (let seed = 1; seed < 60; seed++) {
      const dealt = dealtIds(context, seed, tuning, ['blind-spin'])
      expect(dealt).toHaveLength(8)
      expect(dealt).not.toContain('blind-spin')
      expect(dealt).not.toContain('picks-again')
      expect(dealt).not.toContain('halloween')
    }
  })

  it('deals a seasonal card outside its dates only with Outside its dates on, at its frequency', () => {
    const off = { frequencies: { christmas: 5 }, outsideDates: [] }
    const on = { frequencies: { christmas: 5 }, outsideDates: ['christmas'] }
    for (let seed = 1; seed < 80; seed++) {
      expect(dealtIds(context, seed, off)).not.toContain('christmas')
      expect(dealtIds(context, seed, on)).toContain('christmas')
    }
    const mid = countDeals(context, { frequencies: {}, outsideDates: ['christmas'] }, 'christmas', 500)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(500)
    const others = cards.filter((c) => c.id !== 'christmas').map((c) => c.id)
    expect(canDeal(context, others)).toBe(false)
    expect(canDeal(context, others, false, { outsideDates: ['christmas'] })).toBe(true)
    expect(canDeal(context, [...others, 'christmas'], false, { outsideDates: ['christmas'] })).toBe(false)
  })

  it('ignores a stored frequency for a seasonal card within its dates while Outside its dates is off', () => {
    for (let seed = 1; seed < 40; seed++) {
      expect(dealCards(december, seeded(seed), [], false, { frequencies: { christmas: 1 } })).toEqual(dealCards(december, seeded(seed)))
    }
  })

  it('always gives a seasonal card within its dates its slot, ahead of the cards at 5', () => {
    const low = { frequencies: { christmas: 1 }, outsideDates: ['christmas'] }
    for (let seed = 1; seed < 60; seed++) expect(dealtIds(december, seed, low)).toContain('christmas')
    const nine = cards.filter((c) => !c.fff && c.id !== 'christmas' && c.eligible(december)).slice(0, 9).map((c) => c.id)
    const tuning = { frequencies: { christmas: 1, ...Object.fromEntries(nine.map((id) => [id, 5])) }, outsideDates: ['christmas'] }
    for (let seed = 1; seed < 40; seed++) {
      const dealt = dealtIds(december, seed, tuning)
      expect(dealt.filter((id) => id === 'christmas')).toHaveLength(1)
      expect(dealt.filter((id) => nine.includes(id))).toHaveLength(7)
    }
  })

  it('keeps wedge weights random from 1 to 5, and Blind Spin keeps the deal from being empty', () => {
    const tuning = everyone(5, { 'genre-night': 1, 'blind-spin': 2 })
    const weights = new Set<number>()
    for (let seed = 1; seed < 60; seed++) {
      for (const c of dealCards(context, seeded(seed), [], false, tuning)) {
        expect(Number.isInteger(c.weight) && c.weight >= 1 && c.weight <= 5).toBe(true)
        weights.add(c.weight)
      }
    }
    expect(weights.size).toBe(5)
    const empty: DealContext = { viewers: [], wildcardCount: 12, today, commonGround: false }
    const others = cards.filter((c) => c.eligible(empty) && c.id !== 'blind-spin').map((c) => c.id)
    expect(dealtIds(empty, 1, { frequencies: { 'blind-spin': 1 } }, others)).toEqual(Array(8).fill('blind-spin'))
  })

  it('tunes the sub-board by the same rules', () => {
    const board = (seed: number, tuning: Parameters<typeof dealSubBoard>[3]) => dealSubBoard(context, seeded(seed), [], tuning).map((c) => c.cardId)
    for (let seed = 1; seed < 60; seed++) expect(board(seed, { frequencies: { 'everyone-weight': 5 } })).toContain('everyone-weight')
    let one = 0
    let three = 0
    for (let seed = 1; seed <= 500; seed++) {
      if (board(seed, { frequencies: { wildcards: 1 } }).includes('wildcards')) one++
      if (board(seed, {}).includes('wildcards')) three++
    }
    expect(one).toBeLessThan(three)
  })
})
