import type { CardEffect } from './cards.ts'

// The cards to show as chips under the wheel, in landing order: a card that
// named viewers stays while any of them is still on the roster, and a
// night-wide card (extra wildcards, Blind Spin) always stays.
export function chipEffects(effects: CardEffect[], rosterIds: string[]): CardEffect[] {
  const roster = new Set(rosterIds)
  return effects.filter(
    (e) =>
      e.change.kind === 'wildcards' ||
      e.change.kind === 'blindSpin' ||
      (e.change.kind !== 'movie' && e.change.kind !== 'spins' && e.change.viewerIds.some((id) => roster.has(id))),
  )
}

// The labels of the cards that named a viewer, in landing order.
export function viewerCardLabels(effects: CardEffect[], viewerId: string): string[] {
  return effects
    .filter(
      (e) =>
        e.change.kind !== 'wildcards' &&
        e.change.kind !== 'blindSpin' &&
        e.change.kind !== 'movie' &&
        e.change.kind !== 'spins' &&
        e.change.viewerIds.includes(viewerId),
    )
    .map((e) => e.label)
}
