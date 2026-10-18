import type { LetterboxdClient } from './client.ts'

/** The most watchlist pages a walk reads: 20 pages of 28 films, the newest additions. */
export const MAX_WATCHLIST_PAGES = 20

export type DrawResult = number | 'empty' | 'exhausted' | 'private' | 'missing' | 'unavailable'

type Walk = string[] | 'private' | 'missing' | 'unavailable'

/** What a session remembers: each username's walked slugs and each slug's TMDB id (null: not a film to nominate). */
export interface WatchlistMemory {
  walks: Map<string, Promise<Walk>>
  ids: Map<string, number | null>
  // The TMDB id each viewer's current film was drawn as, so Re-roll shows only for a film that came from a draw.
  drawn: Map<string, number>
}

export function createWatchlistMemory(): WatchlistMemory {
  return { walks: new Map(), ids: new Map(), drawn: new Map() }
}

async function walk(client: LetterboxdClient, username: string): Promise<Walk> {
  const slugs: string[] = []
  for (let page = 1; page <= MAX_WATCHLIST_PAGES; page++) {
    const result = await client.watchlistPage(username, page)
    if (typeof result === 'string') return result
    for (const slug of result.slugs) if (!slugs.includes(slug)) slugs.push(slug)
    if (!result.hasNext) break
  }
  return slugs
}

/**
 * A film drawn uniformly from the viewer's watchlist, as a TMDB id, skipping films that are not movies and the
 * excluded ids. The walk is kept per username unless it failed, and shared by draws that overlap. It takes no abort:
 * a walk that has begun finishes, so the next draw is quick.
 */
export async function drawFromWatchlist(options: {
  client: LetterboxdClient
  memory: WatchlistMemory
  username: string
  excluded: ReadonlySet<number>
  random: () => number
}): Promise<DrawResult> {
  const { client, memory, excluded, random } = options
  const username = options.username.toLowerCase()
  let walking = memory.walks.get(username)
  if (!walking) {
    walking = walk(client, username)
    memory.walks.set(username, walking)
  }
  const walked = await walking
  if (typeof walked === 'string') {
    if (memory.walks.get(username) === walking) memory.walks.delete(username)
    return walked
  }
  if (walked.length === 0) return 'empty'

  const remaining = [...walked]
  while (remaining.length > 0) {
    const slug = remaining.splice(Math.floor(random() * remaining.length), 1)[0]
    let id = memory.ids.get(slug)
    if (id === undefined) {
      const found = await client.filmTmdbId(slug)
      if (found === 'unavailable') return 'unavailable'
      memory.ids.set(slug, found)
      id = found
    }
    if (id !== null && !excluded.has(id)) return id
  }
  return 'exhausted'
}

/** What the panel needs to draw: the Worker client, the session's memory and the random source. */
export interface WatchlistSource {
  client: LetterboxdClient
  memory: WatchlistMemory
  random: () => number
}
