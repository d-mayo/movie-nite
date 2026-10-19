import type { Nomination } from '../state/model.ts'

// The sealed cans of a movie card, in memory only: one can per film (none for a single film), the room's pick,
// the can the arrow will land on, the cans that are open, the can the room chose to take and the film taken.
export interface Cans {
  films: Nomination[]
  // The can the room picked, if it has.
  picked: number | null
  // With three cans, the other can that opens after the pick: the arrow ticks between the two others and lands here.
  second: number | null
  // The cans that are open, in the order they opened.
  opened: number[]
  // The can the room chose to take: an open one, or the sealed one, which opens as it is taken.
  choice: number | null
  // The film taken, once its can has opened.
  taken: Nomination | null
}

// Where the cans are: waiting for the pick, the arrow ticking between the other two, waiting for the choice, the
// chosen sealed can about to open, the chosen can open and about to be taken, or the film taken.
export type CansPhase = 'picking' | 'ticking' | 'choosing' | 'opening' | 'closing' | 'taken'

export function newCans(films: Nomination[]): Cans {
  return { films, picked: null, second: null, opened: [], choice: null, taken: null }
}

// Cans are shown from two films up; a single film has none.
export function hasCans(cans: Cans): boolean {
  return cans.films.length > 1
}

export function phaseOf(cans: Cans): CansPhase {
  if (cans.taken) return 'taken'
  if (cans.choice !== null) return cans.opened.includes(cans.choice) ? 'closing' : 'opening'
  if (cans.picked === null) return 'picking'
  if (cans.second !== null && !cans.opened.includes(cans.second)) return 'ticking'
  return 'choosing'
}

// The room picks a can, which opens. With three, the arrow then ticks between the other two and lands on one of
// them at random, which opens (`settleTick`), and the third stays sealed; with two, the picked film is the one
// taken. A second pick, a single film and a can that isn't there change nothing.
export function pickCan(cans: Cans, index: number, random: () => number): Cans {
  if (!hasCans(cans) || cans.picked !== null || !cans.films[index]) return cans
  if (cans.films.length === 2) return { ...cans, picked: index, opened: [index], choice: index }
  const others = cans.films.map((_, i) => i).filter((i) => i !== index)
  const second = others[Math.min(others.length - 1, Math.floor(random() * others.length))]
  return { ...cans, picked: index, second, opened: [index] }
}

// The arrow has landed: the second can opens.
export function settleTick(cans: Cans): Cans {
  if (phaseOf(cans) !== 'ticking' || cans.second === null) return cans
  return { ...cans, opened: [...cans.opened, cans.second] }
}

// The cans the arrow points at, one after another: it alternates between the two cans that were not picked and
// ends on the one that opens, after a few more ticks than a single sweep, so the landing is a surprise.
export function tickPath(cans: Cans, random: () => number): number[] {
  if (cans.picked === null || cans.second === null) return []
  const others = cans.films.map((_, i) => i).filter((i) => i !== cans.picked)
  const length = 7 + Math.floor(random() * 3)
  const land = others.indexOf(cans.second)
  // Walk back from the landing so the last step is the second can.
  return Array.from({ length }, (_, step) => others[(land + (length - 1 - step)) % 2])
}

// The wait before tick `step` of `length` shows: quick at first, slowing to a crawl as the arrow settles.
export function tickDelayMs(step: number, length: number): number {
  const t = length <= 1 ? 1 : step / (length - 1)
  return Math.round(160 + 560 * t * t)
}

// With three cans the room then chooses an open can or the sealed one; a single film is taken outright.
// Nothing is chosen before the pick has settled, twice, or from a can that isn't there.
export function takeFilm(cans: Cans, index: number): Cans {
  if (cans.taken || cans.choice !== null || !cans.films[index]) return cans
  if (!hasCans(cans)) return index === 0 ? { ...cans, choice: 0, taken: cans.films[0] } : cans
  if (phaseOf(cans) !== 'choosing') return cans
  return { ...cans, choice: index }
}

// The chosen sealed can has opened.
export function openChoice(cans: Cans): Cans {
  if (phaseOf(cans) !== 'opening' || cans.choice === null) return cans
  return { ...cans, opened: [...cans.opened, cans.choice] }
}

// The chosen can has been seen open: its film is taken.
export function finishTake(cans: Cans): Cans {
  if (phaseOf(cans) !== 'closing' || cans.choice === null) return cans
  return { ...cans, taken: cans.films[cans.choice] }
}
