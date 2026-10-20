import type { AppState, Nomination } from '../state/model.ts'
import { refusedFilms, watchedFilms } from '../state/model.ts'
import type { DrawResult } from './watchlist.ts'

// The words for a draw that found no film, as the viewer's cell and a Reshuffle card both show them.
export function drawMessage(
  result: Exclude<DrawResult, number>,
  viewerName: string,
  username: string | undefined,
): string {
  switch (result) {
    case 'empty':
      return `${viewerName}'s watchlist is empty.`
    case 'exhausted':
      return `Every film on ${viewerName}'s watchlist is already in play tonight.`
    case 'private':
      return `${viewerName}'s watchlist is private.`
    case 'missing':
      return `Letterboxd has no watchlist for ${username ?? viewerName}.`
    case 'unavailable':
      return "Letterboxd can't be reached right now."
  }
}

// "Jo's", "Jo's and Sam's", "Jo's, Sam's and Alex's".
export function possessives(names: string[]): string {
  const owned = names.map((name) => `${name}'s`)
  return owned.length === 1 ? owned[0] : `${owned.slice(0, -1).join(', ')} and ${owned[owned.length - 1]}`
}

// The films a movie card's draw must skip: every nomination, the films won and watched tonight and the held film.
export function movieExclusions(night: AppState['night'], holdover: Nomination | null): Set<number> {
  const excluded = new Set<number>(Object.values(night.nominations).map((film) => film.tmdbId))
  for (const id of night.wonFilms) excluded.add(id)
  for (const film of watchedFilms(night)) excluded.add(film.tmdbId)
  if (holdover) excluded.add(holdover.tmdbId)
  return excluded
}

// The films Movie Night Rewind must skip: tonight's only, so every nomination and the films won and
// watched tonight, but not the held film.
export function rewindExclusions(night: AppState['night']): Set<number> {
  return movieExclusions(night, null)
}

// The films a draw for this viewer must skip: every nomination, the films won tonight, the held film
// and the films a Picks Again refused them.
export function drawExclusions(
  night: AppState['night'],
  holdover: Nomination | null,
  viewerId: string,
): Set<number> {
  const excluded = new Set<number>(Object.values(night.nominations).map((film) => film.tmdbId))
  for (const id of night.wonFilms) excluded.add(id)
  if (holdover) excluded.add(holdover.tmdbId)
  for (const id of refusedFilms(night, viewerId)) excluded.add(id)
  return excluded
}
