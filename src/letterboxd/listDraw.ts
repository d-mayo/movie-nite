import type { LetterboxdClient } from './client.ts'
import type { WatchlistMemory } from './watchlist.ts'

export type ListDrawResult = number[] | 'exhausted' | 'private' | 'missing' | 'unavailable'

/**
 * Up to `count` distinct films from a random page of a Letterboxd list, as TMDB ids: page 1 gives the page count, a
 * random page from 1 to it gives the slugs, and page 1 fills in when that page runs out. Only the slugs taken are
 * mapped to a TMDB id (the memory's `ids` first, then the Worker, recording the result and the id's slug), and a slug
 * that maps to null or to an excluded film is redrawn past. A lookup that fails after some films were found keeps them.
 */
export async function drawFilmsFromList(options: {
  client: LetterboxdClient
  memory: WatchlistMemory
  username: string
  slug: string
  excluded: ReadonlySet<number>
  random: () => number
  count: number
}): Promise<ListDrawResult> {
  const { client, memory, username, slug, random, count } = options
  const first = await client.listPage(username, slug, 1)
  if (typeof first === 'string') return first
  const pages = [first.slugs]
  const page = 1 + Math.floor(random() * Math.max(1, first.lastPage))
  if (page > 1) {
    const chosen = await client.listPage(username, slug, page)
    if (typeof chosen === 'string') return chosen
    pages.unshift(chosen.slugs)
  }

  const taken = new Set(options.excluded)
  const seen = new Set<string>()
  const films: number[] = []
  for (const slugs of pages) {
    const remaining = slugs.filter((s) => !seen.has(s))
    for (const s of remaining) seen.add(s)
    while (remaining.length > 0 && films.length < count) {
      const filmSlug = remaining.splice(Math.floor(random() * remaining.length), 1)[0]
      let id = memory.ids.get(filmSlug)
      if (id === undefined) {
        const found = await client.filmTmdbId(filmSlug)
        if (found === 'unavailable') return films.length > 0 ? films : 'unavailable'
        memory.ids.set(filmSlug, found)
        id = found
      }
      if (id === null || taken.has(id)) continue
      memory.slugs.set(id, filmSlug)
      taken.add(id)
      films.push(id)
    }
    if (films.length >= count) break
  }
  return films.length > 0 ? films : 'exhausted'
}
