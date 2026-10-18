import type { LetterboxdClient } from './client.ts'

/** The most watchlist pages a walk reads: 20 pages of 28 films, the newest additions. */
export const MAX_WATCHLIST_PAGES = 20

export type DrawResult = number | 'empty' | 'exhausted' | 'private' | 'missing' | 'unavailable'

type Walk = string[] | 'private' | 'missing' | 'unavailable'

/**
 * What a session remembers: each username's walk (kept unless it failed or came back empty), each slug's TMDB id
 * (null: not a film to nominate), each username's settled walk (every successful one, empty included, for the
 * overlap label), each TMDB id's Letterboxd slug (null: Letterboxd has no film) and who is listening for settled walks.
 */
export interface WatchlistMemory {
  walks: Map<string, Promise<Walk>>
  ids: Map<string, number | null>
  settled: Map<string, readonly string[]>
  slugs: Map<number, string | null>
  listeners: Set<() => void>
}

export function createWatchlistMemory(): WatchlistMemory {
  return { walks: new Map(), ids: new Map(), settled: new Map(), slugs: new Map(), listeners: new Set() }
}

/** Calls `listener` whenever a walk settles into the memory; returns the way to stop. */
export function subscribeToSettled(memory: WatchlistMemory, listener: () => void): () => void {
  memory.listeners.add(listener)
  return () => memory.listeners.delete(listener)
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
 * The username's walk, started if none is kept and shared by whoever asks while it runs. A successful walk is
 * recorded as settled at once; an empty or failed one is not kept, so the next draw walks again. It takes no abort:
 * a walk that has begun finishes.
 */
export function ensureWalk(client: LetterboxdClient, memory: WatchlistMemory, username: string): Promise<Walk> {
  let walking = memory.walks.get(username)
  if (!walking) {
    const started: Promise<Walk> = walk(client, username).then((walked) => {
      if (typeof walked !== 'string') {
        memory.settled.set(username, walked)
        for (const listener of [...memory.listeners]) listener()
      }
      // Not kept when failed, or empty: a watchlist that is empty now may be filled before the next press.
      if ((typeof walked === 'string' || walked.length === 0) && memory.walks.get(username) === started) {
        memory.walks.delete(username)
      }
      return walked
    })
    walking = started
    memory.walks.set(username, walking)
  }
  return walking
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
  const walked = await ensureWalk(client, memory, username)
  if (typeof walked === 'string') return walked
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
    if (id !== null && !excluded.has(id)) {
      memory.slugs.set(id, slug)
      return id
    }
  }
  return 'exhausted'
}

/** What the panel needs to draw: the Worker client, the session's memory and the random source. */
export interface WatchlistSource {
  client: LetterboxdClient
  memory: WatchlistMemory
  random: () => number
}
