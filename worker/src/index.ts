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

/** Fetches a Letterboxd page as the probe and the profile check do; a failed fetch gives a null status. */
async function fetchLetterboxd(
  url: string,
  redirect: 'follow' | 'manual' = 'follow',
): Promise<{ status: number | null; body: string; location: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; movie-nite/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
      redirect,
    })
    return { status: res.status, body: await res.text(), location: res.headers.get('Location') }
  } catch {
    return { status: null, body: '', location: null }
  }
}

async function probeLetterboxd(cors: Record<string, string>): Promise<Response> {
  const { status, body } = await fetchLetterboxd(LETTERBOXD_PROFILE)
  const ok = status === 200 && !looksChallenged(status, body)
  return json({ ok, status, challenged: looksChallenged(status, body) }, 200, {
    ...cors,
    'Cache-Control': 'no-store',
  })
}

/** Whether a Letterboxd profile exists: found, missing (an unchallenged 404), or a 502 for anything else. */
async function checkProfile(user: string, cors: Record<string, string>): Promise<Response> {
  const username = user.toLowerCase()
  const { status, body } = await fetchLetterboxd(`https://letterboxd.com/${username}/`)
  if (status === 200 && !looksChallenged(status, body)) {
    return json({ username }, 200, { ...cors, 'Cache-Control': 'public, max-age=3600' })
  }
  if (status === 404 && !looksChallenged(status, body)) return failure(404, 'No such profile', cors)
  return failure(502, 'Letterboxd could not be checked', cors)
}

export type WatchlistRead = { slugs: string[]; hasNext: boolean } | 'private' | 'missing' | 'unavailable'

/** The film slugs of a Letterboxd page in page order without duplicates, and whether a live next link is present. */
function readFilmItems(html: string): { slugs: string[]; hasNext: boolean } {
  const slugs: string[] = []
  for (const m of html.matchAll(/data-item-slug="([^"]+)"/g)) {
    if (!slugs.includes(m[1])) slugs.push(m[1])
  }
  return { slugs, hasNext: /<a class="next"/.test(html) }
}

/** Sorts a Letterboxd page's status into private (a 403 that is not a bot challenge), missing (a 404) and unavailable. */
function readPageStatus(status: number | null, html: string): 'private' | 'missing' | 'unavailable' | null {
  if (status === null || /just a moment|cf-chl/i.test(html)) return 'unavailable'
  if (status === 403) return 'private'
  if (status === 404) return 'missing'
  if (status !== 200) return 'unavailable'
  return null
}

/**
 * Reads one Letterboxd watchlist page: its film slugs in page order and whether a next page is linked.
 * A 403 that is not a bot challenge is a private watchlist (Letterboxd sends the same "classified" page as for a block),
 * an unchallenged 404 is a missing one, and anything else is unavailable.
 */
export function readWatchlistPage(status: number | null, html: string): WatchlistRead {
  return readPageStatus(status, html) ?? readFilmItems(html)
}

export type ListRead = { slugs: string[]; hasNext: boolean; lastPage: number } | 'private' | 'missing' | 'unavailable'

/**
 * Reads one Letterboxd list page like a watchlist page, plus the list's last page: the highest number in the page's
 * paginate-pages block (Letterboxd keeps it on a page past the end), or 1 when the page has none.
 */
export function readListPage(status: number | null, html: string): ListRead {
  const failed = readPageStatus(status, html)
  if (failed) return failed
  const block = /<div class="paginate-pages">([\s\S]*?)<\/ul>/.exec(html)
  let lastPage = 1
  if (block) {
    for (const m of block[1].matchAll(/<li class="paginate-page[^"]*">\s*<(?:a [^>]*|span)>(\d+)</g)) {
      lastPage = Math.max(lastPage, Number(m[1]))
    }
  }
  return { ...readFilmItems(html), lastPage }
}

/** The TMDB id of a Letterboxd film page, only when the page says it is a movie. */
export function parseFilmTmdbId(html: string): number | null {
  if (!/data-tmdb-type="movie"/.test(html)) return null
  const id = /data-tmdb-id="(\d+)"/.exec(html)
  return id ? Number(id[1]) : null
}

