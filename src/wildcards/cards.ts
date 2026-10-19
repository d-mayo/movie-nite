import type { DiscoverParams } from '../tmdb/client.ts'
import { formatRuntime } from '../wheel/reveal.ts'
import {
  maxSlices,
  maxWeight,
  maxWildcards,
  minSlices,
  minWeight,
} from '../wheel/edit.ts'

// What a landed card changes: a viewer-set change of slices or weight by a
// signed amount for the viewers it named, or a number of extra wildcards.
export type CardChange =
  | { kind: 'slices' | 'weight'; amount: number; viewerIds: string[] }
  | { kind: 'wildcards'; amount: number }
  // X's film came off the wheel, and X can't nominate that film again tonight.
  | { kind: 'picksAgain'; viewerIds: [string]; tmdbId: number }
  // X's film was swapped for the film with this TMDB id, locked while it is X's.
  | { kind: 'reshuffle'; viewerIds: [string]; tmdbId: number }
  // The main wheel is blind until the next main spin lands; `used` once that spin has begun.
  | { kind: 'blindSpin'; used: boolean }
  // A movie card's film was taken: it changes nothing on the wheel and only shows in the summary.
  | { kind: 'movie' }

// A card's landed effect, kept in the night.
export interface CardEffect {
  cardId: string
  label: string
  change: CardChange
}

export type CardType = 'wheel' | 'movie'

// What a card is rolled against: the viewers on the wheel with their slices
// and weight as they are now (cards included), and the main wheel's wildcards.
export interface DealViewer {
  id: string
  name: string
  slices: number
  weight: number
  // Their nominated film, if they have one.
  film: { tmdbId: number; title: string; runtime?: number | null } | null
  // True when a Reshuffle could draw them a film from their Letterboxd watchlist.
  canReshuffle: boolean
}

export interface DealContext {
  viewers: DealViewer[]
  wildcardCount: number
  // The local date at the deal, for the seasonal cards.
  today: Date
}

// Where a movie card's film comes from: TMDB's discover, or a film already on the board.
export type CardSource =
  | { kind: 'discover'; params: DiscoverParams }
  | { kind: 'shortest'; viewerId: string; tmdbId: number }

export interface RolledCard {
  cardId: string
  type: CardType
  fff: boolean
  // On the wedge, in lower case after the name: "Sam +2 weight".
  label: string
  // "Sam +2 Weight".
  title: string
  text: string
  effect: CardEffect
  // Only a movie card has one.
  source?: CardSource
}

export interface CardDef {
  id: string
  type: CardType
  fff: boolean
  eligible(context: DealContext): boolean
  roll(context: DealContext, random: () => number): RolledCard
}

export const maxAmount = 3

const minus = '−'

function pick<T>(items: T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
}

type Field = 'slices' | 'weight'

const limits: Record<Field, { min: number; max: number }> = {
  slices: { min: minSlices, max: maxSlices },
  weight: { min: minWeight, max: maxWeight },
}

// The amounts 1 to 3 that keep every named viewer within the limits, for a sign.
function amountsFor(viewers: DealViewer[], field: Field, sign: 1 | -1): number[] {
  const { min, max } = limits[field]
  const amounts: number[] = []
  for (let n = 1; n <= maxAmount; n++) {
    if (viewers.every((v) => v[field] + sign * n >= min && v[field] + sign * n <= max)) {
      amounts.push(n)
    }
  }
  return amounts
}

function signsFor(viewers: DealViewer[], field: Field): (1 | -1)[] {
  const signs: (1 | -1)[] = []
  if (amountsFor(viewers, field, 1).length > 0) signs.push(1)
  if (amountsFor(viewers, field, -1).length > 0) signs.push(-1)
  return signs
}

function signed(sign: 1 | -1, n: number): string {
  return `${sign === 1 ? '+' : minus}${n}`
}

