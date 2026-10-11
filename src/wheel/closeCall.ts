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

// The close-call zones of the slice at `index`, as [from, to) wheel angles: one
// at each edge that carries a pin and has a different outcome across it.
export function closeCallZones(slices: Slice[], arcs: Arc[], index: number): Array<[number, number]> {
  const pins = pinAngles(arcs)
  const arc = arcs[index]
  const width = arc.end - arc.start
  const reach = edgeMargin(arc) + closeCallShare * width
  const zones: Array<[number, number]> = []
  const count = slices.length
  const differs = (other: number) => outcome(slices[other]) !== outcome(slices[index])
  // The start edge is shared with the slice before; the end edge's pin is the next arc's start (360° is the first pin).
  if (pins.includes(arc.start) && differs((index - 1 + count) % count)) {
    zones.push([arc.start, arc.start + reach])
  }
  const nextStart = index === count - 1 ? 0 : arcs[index + 1].start
  if (pins.includes(nextStart) && differs((index + 1) % count)) {
    zones.push([arc.end - reach, arc.end])
  }
  return zones.filter(([from, to]) => to > from)
}

// Whether the wheel angle `rest` in the slice at `index` is a close call.
export function isCloseCall(slices: Slice[], arcs: Arc[], index: number, rest: number): boolean {
  const arc = arcs[index]
  const reach = edgeMargin(arc) + closeCallShare * (arc.end - arc.start)
  return closeCallZones(slices, arcs, index).some(([from, to]) =>
    from === arc.start ? rest - from < reach : to - rest < reach,
  )
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
    .map(([from, to]): [number, number] => (from === arcs[index].start ? [from + margin, to] : [from, to - margin]))
    .filter(([from, to]) => to > from)
  if (zones.length === 0) return null
  const [from, to] = zones[Math.min(zones.length - 1, Math.floor(random() * zones.length))]
  return rotationTo(currentRotation, from + random() * (to - from), turns)
}
