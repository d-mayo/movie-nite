import type { Nomination } from '../state/model.ts'

const imageBase = 'https://image.tmdb.org/t/p'

export interface SearchResult {
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null
}

export interface TmdbClient {
  searchMovies(query: string, signal?: AbortSignal): Promise<SearchResult[]>
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

  return {
    async searchMovies(query, signal) {
      const body = (await get(
        `/tmdb/search?query=${encodeURIComponent(query)}`,
        signal,
      )) as {
        results: {
          id: number
          title: string
          release_date?: string
          poster_path?: string | null
        }[]
      }
      return body.results.map((r) => ({
        tmdbId: r.id,
        title: r.title,
        year: yearOf(r.release_date),
        posterPath: r.poster_path ?? null,
      }))
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
