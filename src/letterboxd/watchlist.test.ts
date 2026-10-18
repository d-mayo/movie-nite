import { describe, expect, it, vi } from 'vitest'
import type { LetterboxdClient, WatchlistPageResult } from './client.ts'
import { createWatchlistMemory, drawFromWatchlist, ensureWalk, MAX_WATCHLIST_PAGES, subscribeToSettled } from './watchlist.ts'

function fakeClient(
  pages: WatchlistPageResult[],
  ids: Record<string, number | null | 'unavailable'> = {},
): LetterboxdClient & { watchlistPage: ReturnType<typeof vi.fn>; filmTmdbId: ReturnType<typeof vi.fn> } {
  return {
    checkProfile: vi.fn(),
    watchlistPage: vi.fn(async (_user: string, page: number) => pages[Math.min(page, pages.length) - 1]),
    filmTmdbId: vi.fn(async (slug: string) => (slug in ids ? ids[slug] : 'unavailable')),
    filmSlug: vi.fn(async () => 'unavailable' as const),
  }
}

const none = new Set<number>()

function draw(client: LetterboxdClient, memory = createWatchlistMemory(), options: { excluded?: Set<number>; random?: () => number } = {}) {
  return drawFromWatchlist({
    client,
    memory,
    username: 'Jo',
    excluded: options.excluded ?? none,
    random: options.random ?? (() => 0),
  })
}

describe('drawFromWatchlist', () => {
  it('walks the pages in order, stops at the last one, and picks by the random number', async () => {
    const client = fakeClient(
      [
        { slugs: ['a', 'b'], hasNext: true },
        { slugs: ['c'], hasNext: false },
      ],
      { a: 1, b: 2, c: 3 },
    )
    expect(await draw(client, undefined, { random: () => 0.99 })).toBe(3)
    expect(client.watchlistPage.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['jo', 1],
      ['jo', 2],
    ])
  })

  it('stops after 20 pages', async () => {
    const client = fakeClient([{ slugs: ['a'], hasNext: true }], { a: 1 })
    await draw(client)
    expect(client.watchlistPage).toHaveBeenCalledTimes(MAX_WATCHLIST_PAGES)
  })

  it('keeps the walk and the ids for the session', async () => {
    const client = fakeClient([{ slugs: ['a'], hasNext: false }], { a: 1 })
    const memory = createWatchlistMemory()
    await draw(client, memory)
    await draw(client, memory)
    expect(client.watchlistPage).toHaveBeenCalledTimes(1)
    expect(client.filmTmdbId).toHaveBeenCalledTimes(1)
  })

  it('shares a walk that is already under way', async () => {
    const client = fakeClient([{ slugs: ['a'], hasNext: false }], { a: 1 })
    const memory = createWatchlistMemory()
    await Promise.all([draw(client, memory), draw(client, memory)])
    expect(client.watchlistPage).toHaveBeenCalledTimes(1)
  })

  it('walks again after a failed walk', async () => {
    const client = fakeClient(['unavailable'])
    const memory = createWatchlistMemory()
    expect(await draw(client, memory)).toBe('unavailable')
    expect(await draw(client, memory)).toBe('unavailable')
    expect(client.watchlistPage).toHaveBeenCalledTimes(2)
  })

  it('walks again after an empty watchlist, in case it was filled', async () => {
    const client = fakeClient([{ slugs: [], hasNext: false }])
    const memory = createWatchlistMemory()
    expect(await draw(client, memory)).toBe('empty')
    client.watchlistPage.mockResolvedValue({ slugs: ['a'], hasNext: false })
    client.filmTmdbId.mockResolvedValue(4)
    expect(await draw(client, memory)).toBe(4)
  })

  it('gives private, missing and empty', async () => {
    expect(await draw(fakeClient(['private']))).toBe('private')
    expect(await draw(fakeClient(['missing']))).toBe('missing')
    expect(await draw(fakeClient([{ slugs: [], hasNext: false }]))).toBe('empty')
  })

  it('fails a walk whose later page fails', async () => {
    const client = fakeClient([{ slugs: ['a'], hasNext: true }, 'unavailable'], { a: 1 })
    expect(await draw(client)).toBe('unavailable')
  })

  it('skips excluded ids and films without a movie id', async () => {
    const client = fakeClient([{ slugs: ['a', 'b', 'c'], hasNext: false }], { a: 1, b: null, c: 3 })
    expect(await draw(client, undefined, { excluded: new Set([1]) })).toBe(3)
  })

  it('gives exhausted when nothing is left to draw', async () => {
    const client = fakeClient([{ slugs: ['a', 'b'], hasNext: false }], { a: 1, b: null })
    expect(await draw(client, undefined, { excluded: new Set([1]) })).toBe('exhausted')
  })

  it('gives unavailable, remembering nothing, when an id cannot be read', async () => {
    const client = fakeClient([{ slugs: ['a'], hasNext: false }], { a: 'unavailable' })
    const memory = createWatchlistMemory()
    expect(await draw(client, memory)).toBe('unavailable')
    client.filmTmdbId.mockResolvedValueOnce(5)
    expect(await draw(client, memory)).toBe(5)
  })
})

