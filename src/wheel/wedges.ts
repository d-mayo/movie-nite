import { viewersOnWheel, type AppState, type Nomination } from '../state/model.ts'
import { deriveSlices, type WheelSettings } from './edit.ts'
import type { DealtCard } from '../wildcards/deal.ts'
import { sliceArcs, type Arc, type Slice } from './layout.ts'

export interface Wedge {
  slice: Slice
  arc: Arc
  color: string
  viewerName: string | null
  nomination: Nomination | null
  // A card wedge's label, always shown.
  cardLabel?: string
}

const wildcardColor = 'hsl(0 0% 25%)'
const cardColor = 'hsl(0 0% 55%)'

// Derives the wheel from the viewers on it, in roster order, and resolves every
// slice with what a wedge draws.
export function buildWedges(
  night: AppState['night'],
  roster: AppState['roster'],
  wheel: WheelSettings,
): Wedge[] {
  const onWheel = viewersOnWheel(night)
  const ordered = roster.map((v) => v.id).filter((id) => onWheel.includes(id))
  const slices = deriveSlices(ordered, wheel, night.adjustments, night.cardEffects)
  const arcs = sliceArcs(slices)
  return slices.map((slice, i) => {
    if (slice.kind !== 'nomination') {
      return {
        slice,
        arc: arcs[i],
        color: wildcardColor,
        viewerName: null,
        nomination: null,
      }
    }
    return {
      slice,
      arc: arcs[i],
      color: roster.find((v) => v.id === slice.viewerId)?.color ?? wildcardColor,
      viewerName: roster.find((v) => v.id === slice.viewerId)?.name ?? '',
      nomination: night.nominations[slice.viewerId] ?? null,
    }
  })
}

// The wildcard wheel: one wedge per dealt card, its size the card's weight.
export function buildCardWedges(deal: DealtCard[]): Wedge[] {
  const slices: Slice[] = deal.map((card, index) => ({ kind: 'card', index, weight: card.weight }))
  const arcs = sliceArcs(slices)
  return slices.map((slice, i) => ({
    slice,
    arc: arcs[i],
    color: cardColor,
    viewerName: null,
    nomination: null,
    cardLabel: deal[i].label,
  }))
}
