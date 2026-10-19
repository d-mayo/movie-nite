import type { LetterboxdClient } from './client.ts'
import type { WatchlistMemory } from './watchlist.ts'
import { canBeReshuffled } from './watchlist.ts'

export { canBeReshuffled as canHaveBacklog }

/** A shared film as the draw returns it: its TMDB id and the usernames whose settled walks hold it. */
export interface SharedFilm {
  tmdbId: number
  holders: string[]
}

export type CommonGroundResult = SharedFilm[] | 'exhausted' | 'unavailable'

/** The settled slugs held by two or more of the usernames' walks, each with its holders (in the order given). */
export function sharedSlugs(memory: WatchlistMemory, usernames: readonly string[]): Map<string, string[]> {
  const holders = new Map<string, string[]>()
  for (const name of usernames) {
    const username = name.toLowerCase()
    for (const slug of memory.settled.get(username) ?? []) {
      const list = holders.get(slug)
      if (!list) holders.set(slug, [username])
      else if (!list.includes(username)) list.push(username)
    }
  }
  for (const [slug, list] of holders) if (list.length < 2) holders.delete(slug)
  return holders
}

function usable(memory: WatchlistMemory, slug: string, excluded: ReadonlySet<number>): boolean {
  const id = memory.ids.get(slug)
  return id === undefined || (id !== null && !excluded.has(id))
}

/**
 * Whether Common Ground could be dealt: at least two usernames, and one slug on two or more of their settled walks
 * that is not known to be unusable (an unmapped slug counts as usable, since the deal can't look it up).
 */
export function canCommonGround(
  memory: WatchlistMemory,
  usernames: readonly string[],
  excluded: ReadonlySet<number>,
): boolean {
  if (usernames.length < 2) return false
  for (const slug of sharedSlugs(memory, usernames).keys()) if (usable(memory, slug, excluded)) return true
  return false
}

/**
 * Up to `count` films shared by two or more of the usernames' walks, taking slugs at random from the highest holder
 * count down and mapping only the slugs taken (the memory's ids first, then the client). A slug that maps to null
 * or to an excluded film is skipped. Each mapping is recorded in the memory.
 */
export async function drawCommonGround(options: {
  client: LetterboxdClient
  memory: WatchlistMemory
  usernames: readonly string[]
  excluded: ReadonlySet<number>
  random: () => number
  count: number
}): Promise<CommonGroundResult> {
  const { client, memory, random, count } = options
  const taken = new Set(options.excluded)
  const shared = sharedSlugs(memory, options.usernames)
  const byCount = new Map<number, string[]>()
  for (const [slug, holders] of shared) {
    byCount.set(holders.length, [...(byCount.get(holders.length) ?? []), slug])
  }
  const films: SharedFilm[] = []
  for (const size of [...byCount.keys()].sort((a, b) => b - a)) {
    const remaining = byCount.get(size)!
    while (remaining.length > 0 && films.length < count) {
      const slug = remaining.splice(Math.floor(random() * remaining.length), 1)[0]
      let id = memory.ids.get(slug)
      if (id === undefined) {
        const found = await client.filmTmdbId(slug)
        if (found === 'unavailable') return films.length > 0 ? films : 'unavailable'
        memory.ids.set(slug, found)
        id = found
      }
      if (id === null || taken.has(id)) continue
      memory.slugs.set(id, slug)
      taken.add(id)
      films.push({ tmdbId: id, holders: shared.get(slug)! })
    }
    if (films.length >= count) break
  }
  return films.length > 0 ? films : 'exhausted'
}