/** One page of a viewer's watchlist: 200 with slugs, 404 for a private or missing one, 502 when unreadable. */
async function watchlistPage(user: string, page: number, cors: Record<string, string>): Promise<Response> {
  const username = user.toLowerCase()
  const path = page === 1 ? 'watchlist/' : `watchlist/page/${page}/`
  const { status, body } = await fetchLetterboxd(`https://letterboxd.com/${username}/${path}`)
  const read = readWatchlistPage(status, body)
  if (read === 'private') return failure(404, 'Watchlist is private', cors)
  if (read === 'missing') return failure(404, 'No such watchlist', cors)
  if (read === 'unavailable') return failure(502, 'Letterboxd could not be read', cors)
  return json(read, 200, { ...cors, 'Cache-Control': 'public, max-age=3600' })
}

/** One page of a Letterboxd list: 200 with slugs and the last page, 404 for a private or missing one, 502 when unreadable. */
async function listPage(user: string, slug: string, page: number, cors: Record<string, string>): Promise<Response> {
  const username = user.toLowerCase()
  const path = page === 1 ? '' : `page/${page}/`
  const { status, body } = await fetchLetterboxd(`https://letterboxd.com/${username}/list/${slug}/${path}`)
  const read = readListPage(status, body)
  if (read === 'private') return failure(404, 'List is private', cors)
  if (read === 'missing') return failure(404, 'No such list', cors)
  if (read === 'unavailable') return failure(502, 'Letterboxd could not be read', cors)
  return json(read, 200, { ...cors, 'Cache-Control': 'public, max-age=3600' })
}

/** A film's TMDB id from its Letterboxd page: 200 with the id (or null), 404 when unknown, 502 when unreadable. */
async function filmLookup(slug: string, cors: Record<string, string>): Promise<Response> {
  const { status, body } = await fetchLetterboxd(`https://letterboxd.com/film/${slug}/`)
  if (status === 200 && !looksChallenged(status, body)) {
    return json({ slug, tmdbId: parseFilmTmdbId(body) }, 200, { ...cors, 'Cache-Control': 'public, max-age=604800' })
  }
  if (status === 404 && !looksChallenged(status, body)) return failure(404, 'No such film', cors)
  return failure(502, 'Letterboxd could not be read', cors)
}

const FILM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type TmdbRedirectRead = string | 'missing' | 'unavailable'

/**
 * Reads Letterboxd's answer for a TMDB id, fetched without following redirects: a redirect to /film/<slug>/ gives the slug,
 * an unchallenged 200 "TMDB Import Result" page means Letterboxd has no film for the id, and anything else is unavailable.
 */
export function readTmdbRedirect(status: number | null, location: string | null, html: string): TmdbRedirectRead {
  if (status === null || looksChallenged(status, html)) return 'unavailable'
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
    if (!location) return 'unavailable'
    let target: URL
    try {
      target = new URL(location, 'https://letterboxd.com/')
    } catch {
      return 'unavailable'
    }
    if (target.protocol !== 'https:' || target.hostname !== 'letterboxd.com') return 'unavailable'
    const m = /^\/film\/([^/]+)\/$/.exec(target.pathname)
    return m && m[1].length <= 200 && FILM_SLUG.test(m[1]) ? m[1] : 'unavailable'
  }
  if (status === 200 && /<title>[^<]*TMDB Import Result/i.test(html)) return 'missing'
  return 'unavailable'
}

/** A film's Letterboxd slug from its TMDB id: 200 with the slug, 404 when Letterboxd has no film, 502 when unreadable. */
async function filmByTmdb(id: string, cors: Record<string, string>): Promise<Response> {
  const { status, body, location } = await fetchLetterboxd(`https://letterboxd.com/tmdb/${id}/`, 'manual')
  const read = readTmdbRedirect(status, location, body)
  if (read === 'missing') return failure(404, 'No such film', cors)
  if (read === 'unavailable') return failure(502, 'Letterboxd could not be read', cors)
  return json({ tmdbId: Number(id), slug: read }, 200, { ...cors, 'Cache-Control': 'public, max-age=604800' })
}

function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

const IDS = /^\d{1,10}(?:[,|]\d{1,10}){0,19}$/

