import { cards, type DealContext, type RolledCard } from './cards.ts'

export interface DealtCard extends RolledCard {
  // How much of the wildcard wheel the card takes: a whole number from 1 to 5.
  weight: number
}

export const dealSize = 8
export const maxCardWeight = 5

// A few tries per slot to avoid a wedge that repeats one already dealt.
const labelTries = 3

// Eight cards, each drawn uniformly from the eligible ones and rolled (the same
// card may come up twice); none when no card is eligible.
export function dealCards(context: DealContext, random: () => number): DealtCard[] {
  const eligible = cards.filter((card) => card.eligible(context))
  if (eligible.length === 0) return []
  const dealt: DealtCard[] = []
  for (let slot = 0; slot < dealSize; slot++) {
    let rolled: RolledCard | null = null
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
