// The close call: a rest near a pinned slice edge with a different outcome across it, as pure rules with no React, DOM or timers.

import { edgeMargins, endClearance, rotationTo } from './draw.ts'
import type { Arc, Slice } from './layout.ts'
import { maxBendDegrees, pinAngles, pinPastPointer, pushEnd } from './pins.ts'

// What a slice's outcome is, for telling one across an edge from the same one.
function outcome(slice: Slice): string {
  return slice.kind === 'wildcard' ? 'wildcard' : `viewer:${slice.viewerId}`
}

// The share of spins steered into a close call (on top of those that land in a zone by
// chance), at three spins a night about one night in four has none.
export const closeCallChance = 0.3
// Where a close-call rest falls. A bend: the start edge's pin has caught the flapper and holds
// it bent between two thirds and 90% of its full bend (a half bend looks slight), past the pointer's line but not yet slipped
// off, so the flapper still points at the film the pin is pushing it onto, the drawn one. A
// slip: the flapper has slipped off the end edge's pin (the push range plus a small allowance)
// and the wheel stops within `slipReach` of it.
export const bendLeast = (maxBendDegrees * 2) / 3
export const bendMost = maxBendDegrees * 0.9
export const slipClearance = endClearance
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
  const margins = edgeMargins(arc)
  const count = slices.length
  const differs = (other: number) => outcome(slices[other]) !== outcome(slices[index])
  const zones: Zone[] = []
  if (pins.includes(arc.start) && differs((index - 1 + count) % count)) {
    // The pointer's line sits just on the other side of the pin, in the neighbor's angles.
    zones.push({ from: arc.start - pinPastPointer(bendMost), to: arc.start - pinPastPointer(bendLeast), kind: 'bend' })
  }
  const nextStart = index === count - 1 ? 0 : arcs[index + 1].start
  if (pins.includes(nextStart) && differs((index + 1) % count)) {
    zones.push({
      from: Math.max(arc.end - slipReach, arc.start + margins.start),
      to: Math.min(arc.end - slipClearance, arc.end - margins.end),
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
  // A bend near 0° is in the angles just below 360°.
  return (
    zonesOf(slices, arcs, index).find(({ from, to }) =>
      [rest - 360, rest, rest + 360].some((angle) => angle >= from && angle < to),
    )?.kind ?? null
  )
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
