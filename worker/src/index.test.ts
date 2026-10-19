import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import worker, { isAllowedOrigin, parseFilmTmdbId, readListPage, readTmdbRedirect, readWatchlistPage, type Env } from './index.ts'

const TOKEN = 'secret-token-123'
const ORIGIN = 'https://d-mayo.github.io'

function makeEnv() {
  const tmdb = vi.fn(async () => ({ success: true }))
  const lb = vi.fn(async () => ({ success: true }))
  const env = { TMDB_TOKEN: TOKEN, TMDB_LIMIT: { limit: tmdb }, LB_LIMIT: { limit: lb } } as unknown as Env
  return { env, tmdb, lb }
}

function call(path: string, init: { origin?: string | null; method?: string; ip?: string; env?: Env } = {}) {
  const headers = new Headers()
  const origin = init.origin === undefined ? ORIGIN : init.origin
  if (origin) headers.set('Origin', origin)
  if (init.ip) headers.set('CF-Connecting-IP', init.ip)
  const env = init.env ?? makeEnv().env
  return worker.fetch(new Request(`https://movie-nite.test${path}`, { method: init.method ?? 'GET', headers }), env)
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the TMDB relay', () => {
  it('relays the search with the token and a one-hour cache header', async () => {
    const res = await call('/tmdb/search?query=a%20%26%20b')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [] })
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.themoviedb.org/3/search/movie?query=a%20%26%20b&include_adult=false')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('relays film details with a one-day cache header', async () => {
    const res = await call('/tmdb/movie/7')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.themoviedb.org/3/movie/7')
  })

  it('answers 400, 404 and 405 without calling TMDB', async () => {
    for (const [path, status, method] of [
      ['/tmdb/search?query=', 400, 'GET'],
      ['/tmdb/search?query=%20%20', 400, 'GET'],
      ['/tmdb/search', 400, 'GET'],
      ['/tmdb/movie/abc', 400, 'GET'],
      ['/tmdb/other', 404, 'GET'],
      ['/', 404, 'GET'],
      ['/tmdb/search?query=a', 405, 'POST'],
    ] as const) {
      const res = await call(path, { method })
      expect(res.status, path).toBe(status)
      expect(res.headers.get('Cache-Control'), path).toBe('no-store')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 502 when TMDB refuses or cannot be reached, and never leaks the token', async () => {
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) => vi.spyOn(console, m))
    const bodies: string[] = []
    fetchMock.mockResolvedValueOnce(new Response(`bad ${TOKEN}`, { status: 401 }))
    let res = await call('/tmdb/movie/7')
    expect(res.status).toBe(502)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    bodies.push(await res.text())
    fetchMock.mockRejectedValueOnce(new Error(`down ${TOKEN}`))
    res = await call('/tmdb/search?query=a')
    expect(res.status).toBe(502)
    bodies.push(await res.text())
    for (const body of bodies) expect(body).not.toContain(TOKEN)
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN)
  })
})

describe('the origin check', () => {
  it.each([
    'https://d-mayo.github.io',
    'http://localhost:5173',
    'http://127.0.0.1:4173',
    'http://[::1]:5173',
    'http://192.168.1.20:5173',
    'http://10.0.0.5:5173',
    'http://172.16.0.1:5173',
    'http://172.31.255.1',
  ])('allows %s and echoes it', async (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true)
    const res = await call('/tmdb/movie/1', { origin })
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it.each([
    null,
    'https://evil.example',
    'https://d-mayo.github.io.evil.example',
    'http://d-mayo.github.io',
    'http://8.8.8.8:5173',
    'http://172.32.0.1',
    'null',
  ])('refuses %s with 403, no CORS headers, no fetch and no count', async (origin) => {
    const { env, tmdb, lb } = makeEnv()
    const res = await call('/tmdb/movie/1', { origin, env })
    expect(res.status).toBe(403)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(tmdb).not.toHaveBeenCalled()
    expect(lb).not.toHaveBeenCalled()
  })

  it('answers an allowed preflight with 204 and no count', async () => {
    const { env, tmdb, lb } = makeEnv()
    const res = await call('/tmdb/search', { method: 'OPTIONS', env })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(tmdb).not.toHaveBeenCalled()
    expect(lb).not.toHaveBeenCalled()
  })
})

describe('the per-IP limits', () => {
  it('counts a TMDB request against the TMDB budget by IP', async () => {
    const { env, tmdb, lb } = makeEnv()
    await call('/tmdb/movie/1', { env, ip: '1.2.3.4' })
    expect(tmdb).toHaveBeenCalledWith({ key: '1.2.3.4' })
    expect(lb).not.toHaveBeenCalled()
  })

  it('uses a fallback key without CF-Connecting-IP', async () => {
    const { env, tmdb } = makeEnv()
    await call('/tmdb/movie/1', { env })
    expect(tmdb).toHaveBeenCalledWith({ key: 'local' })
  })

  it('answers 429 with CORS headers and no fetch when a budget is spent, leaving the other', async () => {
    const { env, tmdb, lb } = makeEnv()
    tmdb.mockResolvedValue({ success: false })
    const res = await call('/tmdb/movie/1', { env })
    expect(res.status).toBe(429)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lb).not.toHaveBeenCalled()
  })
})

