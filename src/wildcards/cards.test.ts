import { describe, expect, it } from 'vitest'
import { seeded } from './seeded.ts'
import { createTmdbClient } from '../tmdb/client.ts'
import { cards, validCardEffects, type DealContext, type DealViewer } from './cards.ts'

// A March day: no seasonal card is eligible.
const today = new Date(2026, 2, 15)

const viewer = (id: string, slices = 3, weight = 5): DealViewer => ({
  id,
  name: id.toUpperCase(),
  slices,
  weight,
  film: null,
  canReshuffle: false, canBacklog: false,
})

const byId = (id: string) => cards.find((c) => c.id === id)!

describe('the wheel cards', () => {
  it('has the wheel cards, the movie cards and the two FFF cards last', () => {
    expect(cards.map((c) => c.id)).toEqual([
      'viewer-weight',
      'viewer-slices',
      'everyone-weight',
      'everyone-slices',
      'wildcards',
      'picks-again',
      'reshuffle',
      'blind-spin',
      'wildcard-spins',
      'genre-night',
      'halloween',
      'christmas',
      'romance',
      'creature-feature',
      'critics-darlings',
      'so-bad-its-good',
      'decade-roulette',
      'world-cinema',
      'shortest-on-the-board',
      'backlog',
      'common-ground',
      'movie-night-rewind',
      'play-rento',
    ])
    expect(cards.slice(0, 9).every((c) => c.type === 'wheel' && !c.fff)).toBe(true)
    expect(cards.slice(9, 21).every((c) => c.type === 'movie' && !c.fff)).toBe(true)
    expect(cards.slice(21).every((c) => c.type === 'movie' && c.fff)).toBe(true)
  })

  it('rolls a weight card with its label, title, text and effect', () => {
    const context: DealContext = { viewers: [viewer('sam')], wildcardCount: 3, today, commonGround: false }
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
    const context: DealContext = { viewers: [viewer('sam')], wildcardCount: 3, today, commonGround: false }
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
    const context: DealContext = { viewers: [viewer('a'), viewer('b')], wildcardCount: 2, today, commonGround: false }
    const rolled = byId('everyone-slices').roll(context, seeded(3))
    expect(rolled.title).toMatch(/^Everyone [+−]\d Slices$/)
    expect(rolled.effect.change).toMatchObject({ kind: 'slices', viewerIds: ['a', 'b'] })
  })

  it('rolls a wildcards card trimmed to stay at 12', () => {
    const context: DealContext = { viewers: [viewer('a')], wildcardCount: 11, today, commonGround: false }
    for (let seed = 1; seed < 20; seed++) {
      const rolled = byId('wildcards').roll(context, seeded(seed))
      expect(rolled.effect.change).toEqual({ kind: 'wildcards', amount: 1 })
      expect(rolled.label).toBe('+1 wildcard')
    }
  })

  it('is never eligible beyond the limits', () => {
    // Weight 0.5 can't go down by 1, but can go up.
    const low: DealContext = { viewers: [viewer('a', 3, 0.5)], wildcardCount: 3, today, commonGround: false }
    for (let seed = 1; seed < 30; seed++) {
      const change = byId('viewer-weight').roll(low, seeded(seed)).effect.change
      expect(change.kind === 'weight' && change.amount > 0).toBe(true)
    }
    // At 12 slices a plus can't be rolled.
    const high: DealContext = { viewers: [viewer('a', 12, 5)], wildcardCount: 3, today, commonGround: false }
    for (let seed = 1; seed < 30; seed++) {
      const change = byId('viewer-slices').roll(high, seeded(seed)).effect.change
      expect(change.kind === 'slices' && change.amount < 0).toBe(true)
    }
  })

  it('is ineligible with no allowed roll', () => {
    expect(byId('wildcards').eligible({ viewers: [viewer('a')], wildcardCount: 12, today, commonGround: false })).toBe(false)
    expect(byId('everyone-weight').eligible({ viewers: [], wildcardCount: 0, today, commonGround: false })).toBe(false)
    // One viewer at each end of the weight range: no sign suits both.
    const split: DealContext = {
      viewers: [viewer('a', 3, 0.5), viewer('b', 3, 20)],
      wildcardCount: 3, today, commonGround: false,
    }
    expect(byId('everyone-weight').eligible(split)).toBe(false)
    expect(byId('viewer-weight').eligible(split)).toBe(true)
  })

  it('keeps an Everyone card within the limits for all of them', () => {
    const context: DealContext = {
      viewers: [viewer('a', 3, 19), viewer('b', 3, 2)],
      wildcardCount: 3, today, commonGround: false,
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
    const none: DealContext = { viewers: [viewer('a')], wildcardCount: 3, today, commonGround: false }
    expect(byId('picks-again').eligible(none)).toBe(false)
    const context: DealContext = { viewers: [viewer('a'), withFilm('b', 7)], wildcardCount: 3, today, commonGround: false }
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
    const none: DealContext = { viewers: [viewer('a'), withFilm('b', 7)], wildcardCount: 3, today, commonGround: false }
    expect(byId('reshuffle').eligible(none)).toBe(false)
    const context: DealContext = { viewers: [viewer('a'), reshufflable('b')], wildcardCount: 3, today, commonGround: false }
    expect(byId('reshuffle').eligible(context)).toBe(true)
    for (let seed = 1; seed < 20; seed++) {
      const rolled = byId('reshuffle').roll(context, seeded(seed))
      expect(rolled.label).toBe('Reshuffle B')
      expect(rolled.title).toBe('Reshuffle B')
      expect(rolled.effect.change).toMatchObject({ kind: 'reshuffle', viewerIds: ['b'] })
    }
  })

  it('Blind Spin is always eligible, even after earlier ones', () => {
    const context: DealContext = { viewers: [], wildcardCount: 12, today, commonGround: false }
    expect(byId('blind-spin').eligible(context)).toBe(true)
    const rolled = byId('blind-spin').roll(context, seeded(1))
    expect(rolled.label).toBe('Blind spin')
    expect(rolled.title).toBe('Blind Spin')
    expect(rolled.text).toBe('The next spin hides the names, titles and posters until it lands.')
    expect(rolled.effect.change).toEqual({ kind: 'blindSpin', used: false })
  })
})

describe('the movie cards', () => {
  const on = (month: number, day: number): DealContext => ({
    viewers: [],
    wildcardCount: 3,
    today: new Date(2026, month - 1, day),
    commonGround: false,
  })
  const params = (id: string, random = seeded(3)) => {
    const rolled = byId(id).roll(on(3, 15), random)
    if (rolled.source?.kind !== 'discover') throw new Error('not a discover card')
    return rolled.source.params
  }

  it('rolls Genre Night from the genre list, never TV Movie, with the vote floor', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed < 200; seed++) {
      const p = params('genre-night', seeded(seed))
      seen.add(p.with_genres!)
      expect(p['vote_count.gte']).toBe(200)
    }
    expect(seen.size).toBe(18)
    expect(seen.has('10770')).toBe(false)
  })

  it('names the rolled genre on the wedge, title and text', () => {
    for (let seed = 1; seed < 30; seed++) {
      const rolled = byId('genre-night').roll(on(3, 15), seeded(seed))
      const name = rolled.title.replace('Genre Night: ', '')
      expect(rolled.label).toBe(`${name} night`)
      expect(rolled.text).toBe(`Three ${name.toLowerCase()} films in the cans.`)
    }
  })

  it("rolls Critics' Darlings from 7.0 to 8.0 and So Bad It's Good from 4.0 to 5.5, in tenths", () => {
    const critics = new Set<number>()
    const bad = new Set<number>()
    for (let seed = 1; seed < 400; seed++) {
      critics.add(params('critics-darlings', seeded(seed))['vote_average.gte']!)
      bad.add(params('so-bad-its-good', seeded(seed))['vote_average.lte']!)
    }
    expect(Math.min(...critics)).toBe(7)
    expect(Math.max(...critics)).toBe(8)
    expect(Math.min(...bad)).toBe(4)
    expect(Math.max(...bad)).toBe(5.5)
    const rolled = byId('critics-darlings').roll(on(3, 15), () => 0.4)
    expect(rolled.label).toBe("Critics' darlings 7.4")
    expect(rolled.text).toBe('Three films rated 7.4 or above.')
    expect(byId('so-bad-its-good').roll(on(3, 15), () => 0).title).toBe("So Bad It's Good")
  })

  it("rolls Decade Roulette from the 1950s to the 2010s with the decade's first and last days", () => {
    const decades = new Set<string>()
    for (let seed = 1; seed < 100; seed++) {
      const p = params('decade-roulette', seeded(seed))
      const first = Number(p['primary_release_date.gte']!.slice(0, 4))
      expect(p['primary_release_date.gte']).toBe(`${first}-01-01`)
      expect(p['primary_release_date.lte']).toBe(`${first + 9}-12-31`)
      decades.add(String(first))
    }
    expect([...decades].sort()).toEqual(['1950', '1960', '1970', '1980', '1990', '2000', '2010'])
    const rolled = byId('decade-roulette').roll(on(3, 15), () => 0.34)
    expect(rolled.label).toBe('1970s')
    expect(rolled.title).toBe('Decade Roulette: the 1970s')
  })

  it('rolls World Cinema from the language list', () => {
    const codes = new Set<string>()
    for (let seed = 1; seed < 200; seed++) codes.add(params('world-cinema', seeded(seed)).with_original_language!)
    expect([...codes].sort()).toEqual(['da', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'ru', 'sv', 'zh'])
    const korean = Array.from({ length: 300 }, (_, i) => byId('world-cinema').roll(on(3, 15), seeded(i + 1))).find(
      (r) => r.title === 'World Cinema: Korean',
    )
    expect(korean?.label).toBe('Korean cinema')
  })

  it('has each seasonal card eligible exactly on its dates, with its keywords or genre', () => {
    const edges = (id: string, days: [number, number][]) => days.map(([m, d]) => byId(id).eligible(on(m, d)))
    expect(edges('halloween', [[9, 30], [10, 1], [10, 31], [11, 1]])).toEqual([false, true, true, false])
    expect(edges('christmas', [[11, 30], [12, 1], [12, 25], [12, 26]])).toEqual([false, true, true, false])
    expect(edges('romance', [[1, 31], [2, 1], [2, 14], [2, 15]])).toEqual([false, true, true, false])
    expect(edges('creature-feature', [[5, 31], [6, 1], [8, 31], [9, 1]])).toEqual([false, true, true, false])
    expect(params('halloween').with_keywords).toBe('3335')
    expect(params('christmas').with_keywords).toBe('207317')
    expect(params('romance').with_genres).toBe('10749')
    expect(params('creature-feature').with_keywords).toBe('158126|11100|161791')
    const rolled = byId('halloween').roll(on(10, 5), seeded(1))
    expect([rolled.label, rolled.title, rolled.text]).toEqual([
      'Halloween',
      'Halloween',
      'Three Halloween films in the cans.',
    ])
  })

  it('sends every rolled n through the real client with at most one decimal', async () => {
    const urls: string[] = []
    const fetchFn = (async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify({ page: 1, total_pages: 1, results: [] }))
    }) as unknown as typeof fetch
    const client = createTmdbClient('http://x', fetchFn)
    for (let seed = 1; seed < 60; seed++) {
      for (const id of ['critics-darlings', 'so-bad-its-good']) await client.discoverMovies(params(id, seeded(seed)))
    }
    for (const url of urls) {
      const query = new URL(url).searchParams
      expect(query.get('vote_average.gte') ?? query.get('vote_average.lte')).toMatch(/^\d(\.\d)?$/)
      expect(query.get('vote_count.gte')).toBe('200')
    }
  })

  it('makes Shortest on the Board eligible only with a runtime, and picks the shortest, ties by random', () => {
    const film = (runtime: number | null, tmdbId = runtime ?? 1) => ({ tmdbId, title: `Film ${tmdbId}`, runtime })
    const none: DealContext = { viewers: [{ ...viewer('a'), film: film(null) }], wildcardCount: 3, today, commonGround: false }
    expect(byId('shortest-on-the-board').eligible(none)).toBe(false)
    const context: DealContext = {
      viewers: [
        { ...viewer('a'), name: 'Ann', film: film(120) },
        { ...viewer('b'), name: 'Bo', film: film(95) },
        { ...viewer('c'), name: 'Cy', film: film(null) },
      ],
      wildcardCount: 3,
      today, commonGround: false,
    }
    expect(byId('shortest-on-the-board').eligible(context)).toBe(true)
    const rolled = byId('shortest-on-the-board').roll(context, seeded(1))
    expect(rolled.source).toEqual({ kind: 'shortest', viewerId: 'b', tmdbId: 95 })
    expect(rolled.label).toBe('Shortest on the board')
    expect(rolled.title).toBe('Shortest on the Board')
    expect(rolled.text).toBe("Film 95 (1h 35m), Bo's film, is the shortest on the board and wins.")
    const tied: DealContext = {
      ...context,
      viewers: [
        { ...viewer('a'), film: film(90, 1) },
        { ...viewer('b'), film: film(90, 2) },
      ],
    }
    const winners = new Set(
      [0, 0.99].map((r) => (byId('shortest-on-the-board').roll(tied, () => r).source as { viewerId: string }).viewerId),
    )
    expect(winners).toEqual(new Set(['a', 'b']))
  })

  it('keeps a well-formed movie effect and drops a malformed one', () => {
    const good = { cardId: 'genre-night', label: 'Horror night', change: { kind: 'movie' } }
    expect(validCardEffects([good, { cardId: 'x', label: 'y', change: { kind: 'movies' } }])).toEqual([good])
  })

  it("makes X's Backlog eligible only with a viewer marked able, rolling X from those", () => {
    const none: DealContext = { viewers: [viewer('a'), viewer('b')], wildcardCount: 3, today, commonGround: false }
    expect(byId('backlog').eligible(none)).toBe(false)
    const context: DealContext = {
      viewers: [viewer('a'), { ...viewer('b'), name: 'Bo', canBacklog: true }],
      wildcardCount: 3,
      today,
      commonGround: false,
    }
    expect(byId('backlog').eligible(context)).toBe(true)
    const rolled = byId('backlog').roll(context, seeded(1))
    expect(rolled).toMatchObject({
      type: 'movie',
      fff: false,
      label: "Bo's backlog",
      title: "Bo's Backlog",
      text: "Three films from Bo's watchlist in the cans.",
      source: { kind: 'backlog', viewerId: 'b' },
      effect: { cardId: 'backlog', label: "Bo's backlog", change: { kind: 'movie' } },
    })
  })

  it('makes Common Ground eligible only while the context marks it, and it rolls no viewer', () => {
    const base: DealContext = { viewers: [viewer('a')], wildcardCount: 3, today, commonGround: false }
    expect(byId('common-ground').eligible(base)).toBe(false)
    const on = { ...base, commonGround: true }
    expect(byId('common-ground').eligible(on)).toBe(true)
    expect(byId('common-ground').roll(on, seeded(1))).toMatchObject({
      type: 'movie',
      fff: false,
      label: 'Common ground',
      title: 'Common Ground',
      text: 'Three films from the most watchlists in the cans.',
      source: { kind: 'commonGround' },
      effect: { cardId: 'common-ground', label: 'Common ground', change: { kind: 'movie' } },
    })
  })
})

