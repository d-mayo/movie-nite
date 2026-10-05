import { viewersOnWheel, type AppState, type Nomination } from '../state/model.ts'
import { defaultLayout, sliceArcs, type Arc, type Slice } from './layout.ts'

export interface Wedge {
  slice: Slice
  arc: Arc
  color: string
  viewerName: string | null
  nomination: Nomination | null
}

function colorFor(index: number): string {
  return `hsl(${(index * 137.5) % 360} 55% 42%)`
}

// Resolves every slice of the default layout with what a wedge draws.
export function buildWedges(night: AppState['night'], roster: AppState['roster']): Wedge[] {
  const slices = defaultLayout(viewersOnWheel(night), night.nominations)
  const arcs = sliceArcs(slices)
  return slices.map((slice, i) => {
    if (slice.kind === 'wildcard') {
      return {
        slice,
        arc: arcs[i],
        color: 'hsl(0 0% 25%)',
        viewerName: null,
        nomination: null,
      }
    }
    return {
      slice,
      arc: arcs[i],
      color: colorFor(night.presentIds.indexOf(slice.viewerId)),
      viewerName: roster.find((v) => v.id === slice.viewerId)?.name ?? '',
      nomination: night.nominations[slice.viewerId] ?? null,
    }
  })
}
