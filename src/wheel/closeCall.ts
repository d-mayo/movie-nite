// The close call: a rest near a pinned slice edge with a different outcome across it, as pure rules with no React, DOM or timers.

import { edgeMargin, rotationTo } from './draw.ts'
import type { Arc, Slice } from './layout.ts'
import { halfBendDegrees, pinAngles, pushEnd } from './pins.ts'

// What a slice's outcome is, for telling one across an edge from the same one.
function outcome(slice: Slice): string {
  return slice.kind === 'wildcard' ? 'wildcard' : `viewer:${slice.viewerId}`
}

// The share of spins steered into a close call (on top of those that land in a zone by
// chance), at three spins a night about one night in four has none.
export const closeCallChance = 0.3
// Where a close-call rest falls, in degrees from the slice's pinned edge. Before the start
// edge's pin, the pin has caught the flapper and bent it at least halfway (the most a stop on the same film allows, about 10° to 6.5°) but the wheel stops
// before it slips off, on the same film. Past the end edge's pin, the flapper has slipped off
// it (the push range plus a small allowance) and the wheel stops within `slipReach` of it.
export const bendNearest = 0.3
export const bendFarthest = halfBendDegrees
export const slipClearance = pushEnd + 0.2
export const slipReach = 4

// A bend: the start edge's pin catches the flapper and the wheel stops short of it. A slip:
// the flapper slips off the end edge's pin and the wheel stops just after.
export type CloseCallKind = 'bend' | 'slip'

interface Zone {
  from: number
  to: number
  kind: CloseCallKind
}

// The close-call zones of the slice at `index`, at a pinned edge with a different outcome
// across it (an edge whose pin was thinned away carries nothing). The pointer sweeps down
// through the angles: it comes up to the start edge's pin, or crosses the end edge's pin
// just before the stop. A narrow slice cuts a zone to where it allows a rest.
function zonesOf(slices: Slice[], arcs: Arc[], index: number): Zone[] {
  const pins = pinAngles(arcs)
  const arc = arcs[index]
  const width = arc.end - arc.start
  const margin = edgeMargin(arc)
  const count = slices.length
  const differs = (other: number) => outcome(slices[other]) !== outcome(slices[index])
  const zones: Zone[] = []
  if (pins.includes(arc.start) && differs((index - 1 + count) % count)) {
    zones.push({
      from: arc.start + Math.min(bendNearest, width / 4),
      to: arc.start + Math.min(bendFarthest, width / 2),
      kind: 'bend',
    })
  }
  const nextStart = index === count - 1 ? 0 : arcs[index + 1].start
  if (pins.includes(nextStart) && differs((index + 1) % count)) {
    zones.push({
      from: Math.max(arc.end - slipReach, arc.start + margin),
      to: Math.min(arc.end - slipClearance, arc.end - margin),
      kind: 'slip',
    })
  }
  return zones.filter((zone) => zone.to > zone.from)
}

// The close-call zones of the slice at `index`, as [from, to) wheel angles.
export function closeCallZones(slices: Slice[], arcs: Arc[], index: number): Array<[number, number]> {
  return zonesOf(slices, arcs, index).map(({ from, to }) => [from, to])
}

// Which close call the wheel angle `rest` in the slice at `index` is, if any.
export function closeCallKind(slices: Slice[], arcs: Arc[], index: number, rest: number): CloseCallKind | null {
  return zonesOf(slices, arcs, index).find(({ from, to }) => rest >= from && rest < to)?.kind ?? null
}

// How far (degrees) before the stop at `rest` the end edge's pin slips off the flapper's tongue.
export function slipDegrees(arc: Arc, rest: number): number {
  return arc.end - pushEnd - rest
}

// The shortest spin Length (seconds) that has close calls: a shorter one is still turning
// full circles when the cue would come.
export const closeCallMinSpinSeconds = 5

// Whether the wheel angle `rest` in the slice at `index` is a close call.
export function isCloseCall(slices: Slice[], arcs: Arc[], index: number, rest: number): boolean {
  return closeCallKind(slices, arcs, index, rest) !== null
}

// A rest rotation like `restRotation`'s, but inside a close-call zone, or null when the slice has no such zone. The edge is picked at
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