describe('the FFF cards', () => {
  const context: DealContext = { viewers: [viewer('a')], wildcardCount: 3, today, commonGround: false }

  it('are FFF movie cards with a name and a description that roll their source and a movie effect', () => {
    for (const id of ['movie-night-rewind', 'play-rento']) {
      const card = byId(id)
      expect(card.fff).toBe(true)
      expect(card.type).toBe('movie')
      expect(card.name.trim()).not.toBe('')
      expect(card.description.trim()).not.toBe('')
      const rolled = card.roll(context, seeded(1))
      expect(rolled.fff).toBe(true)
      expect(rolled.effect.change).toEqual({ kind: 'movie' })
    }
    expect(byId('movie-night-rewind').roll(context, seeded(1))).toMatchObject({
      title: 'Movie Night Rewind',
      source: { kind: 'list', username: 'loreno', slug: 'fff-movie-night-1' },
    })
    expect(byId('play-rento').roll(context, seeded(1))).toMatchObject({
      title: 'Play Rento',
      source: { kind: 'game', name: 'Rento', url: 'https://rento.com/' },
    })
  })

  it('has Rewind always eligible and Rento eligible only while no game was played tonight', () => {
    expect(byId('movie-night-rewind').eligible(context)).toBe(true)
    expect(byId('play-rento').eligible(context)).toBe(true)
    expect(byId('play-rento').eligible({ ...context, gamePlayed: false })).toBe(true)
    expect(byId('play-rento').eligible({ ...context, gamePlayed: true })).toBe(false)
    expect(byId('movie-night-rewind').eligible({ ...context, gamePlayed: true })).toBe(true)
  })
})

