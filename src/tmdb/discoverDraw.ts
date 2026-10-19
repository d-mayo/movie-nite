import type { Nomination } from '../state/model.ts'
import type { DiscoverParams, SearchResult, TmdbClient } from './client.ts'

// A draw's films, or why there are none: the film service failed, or it found nothing to offer.
export type FilmsResult = Nomination[] | 'unavailable' | 'none'

export const maxCanFilms = 3

// The words for a draw that found no film, as a movie card shows them.
export function filmsMessage(result: Exclude<FilmsResult, Nomination[]>): string {
  return result === 'none' ? 'No films turned up for this card.' : 'Film search is unavailable right now.'
}

// The details of each film, in order; a film whose details fail is dropped.
export async function loadFilms(client: TmdbClient, ids: number[]): Promise<Nomination[]> {
  const loaded = await Promise.all(ids.map((id) => client.getMovie(id).catch(() => null)))
  return loaded.filter((film): film is Nomination => film !== null)
}

// Up to `count` of the results not excluded, in a random order.
function pickFrom(results: SearchResult[], excluded: ReadonlySet<number>, count: number, random: () => number): number[] {
  const pool = results.filter((r) => !excluded.has(r.tmdbId)).map((r) => r.tmdbId)
  const picked: number[] = []
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  }
  return picked
}

/**
 * Up to three films for a discover card, details loaded. Page 1 gives the page count, then a random page from 1 to
 * that count gives the films, filled from page 1 when it has too few that are not excluded. A film whose details
 * fail is dropped; with none left the draw failed (or found nothing).
 */
export async function drawDiscoverFilms(options: {
  client: TmdbClient
  params: DiscoverParams
  excluded: ReadonlySet<number>
  random: () => number
  signal?: AbortSignal
}): Promise<FilmsResult> {
  const { client, params, excluded, random, signal } = options
  let first
  try {
    first = await client.discoverMovies({ ...params, page: 1 }, signal)
  } catch {
    return 'unavailable'
  }
  const page = 1 + Math.min(first.totalPages - 1, Math.floor(random() * first.totalPages))
  let ids: number[] = []
  if (page > 1) {
    try {
      const chosen = await client.discoverMovies({ ...params, page }, signal)
      ids = pickFrom(chosen.results, excluded, maxCanFilms, random)
    } catch {
      // The random page failed: page 1 still has films.
    }
  }
  if (ids.length < maxCanFilms) {
    const taken = new Set([...excluded, ...ids])
    ids = [...ids, ...pickFrom(first.results, taken, maxCanFilms - ids.length, random)]
  }
  if (ids.length === 0) return 'none'
  const films = await loadFilms(client, ids)
  return films.length > 0 ? films : 'unavailable'
}