function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// A card that changes one viewer's slices or weight.
function viewerCard(id: string, field: Field): CardDef {
  const usable = (context: DealContext) =>
    context.viewers.filter((v) => signsFor([v], field).length > 0)
  return {
    id,
    type: 'wheel',
    fff: false,
    eligible: (context) => usable(context).length > 0,
    roll(context, random) {
      const viewer = pick(usable(context), random)
      const sign = pick(signsFor([viewer], field), random)
      const n = pick(amountsFor([viewer], field, sign), random)
      const label = `${viewer.name} ${signed(sign, n)} ${field}`
      const to = viewer[field] + sign * n
      return {
        cardId: id,
        type: 'wheel',
        fff: false,
        label,
        title: `${viewer.name} ${signed(sign, n)} ${capital(field)}`,
        text: `${viewer.name}'s ${field} ${field === 'slices' ? 'go' : 'goes'} from ${viewer[field]} to ${to} for the rest of the night.`,
        effect: {
          cardId: id,
          label,
          change: { kind: field, amount: sign * n, viewerIds: [viewer.id] },
        },
      }
    },
  }
}

// A card that changes every viewer on the wheel by the same amount.
function everyoneCard(id: string, field: Field): CardDef {
  return {
    id,
    type: 'wheel',
    fff: false,
    eligible: (context) => context.viewers.length > 0 && signsFor(context.viewers, field).length > 0,
    roll(context, random) {
      const sign = pick(signsFor(context.viewers, field), random)
      const n = pick(amountsFor(context.viewers, field, sign), random)
      const label = `Everyone ${signed(sign, n)} ${field}`
      return {
        cardId: id,
        type: 'wheel',
        fff: false,
        label,
        title: `Everyone ${signed(sign, n)} ${capital(field)}`,
        text: `Everyone's ${field} ${field === 'slices' ? (sign === 1 ? 'go up' : 'go down') : sign === 1 ? 'goes up' : 'goes down'} by ${n} for the rest of the night.`,
        effect: {
          cardId: id,
          label,
          change: {
            kind: field,
            amount: sign * n,
            viewerIds: context.viewers.map((v) => v.id),
          },
        },
      }
    },
  }
}

const wildcardsCard: CardDef = {
  id: 'wildcards',
  type: 'wheel',
  fff: false,
  eligible: (context) => context.wildcardCount < maxWildcards,
  roll(context, random) {
    const n = 1 + Math.floor(random() * Math.min(maxAmount, maxWildcards - context.wildcardCount))
    const label = `+${n} ${n === 1 ? 'wildcard' : 'wildcards'}`
    return {
      cardId: 'wildcards',
      type: 'wheel',
      fff: false,
      label,
      title: `+${n} ${n === 1 ? 'Wildcard' : 'Wildcards'}`,
      text: `The wheel gets ${n} more ${n === 1 ? 'wildcard' : 'wildcards'} for the rest of the night.`,
      effect: { cardId: 'wildcards', label, change: { kind: 'wildcards', amount: n } },
    }
  },
}

// X's film comes off the wheel, and X can't nominate it again tonight.
const picksAgainCard: CardDef = {
  id: 'picks-again',
  type: 'wheel',
  fff: false,
  eligible: (context) => context.viewers.some((v) => v.film),
  roll(context, random) {
    const viewer = pick(
      context.viewers.filter((v) => v.film),
      random,
    )
    const film = viewer.film!
    const label = `${viewer.name} picks again`
    return {
      cardId: 'picks-again',
      type: 'wheel',
      fff: false,
      label,
      title: `${viewer.name} Picks Again`,
      text: `${film.title} comes off the wheel, and ${viewer.name} picks a different film.`,
      effect: {
        cardId: 'picks-again',
        label,
        change: { kind: 'picksAgain', viewerIds: [viewer.id], tmdbId: film.tmdbId },
      },
    }
  },
}

// X's film is swapped for a random one from their watchlist. The film is only
// known once the draw is done, so the rolled effect carries 0 until then.
const reshuffleCard: CardDef = {
  id: 'reshuffle',
  type: 'wheel',
  fff: false,
  eligible: (context) => context.viewers.some((v) => v.canReshuffle),
  roll(context, random) {
    const viewer = pick(
      context.viewers.filter((v) => v.canReshuffle),
      random,
    )
    const label = `Reshuffle ${viewer.name}`
    return {
      cardId: 'reshuffle',
      type: 'wheel',
      fff: false,
      label,
      title: label,
      text: `${viewer.name}'s film is swapped for a random one from their watchlist, and stays for the night.`,
      effect: {
        cardId: 'reshuffle',
        label,
        change: { kind: 'reshuffle', viewerIds: [viewer.id], tmdbId: 0 },
      },
    }
  },
}

