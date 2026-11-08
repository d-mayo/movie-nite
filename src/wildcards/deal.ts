import { cards, subBoardPool, type CardDef, type DealContext, type RolledCard } from './cards.ts'

export { subBoardPool }

export interface DealtCard extends RolledCard {
  // How much of the wildcard wheel the card takes: a whole number from 1 to 5.
  weight: number
}

export const dealSize = 8
export const maxCardWeight = 5

// A few tries per slot to avoid a wedge that repeats one already dealt.
const labelTries = 3

// The host's tuning of the deal: how often each card comes up (1 to 5, a missing card
// at 3) and the seasonal cards that may be dealt outside their dates.
export interface DealTuning {
  frequencies?: Record<string, number>
  outsideDates?: readonly string[]
}

const defaultFrequency = 3
const alwaysFrequency = 5
// Draw weights of frequencies 1 to 4: each step triples the chance.
const frequencyWeights = [1, 3, 9, 27]

// A card's frequency in the deal: a seasonal card without its Outside its dates switch
// is dealt as it always was, at the default.
function frequencyOf(card: CardDef, tuning: DealTuning): number {
  if (card.guaranteed && !tuning.outsideDates?.includes(card.id)) return defaultFrequency
  return tuning.frequencies?.[card.id] ?? defaultFrequency
}

// The cards that can be dealt: eligible (or seasonal with Outside its dates on) and not
// switched off; the FFF cards only once unlocked.
function dealable(context: DealContext, disabled: readonly string[], fffUnlocked: boolean, tuning: DealTuning) {
  return cards.filter(
    (card) =>
      (fffUnlocked || !card.fff) &&
      !disabled.includes(card.id) &&
      (card.eligible(context) || (!!card.guaranteed && !!tuning.outsideDates?.includes(card.id))) &&
      // The spins card needs a sub-board card that is on.
      (card.id !== 'wildcard-spins' || poolCards(context, disabled).length > 0),
  )
}

// The sub-board's pool cards that are eligible and not switched off.
function poolCards(context: DealContext, disabled: readonly string[]): CardDef[] {
  return cards.filter((card) => subBoardPool.includes(card.id) && !disabled.includes(card.id) && card.eligible(context))
}

// Whether any card can be dealt.
export function canDeal(
  context: DealContext,
  disabled: readonly string[] = [],
  fffUnlocked = false,
  tuning: DealTuning = {},
): boolean {
  return dealable(context, disabled, fffUnlocked, tuning).length > 0
}

// Eight cards, each drawn from the eligible ones by their frequency and rolled (the same
// card may come up twice), a card at 5 always dealt; none when no card is eligible.
export function dealCards(
  context: DealContext,
  random: () => number,
  disabled: readonly string[] = [],
  fffUnlocked = false,
  tuning: DealTuning = {},
): DealtCard[] {
  return dealFrom(dealable(context, disabled, fffUnlocked, tuning), context, random, true, tuning)
}

// The sub-board of a wildcard-spins card: eight pool cards (switches respected,
// or ignored when they leave none), with no seasonal slot.
export function dealSubBoard(
  context: DealContext,
  random: () => number,
  disabled: readonly string[] = [],
  tuning: DealTuning = {},
): DealtCard[] {
  let pool = poolCards(context, disabled)
  if (pool.length === 0) pool = poolCards(context, [])
  return dealFrom(pool, context, random, false, tuning)
}

// One card drawn by weight; equal weights draw as a uniform pick does.
function pickWeighted(candidates: CardDef[], weightOf: (card: CardDef) => number, random: () => number): CardDef {
  const weights = candidates.map(weightOf)
  const r = random()
  if (weights.every((w) => w === weights[0])) {
    return candidates[Math.min(candidates.length - 1, Math.floor(r * candidates.length))]
  }
  let left = r * weights.reduce((sum, w) => sum + w, 0)
  for (let i = 0; i < candidates.length; i++) {
    left -= weights[i]
    if (left < 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

function dealFrom(
  eligible: CardDef[],
  context: DealContext,
  random: () => number,
  seasonal: boolean,
  tuning: DealTuning,
): DealtCard[] {
  if (eligible.length === 0) return []
  const frequency = (card: CardDef) => frequencyOf(card, tuning)
  // A card that is guaranteed while within its dates takes a slot of its own, at a random place on the wheel.
  const guaranteed = seasonal ? eligible.filter((card) => card.guaranteed && card.eligible(context)) : []
  const slots = Array.from({ length: dealSize }, (_, slot) => slot)
  const reserved = new Map<number, (typeof cards)[number]>()
  for (const card of guaranteed.slice(0, dealSize)) {
    const at = slots.splice(Math.min(slots.length - 1, Math.floor(random() * slots.length)), 1)[0]
    reserved.set(at, card)
  }
  // Then each card at 5 takes a slot of its own too (a random selection when they outnumber the free slots).
  const always = eligible.filter((card) => frequency(card) === alwaysFrequency)
  const waiting = always.filter((card) => !guaranteed.includes(card))
  while (waiting.length > 0 && slots.length > 0) {
    const card = waiting.splice(Math.min(waiting.length - 1, Math.floor(random() * waiting.length)), 1)[0]
    const at = slots.splice(Math.min(slots.length - 1, Math.floor(random() * slots.length)), 1)[0]
    reserved.set(at, card)
  }
  // The other slots are drawn from the cards not at 5, or from all of them when every card is.
  const drawn = always.length === eligible.length ? eligible : eligible.filter((card) => !always.includes(card))
  const weightOf = (card: CardDef) => frequencyWeights[frequency(card) - 1] ?? frequencyWeights[2]
  const dealt: DealtCard[] = []
  for (let slot = 0; slot < dealSize; slot++) {
    let rolled: RolledCard | null = null
    const forced = reserved.get(slot)
    if (forced) {
      dealt.push({ ...forced.roll(context, random), weight: 1 + Math.floor(random() * maxCardWeight) })
      continue
    }
    for (let tries = 0; tries < labelTries; tries++) {
      const card = pickWeighted(drawn, weightOf, random)
      rolled = card.roll(context, random)
      if (!dealt.some((d) => d.label === rolled?.label)) break
    }
    if (!rolled) continue
    dealt.push({ ...rolled, weight: 1 + Math.floor(random() * maxCardWeight) })
  }
  return dealt
}
