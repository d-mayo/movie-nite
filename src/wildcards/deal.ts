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

// The cards that can be dealt: eligible and not switched off; the FFF cards only once unlocked.
function dealable(context: DealContext, disabled: readonly string[], fffUnlocked: boolean) {
  return cards.filter(
    (card) =>
      (fffUnlocked || !card.fff) &&
      !disabled.includes(card.id) &&
      card.eligible(context) &&
      // The spins card needs a sub-board card that is on.
      (card.id !== 'wildcard-spins' || poolCards(context, disabled).length > 0),
  )
}

// The sub-board's pool cards that are eligible and not switched off.
function poolCards(context: DealContext, disabled: readonly string[]): CardDef[] {
  return cards.filter((card) => subBoardPool.includes(card.id) && !disabled.includes(card.id) && card.eligible(context))
}

// Whether any card can be dealt.
export function canDeal(context: DealContext, disabled: readonly string[] = [], fffUnlocked = false): boolean {
  return dealable(context, disabled, fffUnlocked).length > 0
}

// Eight cards, each drawn uniformly from the eligible ones and rolled (the same
// card may come up twice); none when no card is eligible.
export function dealCards(
  context: DealContext,
  random: () => number,
  disabled: readonly string[] = [],
  fffUnlocked = false,
): DealtCard[] {
  return dealFrom(dealable(context, disabled, fffUnlocked), context, random, true)
}

// The sub-board of a wildcard-spins card: eight pool cards (switches respected,
// or ignored when they leave none), with no seasonal slot.
export function dealSubBoard(
  context: DealContext,
  random: () => number,
  disabled: readonly string[] = [],
): DealtCard[] {
  let pool = poolCards(context, disabled)
  if (pool.length === 0) pool = poolCards(context, [])
  return dealFrom(pool, context, random, false)
}

function dealFrom(eligible: CardDef[], context: DealContext, random: () => number, seasonal: boolean): DealtCard[] {
  if (eligible.length === 0) return []
  // A card that is guaranteed while eligible takes a slot of its own, at a random place on the wheel.
  const guaranteed = seasonal ? eligible.filter((card) => card.guaranteed) : []
  const slots = Array.from({ length: dealSize }, (_, slot) => slot)
  const reserved = new Map<number, (typeof cards)[number]>()
  for (const card of guaranteed.slice(0, dealSize)) {
    const at = slots.splice(Math.min(slots.length - 1, Math.floor(random() * slots.length)), 1)[0]
    reserved.set(at, card)
  }
  const dealt: DealtCard[] = []
  for (let slot = 0; slot < dealSize; slot++) {
    let rolled: RolledCard | null = null
    const forced = reserved.get(slot)
    if (forced) {
      dealt.push({ ...forced.roll(context, random), weight: 1 + Math.floor(random() * maxCardWeight) })
      continue
    }
    for (let tries = 0; tries < labelTries; tries++) {
      const card = eligible[Math.min(eligible.length - 1, Math.floor(random() * eligible.length))]
      rolled = card.roll(context, random)
      if (!dealt.some((d) => d.label === rolled?.label)) break
    }
    if (!rolled) continue
    dealt.push({ ...rolled, weight: 1 + Math.floor(random() * maxCardWeight) })
  }
  return dealt
}
