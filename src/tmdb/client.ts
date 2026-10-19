import type { Nomination } from '../state/model.ts'

const imageBase = 'https://image.tmdb.org/t/p'

export interface SearchResult {
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null
}

/** The discover parameters the Worker relays, by TMDB's names; the Worker validates each and adds the adult and video flags. */
export interface DiscoverParams {
  with_genres?: string
  with_keywords?: string
  with_original_language?: string
  'primary_release_date.gte'?: string
  'primary_release_date.lte'?: string
  'vote_average.gte'?: number
  'vote_average.lte'?: number
  'vote_count.gte'?: number
  page?: number
}

export interface DiscoverPage {
  page: number
  totalPages: number
  results: SearchResult[]
}

// TMDB serves no discover page past 500.
const MAX_DISCOVER_PAGES = 500

const DISCOVER_NAMES: (keyof DiscoverParams)[] = [
  'with_genres',
  'with_keywords',
  'with_original_language',
  'primary_release_date.gte',
  'primary_release_date.lte',
  'vote_average.gte',
  'vote_average.lte',
  'vote_count.gte',
  'page',
]

export interface TmdbClient {
  searchMovies(query: string, signal?: AbortSignal): Promise<SearchResult[]>
  discoverMovies(params: DiscoverParams, signal?: AbortSignal): Promise<DiscoverPage>
  getMovie(id: number): Promise<Nomination>
}

function yearOf(releaseDate: unknown): number | null {
  if (typeof releaseDate !== 'string') return null
  const year = Number.parseInt(releaseDate.slice(0, 4), 10)
  return Number.isNaN(year) ? null : year
}

export function posterUrl(path: string, size = 'w92'): string {
  return `${imageBase}/${size}${path}`
}

// Where the Worker lives: VITE_API_BASE when set, else port 8787 on the page's own host (dev, LAN).
export function defaultApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE
  if (configured) return configured
  return `${window.location.protocol}//${window.location.hostname}:8787`
}

export function createTmdbClient(
  apiBase: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): TmdbClient {
  async function get(path: string, signal?: AbortSignal): Promise<unknown> {
    let response: Response
    try {
      response = await fetchFn(`${apiBase}${path}`, {
        headers: { Accept: 'application/json' },
        signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
      throw new Error('Could not reach the film service', { cause: error })
    }
    if (!response.ok) throw new Error(`The film service answered ${response.status}`)
    return response.json()
  }

  type RawResult = { id: number; title: string; release_date?: string; poster_path?: string | null }
  const toResult = (r: RawResult): SearchResult => ({
    tmdbId: r.id,
    title: r.title,
    year: yearOf(r.release_date),
    posterPath: r.poster_path ?? null,
  })

  return {
    async searchMovies(query, signal) {
      const body = (await get(`/tmdb/search?query=${encodeURIComponent(query)}`, signal)) as { results: RawResult[] }
      return body.results.map(toResult)
    },

    async discoverMovies(params, signal) {
      const query = new URLSearchParams()
      for (const name of DISCOVER_NAMES) {
        const value = params[name]
        if (value !== undefined) query.set(name, String(value))
      }
      const body = (await get(`/tmdb/discover?${query}`, signal)) as {
        page: number
        total_pages: number
        results: RawResult[]
      }
      return {
        page: body.page,
        totalPages: Math.min(body.total_pages, MAX_DISCOVER_PAGES),
        results: body.results.map(toResult),
      }
    },

    async getMovie(id) {
      const m = (await get(`/tmdb/movie/${id}`)) as {
        id: number
        title: string
        release_date?: string
        poster_path?: string | null
        overview?: string
        runtime?: number | null
        genres?: { name: string }[]
      }
      return {
        tmdbId: m.id,
        title: m.title,
        year: yearOf(m.release_date),
        posterPath: m.poster_path ?? null,
        overview: m.overview ?? '',
        runtime: m.runtime || null,
        genres: (m.genres ?? []).map((g) => g.name),
      }
    },
  }
}