/** The discover parameters the Worker relays, each with its check; anything else is refused. */
const DISCOVER_PARAMS: Record<string, (value: string) => boolean> = {
  with_genres: (v) => IDS.test(v),
  with_keywords: (v) => IDS.test(v),
  with_original_language: (v) => /^[a-z]{2}$/.test(v),
  'primary_release_date.gte': isRealDate,
  'primary_release_date.lte': isRealDate,
  'vote_average.gte': (v) => /^(?:\d|10)(?:\.\d{1,2})?$/.test(v) && Number(v) <= 10,
  'vote_average.lte': (v) => /^(?:\d|10)(?:\.\d{1,2})?$/.test(v) && Number(v) <= 10,
  'vote_count.gte': (v) => /^\d{1,6}$/.test(v),
  page: (v) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 500,
}

/** The TMDB discover address for a request's query, or the name of the first parameter that is not allowed. */
function discoverAddress(query: URLSearchParams): { address: string } | { bad: string } {
  const out = new URLSearchParams()
  for (const name of new Set(query.keys())) {
    const values = query.getAll(name)
    const check = Object.hasOwn(DISCOVER_PARAMS, name) ? DISCOVER_PARAMS[name] : null
    if (!check || values.length !== 1 || !check(values[0])) return { bad: name }
    out.set(name, values[0])
  }
  out.set('include_adult', 'false')
  out.set('include_video', 'false')
  return { address: `${TMDB_API}/discover/movie?${out}` }
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
    if (path === '/tmdb/discover') {
      const built = discoverAddress(url.searchParams)
      if ('bad' in built) return failure(400, `Bad discover parameter: ${built.bad}`, cors)
      return relayTmdb(built.address, env, 3600, cors)
    }
    const film = /^\/tmdb\/movie\/([^/]+)$/.exec(path)
    if (film) {
      if (!/^\d+$/.test(film[1])) return failure(400, 'A numeric film id is needed', cors)
      return relayTmdb(`${TMDB_API}/movie/${film[1]}`, env, 86400, cors)
    }
    if (path === '/lb/probe') return probeLetterboxd(cors)
    const byTmdb = /^\/lb\/film-by-tmdb\/([^/]+)$/.exec(path)
    if (byTmdb) {
      if (!/^\d{1,10}$/.test(byTmdb[1])) return failure(400, 'A numeric film id is needed', cors)
      return filmByTmdb(byTmdb[1], cors)
    }
    const filmPage = /^\/lb\/film\/([^/]+)$/.exec(path)
    if (filmPage) {
      if (filmPage[1].length > 200 || !FILM_SLUG.test(filmPage[1])) {
        return failure(400, 'A Letterboxd film slug is needed', cors)
      }
      return filmLookup(filmPage[1], cors)
    }
    const watchlist = /^\/lb\/([^/]+)\/watchlist$/.exec(path)
    if (watchlist) {
      if (!/^[A-Za-z0-9_]{1,15}$/.test(watchlist[1])) return failure(400, 'A Letterboxd username is needed', cors)
      const raw = url.searchParams.get('page') ?? '1'
      const page = /^\d{1,2}$/.test(raw) ? Number(raw) : 0
      if (page < 1 || page > 99) return failure(400, 'A page from 1 to 99 is needed', cors)
      return watchlistPage(watchlist[1], page, cors)
    }
    const list = /^\/lb\/([^/]+)\/list\/([^/]+)$/.exec(path)
    if (list) {
      if (!/^[A-Za-z0-9_]{1,15}$/.test(list[1])) return failure(400, 'A Letterboxd username is needed', cors)
      if (list[2].length > 200 || !FILM_SLUG.test(list[2])) return failure(400, 'A Letterboxd list slug is needed', cors)
      const raw = url.searchParams.get('page') ?? '1'
      const page = /^\d{1,3}$/.test(raw) ? Number(raw) : 0
      if (page < 1 || page > 999) return failure(400, 'A page from 1 to 999 is needed', cors)
      return listPage(list[1], list[2], page, cors)
    }
    const profile = /^\/lb\/([^/]+)$/.exec(path)
    if (profile) {
      if (!/^[A-Za-z0-9_]{1,15}$/.test(profile[1])) return failure(400, 'A Letterboxd username is needed', cors)
      return checkProfile(profile[1], cors)
    }
    return failure(404, 'Not found', cors)
  },
} satisfies ExportedHandler<Env>
