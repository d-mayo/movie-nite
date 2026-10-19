import { describe, expect, it, vi } from 'vitest'
import type { LetterboxdClient } from './client.ts'
import { canCommonGround, canHaveBacklog, drawCommonGround, sharedSlugs } from './commonGround.ts'
import { createWatchlistMemory, type WatchlistMemory } from './watchlist.ts'

const none = new Set<number>()

function memoryOf(walks: Record<string, string[]>, ids: Record<string, number | null> = {}): WatchlistMemory {
  const memory = createWatchlistMemory()
  for (const [name, slugs] of Object.entries(walks)) memory.settled.set(name, slugs)
  for (const [slug, id] of Object.entries(ids)) memory.ids.set(slug, id)
  return memory
}

function fakeClient(ids: Record<string, number | null | 'unavailable'>) {
  const filmTmdbId = vi.fn(async (slug: string) => (slug in ids ? ids[slug] : 'unavailable'))
  return { client: { filmTmdbId } as unknown as LetterboxdClient, filmTmdbId }
}

describe('canHaveBacklog', () => {
  const found = { username: 'Jo', status: 'found' }
  it('needs a found profile, a settled walk and a usable slug', () => {
    expect(canHaveBacklog(memoryOf({ jo: ['a'] }), found, none)).toBe(true)
    expect(canHaveBacklog(memoryOf({ jo: ['a'] }), { username: 'jo', status: 'pending' }, none)).toBe(false)
    expect(canHaveBacklog(memoryOf({}), found, none)).toBe(false)
    expect(canHaveBacklog(memoryOf({ jo: ['a', 'b'] }, { a: null, b: 5 }), found, new Set([5]))).toBe(false)
    expect(canHaveBacklog(memoryOf({ jo: ['a'] }), found, none)).toBe(true) // unmapped counts as usable
  })
})

describe('canCommonGround', () => {
  it('needs two usernames sharing a usable slug', () => {
    expect(canCommonGround(memoryOf({ jo: ['a'], sam: ['a'] }), ['jo', 'sam'], none)).toBe(true)
    expect(canCommonGround(memoryOf({ jo: ['a'] }), ['jo'], none)).toBe(false)
    expect(canCommonGround(memoryOf({ jo: ['a'], sam: ['b'] }), ['jo', 'sam'], none)).toBe(false)
    expect(canCommonGround(memoryOf({ jo: ['a'], sam: ['a'] }, { a: null }), ['jo', 'sam'], none)).toBe(false)
    expect(canCommonGround(memoryOf({ jo: ['a'], sam: ['a'] }, { a: 4 }), ['jo', 'sam'], new Set([4]))).toBe(false)
  })
})

describe('sharedSlugs', () => {
  it('keeps slugs held by two or more, with holders in the order given', () => {
    const shared = sharedSlugs(memoryOf({ jo: ['a', 'b'], sam: ['b', 'c'], al: ['b', 'c'] }), ['sam', 'jo', 'al'])
    expect([...shared]).toEqual([
      ['b', ['sam', 'jo', 'al']],
      ['c', ['sam', 'al']],
    ])
  })
})

describe('drawCommonGround', () => {
  const walks = { jo: ['a', 'b', 'c', 'x'], sam: ['a', 'b', 'c', 'y'], al: ['a', 'b', 'z'] }
  const users = ['jo', 'sam', 'al']

  it('takes the most-held slugs first, never a single-holder one, and maps only the slugs taken', async () => {
    const { client, filmTmdbId } = fakeClient({ a: 1, b: 2, c: 3, x: 9, y: 9, z: 9 })
    const memory = memoryOf(walks, { a: 1 })
    const result = await drawCommonGround({ client, memory, usernames: users, excluded: none, random: () => 0, count: 2 })
    expect(result).toEqual([
      { tmdbId: 1, holders: ['jo', 'sam', 'al'] },
      { tmdbId: 2, holders: ['jo', 'sam', 'al'] },
    ])
    expect(filmTmdbId.mock.calls.map((c) => c[0])).toEqual(['b'])
    expect(memory.slugs.get(2)).toBe('b')
    expect(memory.ids.get('b')).toBe(2)
  })

  it('falls to the next count and returns fewer when the shared slugs run out', async () => {
    const { client } = fakeClient({ a: 1, b: 2, c: 3 })
    const result = await drawCommonGround({ client, memory: memoryOf(walks), usernames: users, excluded: none, random: () => 0, count: 5 })
    expect(result).toEqual([
      { tmdbId: 1, holders: ['jo', 'sam', 'al'] },
      { tmdbId: 2, holders: ['jo', 'sam', 'al'] },
      { tmdbId: 3, holders: ['jo', 'sam'] },
    ])
  })

  it('skips null and excluded films', async () => {
    const { client } = fakeClient({ a: null, b: 2, c: 3 })
    const result = await drawCommonGround({ client, memory: memoryOf(walks), usernames: users, excluded: new Set([2]), random: () => 0, count: 3 })
    expect(result).toEqual([{ tmdbId: 3, holders: ['jo', 'sam'] }])
  })

  it('gives exhausted when nothing shared is usable and unavailable when Letterboxd fails first', async () => {
    const nulls = fakeClient({ a: null, b: null, c: null })
    expect(await drawCommonGround({ client: nulls.client, memory: memoryOf(walks), usernames: users, excluded: none, random: () => 0, count: 3 })).toBe('exhausted')
    const down = fakeClient({})
    expect(await drawCommonGround({ client: down.client, memory: memoryOf(walks), usernames: users, excluded: none, random: () => 0, count: 3 })).toBe('unavailable')
  })
})
