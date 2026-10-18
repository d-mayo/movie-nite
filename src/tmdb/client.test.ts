import { describe, expect, test, vi } from 'vitest'
import { createTmdbClient, defaultApiBase, posterUrl } from './client.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

describe('tmdb client', () => {
  test('searchMovies encodes the query and maps year and poster', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      json({
        results: [
          { id: 1, title: 'A', release_date: '1999-03-31', poster_path: '/a.jpg' },
          { id: 2, title: 'B', release_date: '', poster_path: null },
          { id: 3, title: 'C' },
        ],
      }),
    )
    const results = await createTmdbClient('https://w.test', fetchFn).searchMovies('a & b')
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://w.test/tmdb/search?query=a%20%26%20b')
    expect(init.headers.Authorization).toBeUndefined()
    expect(results).toEqual([
      { tmdbId: 1, title: 'A', year: 1999, posterPath: '/a.jpg' },
      { tmdbId: 2, title: 'B', year: null, posterPath: null },
      { tmdbId: 3, title: 'C', year: null, posterPath: null },
    ])
  })

  test('getMovie maps runtime and genre names', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      json({
        id: 7,
        title: 'Seven',
        release_date: '1995-09-22',
        poster_path: '/s.jpg',
        overview: 'ov',
        runtime: 127,
        genres: [{ id: 1, name: 'Crime' }, { id: 2, name: 'Thriller' }],
      }),
    )
    expect(await createTmdbClient('https://w.test', fetchFn).getMovie(7)).toEqual({
      tmdbId: 7,
      title: 'Seven',
      year: 1995,
      posterPath: '/s.jpg',
      overview: 'ov',
      runtime: 127,
      genres: ['Crime', 'Thriller'],
    })
  })

  test('a network error and a non-2xx answer throw', async () => {
    const down = createTmdbClient('https://w.test', vi.fn().mockRejectedValue(new TypeError('x')))
    await expect(down.getMovie(1)).rejects.toThrow('Could not reach the film service')
    for (const status of [403, 429, 502]) {
      const broken = createTmdbClient('https://w.test', vi.fn().mockResolvedValue(json({}, status)))
      await expect(broken.searchMovies('ab')).rejects.toThrow(String(status))
    }
  })

  test('getMovie fetches the film route', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ id: 7, title: 'Seven' }))
    await createTmdbClient('https://w.test', fetchFn).getMovie(7)
    expect(fetchFn.mock.calls[0][0]).toBe('https://w.test/tmdb/movie/7')
  })

  test('defaultApiBase falls back to port 8787 on the page host', () => {
    vi.stubEnv('VITE_API_BASE', '')
    expect(defaultApiBase()).toBe(`${window.location.protocol}//${window.location.hostname}:8787`)
    vi.stubEnv('VITE_API_BASE', 'https://api.test')
    expect(defaultApiBase()).toBe('https://api.test')
    vi.unstubAllEnvs()
  })

  test('posterUrl builds an image URL', () => {
    expect(posterUrl('/x.jpg', 'w92')).toBe('https://image.tmdb.org/t/p/w92/x.jpg')
  })
})
