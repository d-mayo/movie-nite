import { describe, expect, it, vi } from 'vitest'
import type { Nomination } from '../state/model.ts'
import type { DiscoverPage, SearchResult, TmdbClient } from './client.ts'
import { drawDiscoverFilms, filmsMessage, loadFilms } from './discoverDraw.ts'

const result = (tmdbId: number): SearchResult => ({ tmdbId, title: `Film ${tmdbId}`, year: 2000, posterPath: null })
const nomination = (tmdbId: number): Nomination => ({
  tmdbId,
  title: `Film ${tmdbId}`,
  year: 2000,
  posterPath: null,
  overview: '',
  runtime: 100,
  genres: [],
})

function fakeClient(pages: Record<number, DiscoverPage | Error>, failing: number[] = []) {
  return {
    searchMovies: vi.fn(),
    discoverMovies: vi.fn(async (params: { page?: number }) => {
      const page = pages[params.page ?? 1]
      if (page instanceof Error) throw page
      return page
    }),
    getMovie: vi.fn(async (id: number) => {
      if (failing.includes(id)) throw new Error('no details')
      return nomination(id)
    }),
  } satisfies TmdbClient
}

const page = (n: number, totalPages: number, ids: number[]): DiscoverPage => ({
  page: n,
  totalPages,
  results: ids.map(result),
})

const none = new Set<number>()

describe('drawDiscoverFilms', () => {
  it('asks for page 1, then a random page from 1 to totalPages, and loads three films from it', async () => {
    const client = fakeClient({ 1: page(1, 4, [1, 2, 3, 4]), 3: page(3, 4, [30, 31, 32, 33]) })
    const films = await drawDiscoverFilms({
      client,
      params: { with_genres: '27' },
      excluded: none,
      random: () => 0.5, // page 1 + floor(.5 * 4) = 3, then the middle of the pool
    })
    expect(client.discoverMovies.mock.calls.map(([p]) => p.page)).toEqual([1, 3])
    expect(client.discoverMovies.mock.calls[0][0]).toMatchObject({ with_genres: '27' })
    expect(films).toHaveLength(3)
    expect((films as Nomination[]).every((f) => f.tmdbId >= 30)).toBe(true)
    expect(client.getMovie).toHaveBeenCalledTimes(3)
  })

  it('reads page 1 once when the random page is page 1', async () => {
    const client = fakeClient({ 1: page(1, 1, [1, 2, 3, 4]) })
    const films = await drawDiscoverFilms({ client, params: {}, excluded: none, random: () => 0 })
    expect(client.discoverMovies).toHaveBeenCalledTimes(1)
    expect(films).toHaveLength(3)
  })

  it('skips excluded films and fills from page 1 when the page has too few', async () => {
    const client = fakeClient({ 1: page(1, 2, [1, 2, 3, 4]), 2: page(2, 2, [20, 21, 22]) })
    const films = await drawDiscoverFilms({
      client,
      params: {},
      excluded: new Set([20, 2]),
      random: () => 0.99,
    })
    const ids = (films as Nomination[]).map((f) => f.tmdbId).sort((a, b) => a - b)
    expect(ids).toHaveLength(3)
    expect(ids).toContain(21)
    expect(ids).toContain(22)
    expect(ids).not.toContain(20)
    expect(ids).not.toContain(2)
    expect(ids.some((id) => [1, 3, 4].includes(id))).toBe(true)
  })

  it('drops a film whose details fail and returns fewer films when the source is thin', async () => {
    const client = fakeClient({ 1: page(1, 1, [1, 2, 3]) }, [2])
    const films = await drawDiscoverFilms({ client, params: {}, excluded: none, random: () => 0 })
    expect((films as Nomination[]).map((f) => f.tmdbId).sort()).toEqual([1, 3])
    const thin = fakeClient({ 1: page(1, 1, [1]) })
    expect(await drawDiscoverFilms({ client: thin, params: {}, excluded: none, random: () => 0 })).toHaveLength(1)
  })

  it('says none when nothing is left, and unavailable when discover or every film fails', async () => {
    const empty = fakeClient({ 1: page(1, 1, []) })
    expect(await drawDiscoverFilms({ client: empty, params: {}, excluded: none, random: () => 0 })).toBe('none')
    const allExcluded = fakeClient({ 1: page(1, 1, [1, 2]) })
    expect(await drawDiscoverFilms({ client: allExcluded, params: {}, excluded: new Set([1, 2]), random: () => 0 })).toBe('none')
    const down = fakeClient({ 1: new Error('down') })
    expect(await drawDiscoverFilms({ client: down, params: {}, excluded: none, random: () => 0 })).toBe('unavailable')
    const noDetails = fakeClient({ 1: page(1, 1, [1, 2]) }, [1, 2])
    expect(await drawDiscoverFilms({ client: noDetails, params: {}, excluded: none, random: () => 0 })).toBe('unavailable')
  })

  it('falls back to page 1 when the random page fails', async () => {
    const client = fakeClient({ 1: page(1, 3, [1, 2, 3]), 2: new Error('down'), 3: new Error('down') })
    const films = await drawDiscoverFilms({ client, params: {}, excluded: none, random: () => 0.5 })
    expect(films).toHaveLength(3)
  })

  it('words its failures', () => {
    expect(filmsMessage('none')).toBe('No films turned up for this card.')
    expect(filmsMessage('unavailable')).toBe('Film search is unavailable right now.')
  })
})

describe('loadFilms', () => {
  it('keeps the order and drops a failed film', async () => {
    const client = fakeClient({}, [2])
    expect((await loadFilms(client, [3, 2, 1])).map((f) => f.tmdbId)).toEqual([3, 1])
  })
})
