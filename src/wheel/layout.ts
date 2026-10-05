import type { Nomination } from '../state/model.ts'

export type Slice =
  | { kind: 'nomination'; viewerId: string; weight: number }
  | { kind: 'wildcard'; weight: number }

export interface Arc {
  start: number
  end: number
}

const viewerWeight = 5
const slicesPerViewer = 3
const wildcardWeight = 1

// Each present viewer gets three round-robin slices that share weight 5, and
// a weight-1 wildcard follows every third nomination slice, so there is one
// wildcard per viewer. Viewers without a nomination are included so the live
// wheel shows everyone who is present; the layout only needs their ids.
export function defaultLayout(
  presentIds: string[],
  nominations: Record<string, Nomination>,
): Slice[] {
  void nominations
  const slices: Slice[] = []
  let nominationSlices = 0
  for (let round = 0; round < slicesPerViewer; round++) {
    for (const viewerId of presentIds) {
      slices.push({
        kind: 'nomination',
        viewerId,
        weight: viewerWeight / slicesPerViewer,
      })
      nominationSlices++
      if (nominationSlices % 3 === 0) {
        slices.push({ kind: 'wildcard', weight: wildcardWeight })
      }
    }
  }
  return slices
}

export function sliceArcs(slices: Slice[]): Arc[] {
  const total = slices.reduce((sum, s) => sum + s.weight, 0)
  let start = 0
  return slices.map((s, i) => {
    const end = i === slices.length - 1 ? 360 : start + (s.weight / total) * 360
    const arc = { start, end }
    start = end
    return arc
  })
}
