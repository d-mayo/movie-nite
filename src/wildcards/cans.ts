import type { Nomination } from '../state/model.ts'

// The sealed cans of a movie card, in memory only: one can per film (none for a single film), the room's pick,
// the cans that are open, and the film taken.
export interface Cans {
  films: Nomination[]
  // The can the room picked, if it has.
  picked: number | null
  // The cans that are open, in the order they opened.
  opened: number[]
  // The film taken, once the room has taken one.
  taken: Nomination | null
}

export function newCans(films: Nomination[]): Cans {
  return { films, picked: null, opened: [], taken: null }
}

// Cans are shown from two films up; a single film has none.
export function hasCans(cans: Cans): boolean {
  return cans.films.length > 1
}

// The room picks a can, which opens. With three, one of the other two then opens at random and the third stays
// sealed; with two, the picked film is taken. A second pick, a single film and a can that isn't there change nothing.
export function pickCan(cans: Cans, index: number, random: () => number): Cans {
  if (!hasCans(cans) || cans.picked !== null || !cans.films[index]) return cans
  if (cans.films.length === 2) {
    return { ...cans, picked: index, opened: [index], taken: cans.films[index] }
  }
  const others = cans.films.map((_, i) => i).filter((i) => i !== index)
  const second = others[Math.min(others.length - 1, Math.floor(random() * others.length))]
  return { ...cans, picked: index, opened: [index, second] }
}

// With three cans the room then takes an open one or the sealed one (which opens as it is taken); a single film
// is taken outright. Nothing is taken before the pick, twice, or from a can that isn't there.
export function takeFilm(cans: Cans, index: number): Cans {
  if (cans.taken || !cans.films[index]) return cans
  if (hasCans(cans) && (cans.films.length === 2 || cans.picked === null)) return cans
  if (!hasCans(cans) && index !== 0) return cans
  return {
    ...cans,
    opened: cans.opened.includes(index) ? cans.opened : [...cans.opened, index],
    taken: cans.films[index],
  }
}

// Whether the room can take a can now: a film is still to be taken and, with three cans, one has been picked.
export function canTake(cans: Cans): boolean {
  return !cans.taken && cans.films.length === 3 && cans.picked !== null
}