describe('settled walks', () => {
  it("records a draw's walk and a direct walk, telling the listeners once each", async () => {
    const client = fakeClient([{ slugs: ['a', 'b'], hasNext: false }], { a: 1, b: 2 })
    const memory = createWatchlistMemory()
    const listener = vi.fn()
    subscribeToSettled(memory, listener)
    await draw(client, memory)
    expect(memory.settled.get('jo')).toEqual(['a', 'b'])
    expect(listener).toHaveBeenCalledTimes(1)
    await ensureWalk(client, memory, 'sam')
    expect(memory.settled.get('sam')).toEqual(['a', 'b'])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stops telling a listener that unsubscribed', async () => {
    const client = fakeClient([{ slugs: ['a'], hasNext: false }])
    const memory = createWatchlistMemory()
    const listener = vi.fn()
    subscribeToSettled(memory, listener)()
    await ensureWalk(client, memory, 'jo')
    expect(listener).not.toHaveBeenCalled()
  })

  it('records an empty list yet lets the next draw walk again, and updates on a successful re-walk', async () => {
    const client = fakeClient([{ slugs: [], hasNext: false }], { a: 1 })
    const memory = createWatchlistMemory()
    expect(await draw(client, memory)).toBe('empty')
    expect(memory.settled.get('jo')).toEqual([])
    client.watchlistPage.mockResolvedValue({ slugs: ['a'], hasNext: false })
    expect(await draw(client, memory)).toBe(1)
    expect(client.watchlistPage).toHaveBeenCalledTimes(2)
    expect(memory.settled.get('jo')).toEqual(['a'])
  })

  it('records nothing for a failed walk, and the next draw walks again', async () => {
    const client = fakeClient(['unavailable'])
    const memory = createWatchlistMemory()
    const listener = vi.fn()
    subscribeToSettled(memory, listener)
    await ensureWalk(client, memory, 'jo')
    for (const failure of ['private', 'missing'] as const) {
      client.watchlistPage.mockResolvedValue(failure)
      await draw(client, memory)
    }
    expect(memory.settled.size).toBe(0)
    expect(listener).not.toHaveBeenCalled()
    expect(client.watchlistPage).toHaveBeenCalledTimes(3)
  })

  it("knows a drawn film's slug without asking Letterboxd", async () => {
    const client = fakeClient([{ slugs: ['a'], hasNext: false }], { a: 7 })
    const memory = createWatchlistMemory()
    await draw(client, memory)
    expect(memory.slugs.get(7)).toBe('a')
    expect(client.filmSlug).not.toHaveBeenCalled()
  })
})