// Always eligible: every deal follows a main press, which has used up any pending one.
const blindSpinCard: CardDef = {
  id: 'blind-spin',
  type: 'wheel',
  fff: false,
  eligible: () => true,
  roll() {
    return {
      cardId: 'blind-spin',
      type: 'wheel',
      fff: false,
      label: 'Blind spin',
      title: 'Blind Spin',
      text: 'The next spin hides the names, titles and posters until it lands.',
      effect: { cardId: 'blind-spin', label: 'Blind spin', change: { kind: 'blindSpin', used: false } },
    }
  },
}

const voteFloor = 200

// TMDB's movie genres but TV Movie, by id.
const genres: [number, string][] = [
  [28, 'Action'],
  [12, 'Adventure'],
  [16, 'Animation'],
  [35, 'Comedy'],
  [80, 'Crime'],
  [99, 'Documentary'],
  [18, 'Drama'],
  [10751, 'Family'],
  [14, 'Fantasy'],
  [36, 'History'],
  [27, 'Horror'],
  [10402, 'Music'],
  [9648, 'Mystery'],
  [10749, 'Romance'],
  [878, 'Science Fiction'],
  [53, 'Thriller'],
  [10752, 'War'],
  [37, 'Western'],
]

const languages: [string, string][] = [
  ['fr', 'French'],
  ['it', 'Italian'],
  ['es', 'Spanish'],
  ['de', 'German'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh', 'Chinese'],
  ['hi', 'Hindi'],
  ['sv', 'Swedish'],
  ['da', 'Danish'],
  ['pt', 'Portuguese'],
  ['ru', 'Russian'],
]

const decades = [1950, 1960, 1970, 1980, 1990, 2000, 2010]

// A rolled movie card of the discover kind: the parameters it asks with carry the vote floor.
function discoverRoll(
  id: string,
  label: string,
  title: string,
  text: string,
  params: DiscoverParams,
): RolledCard {
  return {
    cardId: id,
    type: 'movie',
    fff: false,
    label,
    title,
    text,
    effect: { cardId: id, label, change: { kind: 'movie' } },
    source: { kind: 'discover', params: { ...params, 'vote_count.gte': voteFloor } },
  }
}

function discoverCard(
  id: string,
  eligible: (context: DealContext) => boolean,
  roll: (random: () => number) => RolledCard,
): CardDef {
  return { id, type: 'movie', fff: false, eligible, roll: (_context, random) => roll(random) }
}

// A seasonal card: eligible from a month and day to a month and day (1-based months), inclusive.
function seasonal(
  id: string,
  name: string,
  from: [number, number],
  to: [number, number],
  params: DiscoverParams,
): CardDef {
  return discoverCard(
    id,
    ({ today }) => {
      const day = (today.getMonth() + 1) * 100 + today.getDate()
      return day >= from[0] * 100 + from[1] && day <= to[0] * 100 + to[1]
    },
    () => discoverRoll(id, name, name, `Three ${name.toLowerCase()} films in the cans.`, params),
  )
}

// Whole tenths from `min` to `max`, as a number with one decimal.
function tenths(min: number, max: number, random: () => number): number {
  return (min * 10 + Math.floor(random() * (max * 10 - min * 10 + 1))) / 10
}

const genreNightCard = discoverCard('genre-night', () => true, (random) => {
  const [genre, name] = pick(genres, random)
  return discoverRoll(
    'genre-night',
    `${name} night`,
    `Genre Night: ${name}`,
    `Three ${name.toLowerCase()} films in the cans.`,
    { with_genres: String(genre) },
  )
})

const criticsCard = discoverCard('critics-darlings', () => true, (random) => {
  const n = tenths(7, 8, random).toFixed(1)
  return discoverRoll(
    'critics-darlings',
    `Critics' darlings ${n}`,
    "Critics' Darlings",
    `Three films rated ${n} or above.`,
    { 'vote_average.gte': Number(n) },
  )
})

const soBadCard = discoverCard('so-bad-its-good', () => true, (random) => {
  const n = tenths(4, 5.5, random).toFixed(1)
  return discoverRoll(
    'so-bad-its-good',
    `So bad it's good ${n}`,
    "So Bad It's Good",
    `Three films rated ${n} or below.`,
    { 'vote_average.lte': Number(n) },
  )
})

const decadeCard = discoverCard('decade-roulette', () => true, (random) => {
  const first = pick(decades, random)
  const name = `${first}s`
  return discoverRoll('decade-roulette', name, `Decade Roulette: the ${name}`, `Three films from the ${name}.`, {
    'primary_release_date.gte': `${first}-01-01`,
    'primary_release_date.lte': `${first + 9}-12-31`,
  })
})

const worldCinemaCard = discoverCard('world-cinema', () => true, (random) => {
  const [code, name] = pick(languages, random)
  return discoverRoll(
    'world-cinema',
    `${name} cinema`,
    `World Cinema: ${name}`,
    `Three ${name}-language films in the cans.`,
    { with_original_language: code },
  )
})

// The viewers whose film has the shortest runtime on the board.
function shortestViewers(context: DealContext): DealViewer[] {
  const timed = context.viewers.filter((v) => v.film?.runtime)
  const shortest = Math.min(...timed.map((v) => v.film!.runtime!))
  return timed.filter((v) => v.film!.runtime === shortest)
}

// The shortest film on the board wins; a tie is broken by `random`.
const shortestCard: CardDef = {
  id: 'shortest-on-the-board',
  type: 'movie',
  fff: false,
  eligible: (context) => context.viewers.some((v) => v.film?.runtime),
  roll(context, random) {
    const viewer = pick(shortestViewers(context), random)
    const film = viewer.film!
    const label = 'Shortest on the board'
    return {
      cardId: 'shortest-on-the-board',
      type: 'movie',
      fff: false,
      label,
      title: 'Shortest on the Board',
      text: `${film.title} (${formatRuntime(film.runtime!)}), ${viewer.name}'s film, is the shortest on the board and wins.`,
      effect: { cardId: 'shortest-on-the-board', label, change: { kind: 'movie' } },
      source: { kind: 'shortest', viewerId: viewer.id, tmdbId: film.tmdbId },
    }
  },
}

export const cards: CardDef[] = [
  viewerCard('viewer-weight', 'weight'),
  viewerCard('viewer-slices', 'slices'),
  everyoneCard('everyone-weight', 'weight'),
  everyoneCard('everyone-slices', 'slices'),
  wildcardsCard,
  picksAgainCard,
  reshuffleCard,
  blindSpinCard,
  genreNightCard,
  seasonal('halloween', 'Halloween', [10, 1], [10, 31], { with_keywords: '3335' }),
  seasonal('christmas', 'Christmas', [12, 1], [12, 25], { with_keywords: '207317' }),
  seasonal('romance', 'Romance', [2, 1], [2, 14], { with_genres: '10749' }),
  seasonal('creature-feature', 'Creature Feature', [6, 1], [8, 31], {
    with_keywords: '158126|11100|161791',
  }),
  criticsCard,
  soBadCard,
  decadeCard,
  worldCinemaCard,
  shortestCard,
]

function validChange(value: unknown): value is CardChange {
  if (!value || typeof value !== 'object') return false
  const change = value as {
    kind?: unknown
    amount?: unknown
    viewerIds?: unknown
    tmdbId?: unknown
    used?: unknown
  }
  if (change.kind === 'movie') return true
  if (change.kind === 'blindSpin') return typeof change.used === 'boolean'
  if (change.kind === 'picksAgain' || change.kind === 'reshuffle') {
    return (
      Array.isArray(change.viewerIds) &&
      change.viewerIds.length === 1 &&
      typeof change.viewerIds[0] === 'string' &&
      typeof change.tmdbId === 'number' &&
      Number.isInteger(change.tmdbId)
    )
  }
  if (typeof change.amount !== 'number' || !Number.isInteger(change.amount)) return false
  if (change.kind === 'wildcards') return true
  if (change.kind !== 'slices' && change.kind !== 'weight') return false
  return Array.isArray(change.viewerIds) && change.viewerIds.every((id) => typeof id === 'string')
}

// The stored effects that have the right shape; anything else is dropped.
export function validCardEffects(value: unknown): CardEffect[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (e): e is CardEffect =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as CardEffect).cardId === 'string' &&
      typeof (e as CardEffect).label === 'string' &&
      validChange((e as CardEffect).change),
  )
}
