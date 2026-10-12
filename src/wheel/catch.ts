// The catch: a rest just short of a slice's start-edge pin, where the pin has caught the
// wheel and the flapper's spring has rocked it back off, as pure rules with no React, DOM or timers.

import { edgeMargin, rotationTo } from './draw.ts'
import type { Arc, Slice } from './layout.ts'
import { closeCallZones, slipClearance } from './closeCall.ts'
import { pinAngles } from './pins.ts'

// The share of spins steered into a catch (on top of those that land in a zone by chance): a
// zone is only about 1° wide, so by chance alone a catch would hardly be seen.
export const catchChance = 1 / 3
// How wide a catch zone is, in degrees. It starts `slipClearance` past the slice's start, a
// pin just outside the push range on the near side.
export const catchWidth = 1

// The catch zone of the slice at `index`, as a [from, to) wheel-angle range, or null when the
// slice has none: its start edge carries no pin, the zone does not fit before its end margin, or it overlaps a close-call zone.
export function catchZone(slices: Slice[], arcs: Arc[], index: number): [number, number] | null {
  const arc = arcs[index]
  if (!pinAngles(arcs).includes(arc.start)) return null
  const from = arc.start + slipClearance
  const to = from + catchWidth
  if (to > arc.end - edgeMargin(arc)) return null
  if (closeCallZones(slices, arcs, index).some(([zoneFrom, zoneTo]) => from < zoneTo && zoneFrom < to)) return null
  return [from, to]
}

// Whether the wheel angle `rest` in the slice at `index` is a catch.
export function isCatch(slices: Slice[], arcs: Arc[], index: number, rest: number): boolean {
  const zone = catchZone(slices, arcs, index)
  return zone !== null && [rest - 360, rest, rest + 360].some((angle) => angle >= zone[0] && angle < zone[1])
}

// A rest rotation like `restRotation`'s, but inside the slice's catch zone, or null when it has none.
export function forcedCatchRotation(
  currentRotation: number,
  slices: Slice[],
  arcs: Arc[],
  index: number,
  random: () => number,
  turns: number,
): number | null {
  const zone = catchZone(slices, arcs, index)
  if (zone === null) return null
  return rotationTo(currentRotation, zone[0] + random() * (zone[1] - zone[0]), turns)
}
