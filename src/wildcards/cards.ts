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
}

export interface DealContext {
  viewers: DealViewer[]
  wildcardCount: number
}

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
        text: `Everyone's ${field} ${sign === 1 ? 'goes up' : 'goes down'} by ${n} for the rest of the night.`,
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

export const cards: CardDef[] = [
  viewerCard('viewer-weight', 'weight'),
  viewerCard('viewer-slices', 'slices'),
  everyoneCard('everyone-weight', 'weight'),
  everyoneCard('everyone-slices', 'slices'),
  wildcardsCard,
]
