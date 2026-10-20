import { expect, test, vi } from 'vitest'
import type { LetterboxdClient, ListPageResult } from './client.ts'
import { drawFilmsFromList } from './listDraw.ts'
import { createWatchlistMemory } from './watchlist.ts'
import { seeded } from '../wildcards/seeded.ts'

function setup(pages: Record<number, ListPageResult>, ids: Record<string, number | null | 'unavailable'>) {
  const listPage = vi.fn(async (_u: string, _s: string, page: number) => pages[page])
  const filmTmdbId = vi.fn(async (slug: string) => ids[slug])
  const client = { listPage, filmTmdbId } as unknown as LetterboxdClient
  return { client, listPage, filmTmdbId, memory: createWatchlistMemory() }
}

const page = (slugs: string[], lastPage: number, hasNext = false): ListPageResult => ({ slugs, hasNext, lastPage })
const run = (s: ReturnType<typeof setup>, excluded: number[] = [], seed = 1) =>
  drawFilmsFromList({ client: s.client, memory: s.memory, username: 'loreno', slug: 'fff', excluded: new Set(excluded), random: seeded(seed), count: 3 })

test('reads page 1, then a random page, and gives three distinct ids, mapping only the slugs it takes', async () => {
  const s = setup(
    { 1: page(['a', 'b', 'c', 'd'], 2, true), 2: page(['e', 'f', 'g', 'h', 'i'], 2) },
    { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9 },
  )
  const films = (await run(s)) as number[]
  expect(films).toHaveLength(3)
  expect(new Set(films).size).toBe(3)
  expect(s.listPage.mock.calls.map((c) => c[2])[0]).toBe(1)
  expect(s.filmTmdbId.mock.calls.length).toBe(3)
  expect(s.memory.ids.size).toBe(3)
  for (const id of films) expect(s.memory.slugs.has(id)).toBe(true)
})

test('redraws past null and excluded slugs and uses the memory first', async () => {
  const s = setup({ 1: page(['a', 'b', 'c', 'd', 'e'], 1) }, { a: null, b: 2, c: 3, d: 4, e: 5 })
  s.memory.ids.set('c', 3)
  const films = (await run(s, [2])) as number[]
  expect(films.sort()).toEqual([3, 4, 5])
  expect(s.filmTmdbId).not.toHaveBeenCalledWith('c')
})

test('fills from page 1 when the random page runs out', async () => {
  for (let seed = 1; seed < 20; seed++) {
    const s = setup({ 1: page(['a', 'b', 'c'], 2, true), 2: page(['d'], 2) }, { a: 1, b: 2, c: 3, d: 4 })
    const films = (await run(s, [], seed)) as number[]
    expect(films).toHaveLength(3)
    expect(new Set(films).size).toBe(3)
  }
})

test('keeps films found before a lookup turns unavailable, and gives unavailable when none were', async () => {
  const some = setup({ 1: page(['a', 'b'], 1) }, { a: 1, b: 'unavailable' })
  const first = () => 0
  const result = await drawFilmsFromList({ client: some.client, memory: some.memory, username: 'loreno', slug: 'fff', excluded: new Set(), random: first, count: 3 })
  expect(result).toEqual([1])
  const none = setup({ 1: page(['b'], 1) }, { b: 'unavailable' })
  expect(await run(none)).toBe('unavailable')
})

test('gives private, missing, unavailable and exhausted', async () => {
  for (const failure of ['private', 'missing', 'unavailable'] as const) {
    expect(await run(setup({ 1: failure }, {}))).toBe(failure)
  }
  expect(await run(setup({ 1: page([], 1) }, {}))).toBe('exhausted')
  expect(await run(setup({ 1: page(['a'], 1) }, { a: 5 }), [5])).toBe('exhausted')
})
