// The close call: a rest that leaves the flapper touching a pin with a different
// outcome across it, as pure rules with no React, DOM or timers.

import { edgeMargin, rotationTo } from './draw.ts'
import type { Arc, Slice } from './layout.ts'
import { pinAngles, pushEnd, pushStart } from './pins.ts'

// What a slice's outcome is, for telling one across an edge from the same one.
function outcome(slice: Slice): string {
  return slice.kind === 'wildcard' ? 'wildcard' : `viewer:${slice.viewerId}`
}

// The close-call zones of the slice at `index`, as [from, to) wheel angles: where a rest
// leaves the flapper touching a pin at one of its edges (inside the pin's push range, as
// `pins.ts` has it) with a different outcome across that edge. The pointer sweeps down
// through the angles: just short of the start edge's pin it touches the tongue's near
// side, and just past the end edge's pin the pin still holds the tongue bent. The zones
// start outside the edge margin, where a rest can fall. An edge whose pin was thinned
// away carries nothing.
export function closeCallZones(slices: Slice[], arcs: Arc[], index: number): Array<[number, number]> {
  const pins = pinAngles(arcs)
  const arc = arcs[index]
  const margin = edgeMargin(arc)
  const count = slices.length
  const differs = (other: number) => outcome(slices[other]) !== outcome(slices[index])
  const zones: Array<[number, number]> = []
  if (pins.includes(arc.start) && differs((index - 1 + count) % count)) {
    zones.push([arc.start + margin, arc.start - pushStart])
  }
  const nextStart = index === count - 1 ? 0 : arcs[index + 1].start
  if (pins.includes(nextStart) && differs((index + 1) % count)) {
    zones.push([arc.end - pushEnd, arc.end - margin])
  }
  // Narrow slices: a push range wider than the slice is cut to where a rest can fall.
  return zones
    .map(([from, to]): [number, number] => [Math.max(from, arc.start + margin), Math.min(to, arc.end - margin)])
    .filter(([from, to]) => to > from)
}

// Whether the wheel angle `rest` in the slice at `index` leaves the flapper touching a pin.
export function isCloseCall(slices: Slice[], arcs: Arc[], index: number, rest: number): boolean {
  return closeCallZones(slices, arcs, index).some(([from, to]) => rest >= from && rest < to)
}

// A rest rotation like `restRotation`'s, but with the flapper touching a pin (inside a
// close-call zone), or null when the slice has no such zone. The edge is picked at
// random when both qualify.
export function forcedRestRotation(
  currentRotation: number,
  slices: Slice[],
  arcs: Arc[],
  index: number,
  random: () => number,
  turns: number,
): number | null {
  const zones = closeCallZones(slices, arcs, index)
  if (zones.length === 0) return null
  const [from, to] = zones[Math.min(zones.length - 1, Math.floor(random() * zones.length))]
  return rotationTo(currentRotation, from + random() * (to - from), turns)
}