describe('wrangler.toml', () => {
  const toml = readFileSync('worker/wrangler.toml', 'utf8')

  it('declares the two budgets in different namespaces', () => {
    const blocks = toml.split('[[ratelimits]]').slice(1)
    expect(blocks).toHaveLength(2)
    const ids = blocks.map((b) => /namespace_id\s*=\s*"(\d+)"/.exec(b)?.[1])
    expect(new Set(ids).size).toBe(2)
    expect(blocks[0]).toMatch(/name = "TMDB_LIMIT"[\s\S]*limit = 120, period = 60/)
    expect(blocks[1]).toMatch(/name = "LB_LIMIT"[\s\S]*limit = 300, period = 60/)
  })

  it('holds no secret value', () => {
    expect(toml).not.toMatch(/^\s*TMDB_TOKEN\s*=/m)
    expect(toml).not.toMatch(/\[vars\]/)
  })
})

describe('the Letterboxd probe', () => {
  const page = (status: number, body: string) => new Response(body, { status })

  it('fetches the profile and reports a clean page', async () => {
    fetchMock.mockResolvedValueOnce(page(200, '<html>loreno</html>'))
    const res = await call('/lb/probe')
    expect(fetchMock.mock.calls[0][0]).toBe('https://letterboxd.com/loreno/')
    expect(await res.json()).toEqual({ ok: true, status: 200, challenged: false })
  })

  it('counts against the Letterboxd budget only', async () => {
    const { env, tmdb, lb } = makeEnv()
    await call('/lb/probe', { env, ip: '9.9.9.9' })
    expect(lb).toHaveBeenCalledWith({ key: '9.9.9.9' })
    expect(tmdb).not.toHaveBeenCalled()
  })

  it('flags a 403 or a challenge page', async () => {
    fetchMock.mockResolvedValueOnce(page(403, 'denied'))
    expect(await (await call('/lb/probe')).json()).toEqual({ ok: false, status: 403, challenged: true })
    fetchMock.mockResolvedValueOnce(page(503, '<title>Just a moment...</title>'))
    expect(await (await call('/lb/probe')).json()).toEqual({ ok: false, status: 503, challenged: true })
  })

  it('reports a 404 as not ok and not challenged', async () => {
    fetchMock.mockResolvedValueOnce(page(404, 'gone'))
    expect(await (await call('/lb/probe')).json()).toEqual({ ok: false, status: 404, challenged: false })
  })

  it('reports a failed fetch with a null status', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))
    expect(await (await call('/lb/probe')).json()).toEqual({ ok: false, status: null, challenged: false })
  })

  it('refuses a disallowed origin without fetching', async () => {
    const res = await call('/lb/probe', { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the Letterboxd profile check', () => {
  const page = (status: number, body: string) => new Response(body, { status })

  it('fetches the lowercased profile like the probe and reports a found one with a one-hour cache', async () => {
    fetchMock.mockResolvedValueOnce(page(200, '<html>jo</html>'))
    const res = await call('/lb/Jo_1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://letterboxd.com/jo_1/')
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('Mozilla/5.0 (compatible; movie-nite/1.0)')
    expect((init.headers as Record<string, string>).Accept).toBe('text/html')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ username: 'jo_1' })
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
  })

  it('reports an unchallenged 404 as no such profile', async () => {
    fetchMock.mockResolvedValueOnce(page(404, 'gone'))
    const res = await call('/lb/jo')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No such profile' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it.each([
    ['a 403 challenge', () => page(403, 'denied')],
    ['a 200 challenge page', () => page(200, '<title>Just a moment...</title>')],
    ['a 404 challenge page', () => page(404, '<title>Just a moment...</title>')],
    ['a 500', () => page(500, 'oops')],
  ])('answers 502 for %s', async (_, make) => {
    fetchMock.mockResolvedValueOnce(make())
    const res = await call('/lb/jo')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Letterboxd could not be checked' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('answers 502 when the fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))
    const res = await call('/lb/jo')
    expect(res.status).toBe(502)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('answers 400 for a bad username and 404 for other paths, without fetching', async () => {
    for (const [path, status] of [
      ['/lb/a.b', 400],
      [`/lb/${'a'.repeat(16)}`, 400],
      ['/lb/', 404],
      ['/lb/jo/extra', 404],
    ] as const) {
      const res = await call(path)
      expect(res.status, path).toBe(status)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves /lb/probe to the probe', async () => {
    fetchMock.mockResolvedValueOnce(page(200, '<html>loreno</html>'))
    const res = await call('/lb/probe')
    expect(fetchMock.mock.calls[0][0]).toBe('https://letterboxd.com/loreno/')
    expect(await res.json()).toEqual({ ok: true, status: 200, challenged: false })
  })

  it('counts against the Letterboxd budget and answers 429 when it is spent', async () => {
    const { env, tmdb, lb } = makeEnv()
    await call('/lb/jo', { env, ip: '9.9.9.9' })
    expect(lb).toHaveBeenCalledWith({ key: '9.9.9.9' })
    expect(tmdb).not.toHaveBeenCalled()
    fetchMock.mockClear()
    lb.mockResolvedValue({ success: false })
    const res = await call('/lb/jo', { env })
    expect(res.status).toBe(429)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

function fixture(name: string): string {
  return readFileSync(`worker/fixtures/${name}`, 'utf8')
}

const BLOCK = '<title>Letterboxd - Forbidden</title> Just a moment...'

describe('reading a watchlist page', () => {
  it('reads the slugs in order and sees the next page', () => {
    const read = readWatchlistPage(200, fixture('watchlist-next.200.html'))
    expect(read).toMatchObject({ hasNext: true })
    const slugs = (read as { slugs: string[] }).slugs
    expect(slugs).toHaveLength(5)
    expect(slugs[0]).toBe('possible-love')
    expect(slugs[1]).toBe('cameron-winter-at-carnegie-hall')
  })

  it('sees no next page on the last page', () => {
    const read = readWatchlistPage(200, fixture('watchlist-last.200.html'))
    expect(read).toMatchObject({ hasNext: false })
    expect((read as { slugs: string[] }).slugs).toHaveLength(3)
  })

  it('gives no slugs past the end and drops duplicates', () => {
    expect(readWatchlistPage(200, fixture('watchlist-past-end.200.html'))).toEqual({ slugs: [], hasNext: false })
    expect(readWatchlistPage(200, 'data-item-slug="a" data-item-slug="a" data-item-slug="b"')).toEqual({
      slugs: ['a', 'b'],
      hasNext: false,
    })
  })

  it('tells private, missing and unavailable apart', () => {
    expect(readWatchlistPage(403, fixture('watchlist-private.403.html'))).toBe('private')
    expect(readWatchlistPage(404, fixture('watchlist-missing.404.html'))).toBe('missing')
    expect(readWatchlistPage(403, BLOCK)).toBe('unavailable')
    expect(readWatchlistPage(404, BLOCK)).toBe('unavailable')
    expect(readWatchlistPage(503, '')).toBe('unavailable')
    expect(readWatchlistPage(500, '')).toBe('unavailable')
    expect(readWatchlistPage(null, '')).toBe('unavailable')
  })
})

describe('reading a list page', () => {
  it('reads page 1 with its next page and the last page', () => {
    const read = readListPage(200, fixture('list-next.200.html'))
    expect(read).toMatchObject({ hasNext: true, lastPage: 4 })
    const slugs = (read as { slugs: string[] }).slugs
    expect(slugs).toHaveLength(100)
    expect(new Set(slugs).size).toBe(100)
  })

  it('sees no next page on the last page', () => {
    const read = readListPage(200, fixture('list-last.200.html'))
    expect(read).toMatchObject({ hasNext: false, lastPage: 4 })
    expect((read as { slugs: string[] }).slugs).toHaveLength(73)
  })

  it('gives no slugs past the end but still the last page', () => {
    expect(readListPage(200, fixture('list-past-end.200.html'))).toEqual({ slugs: [], hasNext: false, lastPage: 4 })
  })

  it('reads the last page past an ellipsis and gives 1 without pagination', () => {
    expect(readListPage(200, fixture('watchlist-next.200.html'))).toMatchObject({ lastPage: 8 })
    expect(readListPage(200, '<a data-item-slug="a"></a>')).toEqual({ slugs: ['a'], hasNext: false, lastPage: 1 })
  })

  it('tells private, missing and unavailable apart', () => {
    expect(readListPage(404, fixture('list-missing.404.html'))).toBe('missing')
    expect(readListPage(403, fixture('watchlist-private.403.html'))).toBe('private')
    expect(readListPage(403, BLOCK)).toBe('unavailable')
    expect(readListPage(200, 'Just a moment...')).toBe('unavailable')
    expect(readListPage(500, '')).toBe('unavailable')
    expect(readListPage(null, '')).toBe('unavailable')
  })
})

describe('reading a film page', () => {
  it('gives the movie id', () => {
    expect(parseFilmTmdbId(fixture('film.200.html'))).toBe(496243)
  })

  it('gives null without a movie id', () => {
    expect(parseFilmTmdbId(fixture('film-no-tmdb-movie.200.html'))).toBeNull()
    expect(parseFilmTmdbId('<body data-tmdb-type="tv" data-tmdb-id="5">')).toBeNull()
  })
})

describe('the Letterboxd watchlist route', () => {
  const html = (name: string, status: number) => new Response(fixture(name), { status })

  it('fetches page 1 and page 3, lowercased, and caches a good answer for an hour', async () => {
    fetchMock.mockResolvedValueOnce(html('watchlist-next.200.html', 200))
    const res = await call('/lb/JoE/watchlist')
    expect(fetchMock.mock.calls[0][0]).toBe('https://letterboxd.com/joe/watchlist/')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    expect(await res.json()).toMatchObject({ hasNext: true })
    fetchMock.mockResolvedValueOnce(html('watchlist-last.200.html', 200))
    await call('/lb/joe/watchlist?page=3')
    expect(fetchMock.mock.calls[1][0]).toBe('https://letterboxd.com/joe/watchlist/page/3/')
  })

  it('answers the two 404s with no-store', async () => {
    fetchMock.mockResolvedValueOnce(html('watchlist-private.403.html', 403))
    let res = await call('/lb/joe/watchlist')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Watchlist is private' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    fetchMock.mockResolvedValueOnce(html('watchlist-missing.404.html', 404))
    res = await call('/lb/joe/watchlist')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No such watchlist' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('answers 502 with no-store for a block, a challenge, a 500 and a thrown fetch', async () => {
    fetchMock.mockResolvedValueOnce(new Response(BLOCK, { status: 403 }))
    fetchMock.mockResolvedValueOnce(new Response('Just a moment...', { status: 200 }))
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }))
    fetchMock.mockRejectedValueOnce(new Error('network'))
    for (let i = 0; i < 4; i++) {
      const res = await call('/lb/joe/watchlist')
      expect(res.status).toBe(502)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(await res.json()).toEqual({ error: 'Letterboxd could not be read' })
    }
  })

  it('answers 400 for a bad user or page without fetching', async () => {
    for (const path of [
      '/lb/a.b/watchlist',
      `/lb/${'a'.repeat(16)}/watchlist`,
      '/lb/joe/watchlist?page=0',
      '/lb/joe/watchlist?page=100',
      '/lb/joe/watchlist?page=x',
      '/lb/joe/watchlist?page=1.5',
    ]) {
      expect((await call(path)).status, path).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('counts against the Letterboxd budget', async () => {
    const { env, lb } = makeEnv()
    lb.mockResolvedValue({ success: false })
    expect((await call('/lb/joe/watchlist', { env })).status).toBe(429)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the Letterboxd list route', () => {
  const html = (name: string, status: number) => new Response(fixture(name), { status })
  const base = 'https://letterboxd.com/loreno/list/fff-movie-night-1/'

  it('fetches the right page, lowercases the user and caches a good answer for an hour', async () => {
    fetchMock.mockResolvedValueOnce(html('list-next.200.html', 200))
    const res = await call('/lb/LoReNo/list/fff-movie-night-1')
    expect(fetchMock.mock.calls[0][0]).toBe(base)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    expect(await res.json()).toMatchObject({ hasNext: true, lastPage: 4 })
    for (const [query, suffix] of [
      ['?page=1', ''],
      ['?page=3', 'page/3/'],
      ['?page=999', 'page/999/'],
    ]) {
      fetchMock.mockResolvedValueOnce(html('list-last.200.html', 200))
      await call(`/lb/loreno/list/fff-movie-night-1${query}`)
      expect(fetchMock.mock.calls.at(-1)![0]).toBe(base + suffix)
    }
  })

  it('answers the two 404s with no-store', async () => {
    fetchMock.mockResolvedValueOnce(html('watchlist-private.403.html', 403))
    let res = await call('/lb/loreno/list/fff-movie-night-1')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'List is private' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    fetchMock.mockResolvedValueOnce(html('list-missing.404.html', 404))
    res = await call('/lb/loreno/list/fff-movie-night-1')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No such list' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('answers 502 with no-store for a challenge, a 500 and a thrown fetch', async () => {
    fetchMock.mockResolvedValueOnce(new Response(BLOCK, { status: 403 }))
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }))
    fetchMock.mockRejectedValueOnce(new Error('network'))
    for (let i = 0; i < 3; i++) {
      const res = await call('/lb/loreno/list/fff-movie-night-1')
      expect(res.status).toBe(502)
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(await res.json()).toEqual({ error: 'Letterboxd could not be read' })
    }
  })

  it('answers 400 for a bad user, slug or page without fetching', async () => {
    for (const path of [
      '/lb/a.b/list/x',
      `/lb/${'a'.repeat(16)}/list/x`,
      '/lb/joe/list/Upper',
      '/lb/joe/list/a.b',
      `/lb/joe/list/${'a'.repeat(201)}`,
      '/lb/joe/list/x?page=0',
      '/lb/joe/list/x?page=1000',
      '/lb/joe/list/x?page=x',
    ]) {
      expect((await call(path)).status, path).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('counts against the Letterboxd budget and leaves the other routes alone', async () => {
    const { env, lb } = makeEnv()
    lb.mockResolvedValue({ success: false })
    expect((await call('/lb/joe/list/x', { env })).status).toBe(429)
    expect(fetchMock).not.toHaveBeenCalled()
    expect((await call('/lb/a/list/b/c')).status).toBe(404)
    await call('/lb/joe/watchlist')
    expect(fetchMock.mock.calls[0][0]).toBe('https://letterboxd.com/joe/watchlist/')
    await call('/lb/joe')
    expect(fetchMock.mock.calls[1][0]).toBe('https://letterboxd.com/joe/')
  })
})

describe('the Letterboxd film route', () => {
  it('answers the movie id, or null, with a week of cache', async () => {
    fetchMock.mockResolvedValueOnce(new Response(fixture('film.200.html'), { status: 200 }))
    let res = await call('/lb/film/parasite-2019')
    expect(fetchMock.mock.calls[0][0]).toBe('https://letterboxd.com/film/parasite-2019/')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800')
    expect(await res.json()).toEqual({ slug: 'parasite-2019', tmdbId: 496243 })
    fetchMock.mockResolvedValueOnce(new Response(fixture('film-no-tmdb-movie.200.html'), { status: 200 }))
    res = await call('/lb/film/some-show')
    expect(await res.json()).toEqual({ slug: 'some-show', tmdbId: null })
  })

  it('answers 404 for an unknown film and 502 otherwise', async () => {
    fetchMock.mockResolvedValueOnce(new Response(fixture('film-missing.404.html'), { status: 404 }))
    let res = await call('/lb/film/zz-none')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No such film' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    fetchMock.mockResolvedValueOnce(new Response(BLOCK, { status: 403 }))
    res = await call('/lb/film/zz-none')
    expect(res.status).toBe(502)
    fetchMock.mockRejectedValueOnce(new Error('network'))
    expect((await call('/lb/film/zz-none')).status).toBe(502)
  })

  it('answers 400 for a bad slug without fetching', async () => {
    for (const path of ['/lb/film/Bad_Slug', '/lb/film/-a', '/lb/film/a--b', `/lb/film/${'a'.repeat(201)}`]) {
      expect((await call(path)).status, path).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats /lb/film/watchlist as a film and leaves the other routes alone', async () => {
    fetchMock.mockResolvedValueOnce(new Response(fixture('film.200.html'), { status: 200 }))
    await call('/lb/film/watchlist')
    expect(fetchMock.mock.calls[0][0]).toBe('https://letterboxd.com/film/watchlist/')
    fetchMock.mockClear()
    expect((await call('/lb/a/b/c')).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('reading a TMDB redirect', () => {
  it('gives the slug for every redirect status, absolute or relative', () => {
    for (const status of [301, 302, 303, 307, 308]) {
      expect(readTmdbRedirect(status, '/film/parasite-2019/', '')).toBe('parasite-2019')
      expect(readTmdbRedirect(status, 'https://letterboxd.com/film/parasite-2019/', '')).toBe('parasite-2019')
    }
  })

  it('calls the import page missing', () => {
    expect(readTmdbRedirect(200, null, fixture('tmdb-import-result.200.html'))).toBe('missing')
  })

  it('calls everything else unavailable', () => {
    expect(readTmdbRedirect(200, null, fixture('film.200.html'))).toBe('unavailable')
    expect(readTmdbRedirect(302, 'https://example.com/film/a/', '')).toBe('unavailable')
    expect(readTmdbRedirect(302, 'http://letterboxd.com/film/a/', '')).toBe('unavailable')
    expect(readTmdbRedirect(302, '/film/Bad_Slug/', '')).toBe('unavailable')
    expect(readTmdbRedirect(302, '/film/a/crew/', '')).toBe('unavailable')
    expect(readTmdbRedirect(302, '/film/a', '')).toBe('unavailable')
    expect(readTmdbRedirect(302, null, '')).toBe('unavailable')
    expect(readTmdbRedirect(403, null, BLOCK)).toBe('unavailable')
    expect(readTmdbRedirect(200, null, `Just a moment ${fixture('tmdb-import-result.200.html')}`)).toBe('unavailable')
    expect(readTmdbRedirect(500, null, '')).toBe('unavailable')
    expect(readTmdbRedirect(null, null, '')).toBe('unavailable')
  })
})

describe('the Letterboxd film-by-TMDB route', () => {
  it('answers the slug with a week of cache, not following redirects', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/film/parasite-2019/' } }))
    const res = await call('/lb/film-by-tmdb/496243')
    expect(fetchMock.mock.calls[0][0]).toBe('https://letterboxd.com/tmdb/496243/')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800')
    expect(await res.json()).toEqual({ tmdbId: 496243, slug: 'parasite-2019' })
  })

  it('answers 404 for an id with no film and 502 otherwise, uncached', async () => {
    fetchMock.mockResolvedValueOnce(new Response(fixture('tmdb-import-result.200.html'), { status: 200 }))
    let res = await call('/lb/film-by-tmdb/999999999')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No such film' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    fetchMock.mockResolvedValueOnce(new Response(BLOCK, { status: 403 }))
    res = await call('/lb/film-by-tmdb/1')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Letterboxd could not be read' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    fetchMock.mockRejectedValueOnce(new Error('network'))
    expect((await call('/lb/film-by-tmdb/1')).status).toBe(502)
  })

  it('answers 400 for a bad id without fetching, and 404 with no id', async () => {
    for (const path of ['/lb/film-by-tmdb/abc', '/lb/film-by-tmdb/12345678901', '/lb/film-by-tmdb/watchlist']) {
      expect((await call(path)).status, path).toBe(400)
    }
    expect((await call('/lb/film-by-tmdb/')).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('counts against the Letterboxd limit', async () => {
    const { env, lb } = makeEnv()
    lb.mockResolvedValue({ success: false })
    expect((await call('/lb/film-by-tmdb/1', { env })).status).toBe(429)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
