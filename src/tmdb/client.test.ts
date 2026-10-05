import { describe, expect, test, vi } from 'vitest'
import { createTmdbClient, posterUrl, TmdbAuthError } from './client.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

describe('tmdb client', () => {
  test('checkToken calls /authentication once with the Bearer header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ success: true }))
    await createTmdbClient('tok', fetchFn).checkToken()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.themoviedb.org/3/authentication')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

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
    const results = await createTmdbClient('t', fetchFn).searchMovies('a & b')
    expect(fetchFn.mock.calls[0][0]).toContain('query=a%20%26%20b')
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
    expect(await createTmdbClient('t', fetchFn).getMovie(7)).toEqual({
      tmdbId: 7,
      title: 'Seven',
      year: 1995,
      posterPath: '/s.jpg',
      overview: 'ov',
      runtime: 127,
      genres: ['Crime', 'Thriller'],
    })
  })

  test('a 401 throws TmdbAuthError', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({}, 401))
    await expect(createTmdbClient('t', fetchFn).getMovie(1)).rejects.toThrow(
      TmdbAuthError,
    )
  })

  test('a network error and a 500 throw the generic error', async () => {
    const down = createTmdbClient('t', vi.fn().mockRejectedValue(new TypeError('x')))
    await expect(down.checkToken()).rejects.toThrow('Could not reach TMDB')
    const broken = createTmdbClient('t', vi.fn().mockResolvedValue(json({}, 500)))
    const error = await broken.checkToken().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TmdbAuthError)
  })

  test('posterUrl builds an image URL', () => {
    expect(posterUrl('/x.jpg', 'w92')).toBe('https://image.tmdb.org/t/p/w92/x.jpg')
  })
})