describe('card names and descriptions', () => {
  it('gives every card a plain, unique name and a description with no placeholder', () => {
    for (const card of cards) {
      expect(card.name.trim()).not.toBe('')
      expect(card.description.trim()).not.toBe('')
      for (const text of [card.name, card.description]) expect(text).not.toMatch(/\b[Xn]\b/)
    }
    expect(new Set(cards.map((c) => c.name)).size).toBe(cards.length)
  })
})

describe('the wildcard-spins card', () => {
  const card = cards.find((c) => c.id === 'wildcard-spins')!
  const ctx: DealContext = { viewers: [], wildcardCount: 3, today: new Date(2026, 2, 15), commonGround: false }

  it('sits right after Blind Spin and rolls n from 2 to 5', () => {
    const ids = cards.map((c) => c.id)
    expect(ids.indexOf('wildcard-spins')).toBe(ids.indexOf('blind-spin') + 1)
    expect(card.fff).toBe(false)
    const counts = new Set<number>()
    for (let seed = 1; seed < 80; seed++) {
      const rolled = card.roll(ctx, seeded(seed))
      const change = rolled.effect.change
      if (change.kind !== 'spins') throw new Error('not spins')
      counts.add(change.count)
      expect(rolled.label).toBe(`${change.count}× wildcard spins`)
      expect(rolled.title).toBe(`${change.count}× Wildcard Spins`)
      expect(rolled.text).toContain(String(change.count))
    }
    expect([...counts].sort()).toEqual([2, 3, 4, 5])
  })

  it('is eligible while a pool card is', () => {
    expect(card.eligible(ctx)).toBe(true)
    expect(card.eligible({ ...ctx, wildcardCount: 12 })).toBe(false)
  })

  it('validCardEffects keeps a valid spins effect and drops a malformed one', () => {
    const effect = (change: unknown) => ({ cardId: 'wildcard-spins', label: 'x', change })
    expect(validCardEffects([effect({ kind: 'spins', count: 3 })])).toHaveLength(1)
    for (const bad of [{ kind: 'spins' }, { kind: 'spins', count: 2.5 }, { kind: 'spins', count: 1 }, { kind: 'spins', count: 6 }]) {
      expect(validCardEffects([effect(bad)])).toEqual([])
    }
  })
})
