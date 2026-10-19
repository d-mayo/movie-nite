export type ProfileCheck = 'found' | 'missing' | 'unavailable'

export interface WatchlistPage {
  slugs: string[]
  hasNext: boolean
}

export type WatchlistPageResult = WatchlistPage | 'private' | 'missing' | 'unavailable'

export interface ListPage {
  slugs: string[]
  hasNext: boolean
  lastPage: number
}

export type ListPageResult = ListPage | 'private' | 'missing' | 'unavailable'

export interface LetterboxdClient {
  checkProfile(username: string, signal?: AbortSignal): Promise<ProfileCheck>
  watchlistPage(username: string, page: number, signal?: AbortSignal): Promise<WatchlistPageResult>
  /** One page (100 films) of a user's list, with the list's last page. */
  listPage(username: string, slug: string, page: number, signal?: AbortSignal): Promise<ListPageResult>
  /** The film's TMDB id, null when it is not a film the app can nominate, or unavailable. */
  filmTmdbId(slug: string, signal?: AbortSignal): Promise<number | null | 'unavailable'>
  /** The film's Letterboxd slug for a TMDB id, null when Letterboxd has no such film, or unavailable. */
  filmSlug(tmdbId: number, signal?: AbortSignal): Promise<string | null | 'unavailable'>
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')
}

// The Worker's `/lb/<user>` route: found only when it names the user asked for, missing only on its
// own "No such profile" 404 (so a route it doesn't know never reads as missing), else unavailable.
// The watchlist and film routes are read the same way, only from the Worker's own bodies.
export function createLetterboxdClient(
  apiBase: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): LetterboxdClient {
  async function get(path: string, signal?: AbortSignal, cache?: RequestCache) {
    const response = await fetchFn(`${apiBase}${path}`, { headers: { Accept: 'application/json' }, signal, cache })
    const body = (await response.json()) as Record<string, unknown> | null
    return { status: response.status, body }
  }

  return {
    async checkProfile(username, signal) {
      try {
        const { status, body } = await get(`/lb/${encodeURIComponent(username)}`, signal)
        if (status === 200 && body?.username === username) return 'found'
        if (status === 404 && body?.error === 'No such profile') return 'missing'
        return 'unavailable'
      } catch (error) {
        if (isAbort(error, signal)) throw error
        return 'unavailable'
      }
    },

    async watchlistPage(username, page, signal) {
      try {
        // Revalidated every time, so a watchlist filled since the last look isn't hidden by the browser's hour-long cache.
        const { status, body } = await get(`/lb/${encodeURIComponent(username)}/watchlist?page=${page}`, signal, 'no-cache')
        if (status === 200 && Array.isArray(body?.slugs) && typeof body.hasNext === 'boolean') {
          const slugs = body.slugs
          if (slugs.every((slug): slug is string => typeof slug === 'string')) {
            return { slugs, hasNext: body.hasNext }
          }
        }
        if (status === 404 && body?.error === 'Watchlist is private') return 'private'
        if (status === 404 && body?.error === 'No such watchlist') return 'missing'
        return 'unavailable'
      } catch (error) {
        if (isAbort(error, signal)) throw error
        return 'unavailable'
      }
    },

    async listPage(username, slug, page, signal) {
      try {
        // The browser's normal cache serves it: a list an hour stale loses nothing.
        const { status, body } = await get(
          `/lb/${encodeURIComponent(username)}/list/${encodeURIComponent(slug)}?page=${page}`,
          signal,
        )
        if (
          status === 200 &&
          Array.isArray(body?.slugs) &&
          typeof body.hasNext === 'boolean' &&
          typeof body.lastPage === 'number'
        ) {
          const slugs = body.slugs
          if (slugs.every((s): s is string => typeof s === 'string')) {
            return { slugs, hasNext: body.hasNext, lastPage: body.lastPage }
          }
        }
        if (status === 404 && body?.error === 'List is private') return 'private'
        if (status === 404 && body?.error === 'No such list') return 'missing'
        return 'unavailable'
      } catch (error) {
        if (isAbort(error, signal)) throw error
        return 'unavailable'
      }
    },

    async filmTmdbId(slug, signal) {
      try {
        const { status, body } = await get(`/lb/film/${encodeURIComponent(slug)}`, signal)
        if (status === 200 && body?.slug === slug) {
          if (typeof body.tmdbId === 'number') return body.tmdbId
          if (body.tmdbId === null) return null
        }
        if (status === 404 && body?.error === 'No such film') return null
        return 'unavailable'
      } catch (error) {
        if (isAbort(error, signal)) throw error
        return 'unavailable'
      }
    },

    async filmSlug(tmdbId, signal) {
      try {
        const { status, body } = await get(`/lb/film-by-tmdb/${tmdbId}`, signal)
        if (status === 200 && body?.tmdbId === tmdbId && typeof body.slug === 'string' && SLUG.test(body.slug)) {
          return body.slug
        }
        if (status === 404 && body?.error === 'No such film') return null
        return 'unavailable'
      } catch (error) {
        if (isAbort(error, signal)) throw error
        return 'unavailable'
      }
    },
  }
}
