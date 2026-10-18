export interface Env {
  TMDB_TOKEN: string
  TMDB_LIMIT: RateLimit
  LB_LIMIT: RateLimit
}

const TMDB_API = 'https://api.themoviedb.org/3'
const LETTERBOXD_PROFILE = 'https://letterboxd.com/loreno/'
const SITE_ORIGIN = 'https://d-mayo.github.io'
const FALLBACK_KEY = 'local'

/** Whether a request's Origin is one of movie-nite's own: the live site, or a local or LAN dev page. */
export function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false
  if (origin === SITE_ORIGIN) return true
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (origin !== url.origin) return false
  const host = url.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/** Whether a response looks like a bot challenge rather than the page asked for. */
export function looksChallenged(status: number | null, body: string): boolean {
  if (status === 403 || status === 503) return true
  return /just a moment|cf-chl/i.test(body)
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function failure(status: number, error: string, cors: Record<string, string>): Response {
  return json({ error }, status, { ...cors, 'Cache-Control': 'no-store' })
}

async function relayTmdb(url: string, env: Env, maxAge: number, cors: Record<string, string>): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${env.TMDB_TOKEN}`, Accept: 'application/json' },
    })
  } catch {
    return failure(502, 'TMDB could not be reached', cors)
  }
  if (!upstream.ok) return failure(502, 'TMDB did not answer', cors)
  return new Response(await upstream.text(), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAge}`,
      ...cors,
    },
  })
}

async function probeLetterboxd(cors: Record<string, string>): Promise<Response> {
  let status: number | null = null
  let body = ''
  try {
    const res = await fetch(LETTERBOXD_PROFILE, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; movie-nite/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    status = res.status
    body = await res.text()
  } catch {
    // a failed fetch leaves the status null
  }
  const ok = status === 200 && !looksChallenged(status, body)
  return json({ ok, status, challenged: looksChallenged(status, body) }, 200, {
    ...cors,
    'Cache-Control': 'no-store',
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    if (!isAllowedOrigin(origin)) return new Response('Forbidden', { status: 403 })
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } })
    }
    if (request.method !== 'GET') return failure(405, 'Method not allowed', cors)

    const url = new URL(request.url)
    const path = url.pathname
    const isTmdb = path.startsWith('/tmdb/')
    const isLb = path.startsWith('/lb/')
    if (!isTmdb && !isLb) return failure(404, 'Not found', cors)

    const key = request.headers.get('CF-Connecting-IP') || FALLBACK_KEY
    const { success } = await (isTmdb ? env.TMDB_LIMIT : env.LB_LIMIT).limit({ key })
    if (!success) return failure(429, 'Too many requests', cors)

    if (path === '/tmdb/search') {
      const query = url.searchParams.get('query')?.trim()
      if (!query) return failure(400, 'A query is needed', cors)
      return relayTmdb(
        `${TMDB_API}/search/movie?query=${encodeURIComponent(query)}&include_adult=false`,
        env,
        3600,
        cors,
      )
    }
    const film = /^\/tmdb\/movie\/([^/]+)$/.exec(path)
    if (film) {
      if (!/^\d+$/.test(film[1])) return failure(400, 'A numeric film id is needed', cors)
      return relayTmdb(`${TMDB_API}/movie/${film[1]}`, env, 86400, cors)
    }
    if (path === '/lb/probe') return probeLetterboxd(cors)
    return failure(404, 'Not found', cors)
  },
} satisfies ExportedHandler<Env>
