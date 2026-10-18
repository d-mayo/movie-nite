import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import worker, { isAllowedOrigin, type Env } from './index.ts'

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
