// The close call: a rest point near a pinned slice edge with a different
// outcome across it, as pure rules with no React, DOM or timers.

import { edgeMargin, rotationTo } from './draw.ts'
import type { Arc, Slice } from './layout.ts'
import { pinAngles } from './pins.ts'

// A rest is a close call within the slice's edge margin plus this share of its width of an edge.
export const closeCallShare = 0.1

// What a slice's outcome is, for telling one across an edge from the same one.
function outcome(slice: Slice): string {
  return slice.kind === 'wildcard' ? 'wildcard' : `viewer:${slice.viewerId}`
}

// The close-call zone of the slice at `index`, as [from, to) wheel angles, at its start
// edge if that edge carries a pin and has a different outcome across it. The wheel
// turns so the pointer sweeps down through the angles: it comes up to the start edge
// and can stop just short of it (a near miss), while a rest just past the end edge
// has already crossed that pin.
export function closeCallZones(slices: Slice[], arcs: Arc[], index: number): Array<[number, number]> {
  const arc = arcs[index]
  const width = arc.end - arc.start
  const reach = edgeMargin(arc) + closeCallShare * width
  const before = (index - 1 + slices.length) % slices.length
  if (!pinAngles(arcs).includes(arc.start) || outcome(slices[before]) === outcome(slices[index])) return []
  return reach > 0 ? [[arc.start, arc.start + reach]] : []
}

// Whether the wheel angle `rest` in the slice at `index` is a close call.
export function isCloseCall(slices: Slice[], arcs: Arc[], index: number, rest: number): boolean {
  return closeCallZones(slices, arcs, index).some(([from, to]) => rest >= from && rest < to)
}

// A rest rotation like `restRotation`'s, but with the pointer in a close-call zone
// (outside the edge margins), or null when the slice has no such zone. The edge
// is picked at random when both qualify.
export function forcedRestRotation(
  currentRotation: number,
  slices: Slice[],
  arcs: Arc[],
  index: number,
  random: () => number,
  turns: number,
): number | null {
  const margin = edgeMargin(arcs[index])
  const zones = closeCallZones(slices, arcs, index)
    .map(([from, to]): [number, number] => [from + margin, to])
    .filter(([from, to]) => to > from)
  if (zones.length === 0) return null
  const [from, to] = zones[Math.min(zones.length - 1, Math.floor(random() * zones.length))]
  return rotationTo(currentRotation, from + random() * (to - from), turns)
}
