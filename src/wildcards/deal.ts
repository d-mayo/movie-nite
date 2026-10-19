import { cards, type DealContext, type RolledCard } from './cards.ts'

export interface DealtCard extends RolledCard {
  // How much of the wildcard wheel the card takes: a whole number from 1 to 5.
  weight: number
}

export const dealSize = 8
export const maxCardWeight = 5

// A few tries per slot to avoid a wedge that repeats one already dealt.
const labelTries = 3

// The cards that can be dealt: eligible and not switched off.
function dealable(context: DealContext, disabled: readonly string[]) {
  return cards.filter((card) => !disabled.includes(card.id) && card.eligible(context))
}

// Whether any card can be dealt.
export function canDeal(context: DealContext, disabled: readonly string[] = []): boolean {
  return dealable(context, disabled).length > 0
}

// Eight cards, each drawn uniformly from the eligible ones and rolled (the same
// card may come up twice); none when no card is eligible.
export function dealCards(
  context: DealContext,
  random: () => number,
  disabled: readonly string[] = [],
): DealtCard[] {
  const eligible = dealable(context, disabled)
  if (eligible.length === 0) return []
  // A card that is guaranteed while eligible takes a slot of its own, at a random place on the wheel.
  const guaranteed = eligible.filter((card) => card.guaranteed)
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
