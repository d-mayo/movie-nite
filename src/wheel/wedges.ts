import { viewersOnWheel, type AppState, type Nomination } from '../state/model.ts'
import { resolveLayout } from './edit.ts'
import { defaultLayout, sliceArcs, type Arc, type Slice } from './layout.ts'

export interface Wedge {
  slice: Slice
  arc: Arc
  color: string
  viewerName: string | null
  nomination: Nomination | null
}

const wildcardColor = 'hsl(0 0% 25%)'

// Resolves every slice of the edited layout, or of the default one, with what a wedge draws.
export function buildWedges(night: AppState['night'], roster: AppState['roster']): Wedge[] {
  const slices = night.layout
    ? resolveLayout(night.layout)
    : defaultLayout(viewersOnWheel(night), night.nominations)
  const arcs = sliceArcs(slices)
  return slices.map((slice, i) => {
    if (slice.kind === 'wildcard') {
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
