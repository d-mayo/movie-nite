// The pins on the reel's strip and the flapper that catches them, as pure
// rules with no React, DOM or timers. A pin sits at a slice edge; the flapper
// is bent by a pin coming up to it and springs back once the pin has passed.
// Rotation grows clockwise, so a wheel point at angle `a` sits at `a + rotation`
// from the top, and a flapper rotation is in SVG degrees: negative swings the
// tip toward +x, the way a clockwise wheel pushes it.

import type { Arc } from './layout.ts'

export const maxBendDegrees = 30
// The flapper hangs from a pivot screw this far from the hub (SVG y, above the strip).
export const pivotY = -118
// Pins are centered on this radius, and the flapper's tongue meets them there.
export const pinTrackRadius = 106
// How far the contact point is from the pivot, and how far from a pin's center the
// tongue's side is when they touch (the pin's radius plus half the tongue's width).
const lever = -pivotY - pinTrackRadius
const contactClearance = 2.7
export const springStiffness = 900
export const springDamping = 16
// No two pins on the wheel are closer than this, wrapping round at 360°.
export const minPinGapDegrees = 2
// The spring is stepped in pieces of at most this long, so a 100 ms frame is stable.
const maxSubstepSeconds = 0.004

export type Direction = 1 | -1

export interface Flapper {
  angle: number
  velocity: number
}

// The pin angles: each arc's start, except an edge less than the minimum gap
// after the last pin kept, or less than it before 360° (the first pin, going round).
export function pinAngles(arcs: Arc[]): number[] {
  const pins: number[] = []
  for (const { start } of arcs) {
    if (pins.length > 0 && (start - pins[pins.length - 1] < minPinGapDegrees || 360 - start < minPinGapDegrees)) {
      continue
    }
    pins.push(start)
  }
  return pins
}

// The direction of motion: the sign of the last change, kept while still.
export function nextDirection(direction: Direction, change: number): Direction {
  return change > 0 ? 1 : change < 0 ? -1 : direction
}

const degrees = (rad: number) => (rad * 180) / Math.PI

// Where a pin pushes the tongue, as the pin's angle from the pointer (clockwise
// positive): it touches the tongue's near side `contactClearance` before the
// pointer and keeps pushing until the tongue is bent the maximum, and then the
// tongue slips off it.
const pushStart = -degrees(Math.asin(contactClearance / pinTrackRadius))
const pushEnd = degrees(
  Math.asin((lever * Math.sin((maxBendDegrees * Math.PI) / 180) - contactClearance) / pinTrackRadius),
)

// The bend (degrees, positive) of a tongue pushed by a pin at `at` degrees from the pointer.
function pushedBend(at: number): number {
  const x = pinTrackRadius * Math.sin((at * Math.PI) / 180) + contactClearance
  return degrees(Math.asin(Math.min(Math.max(x / lever, 0), 1)))
}

// The bend the pins ask for over one frame, as the wheel turns from `from` to `to`:
// a pin pushes the tongue along with it, toward the direction of motion, from
// where it touches until the tongue slips off; the most any pin pushed it during
// the frame counts, so a fast wheel that crosses a pin in one frame still bends
// it fully. A still wheel (`from` equal to `to`) is held by a pin in the push range.
export function targetBend(pins: number[], from: number, to: number, direction: Direction): number {
  let bend = 0
  for (const pin of pins) {
    const start = direction * ((((pin + from) % 360) + 540) % 360 - 180)
    // Taking the pin's angle in (-180, 180]; its images a turn away matter for a fast frame.
    for (const turn of [-360, 0, 360]) {
      const a0 = start + direction * turn
      const a1 = a0 + direction * (to - from)
      const low = Math.min(a0, a1)
      const high = Math.max(a0, a1)
      if (high < pushStart || low > pushEnd) continue
      // `a1` is where the pin ends up; a pin moving the other way gets nothing from this side.
      if (a1 < a0) continue
      bend = Math.max(bend, pushedBend(Math.min(Math.max(a1, pushStart), pushEnd)))
    }
  }
  return bend === 0 ? 0 : -direction * Math.min(bend, maxBendDegrees)
}

// One frame of the flapper: a pin that bends it more than it is bent now holds
// it there; otherwise it springs toward straight as a damped spring.
export function flapperStep(state: Flapper, bend: number, seconds: number): Flapper {
  if (bend !== 0 && (bend < 0 ? bend <= state.angle : bend >= state.angle)) {
    return { angle: bend, velocity: 0 }
  }
  const steps = Math.max(1, Math.ceil(seconds / maxSubstepSeconds))
  const dt = seconds / steps
  let { angle, velocity } = state
  for (let i = 0; i < steps; i++) {
    velocity += (-springStiffness * angle - springDamping * velocity) * dt
    angle += velocity * dt
  }
  return { angle, velocity }
}

// Straight and still: the loop has nothing left to write.
export function isSettled(state: Flapper): boolean {
  return Math.abs(state.angle) < 0.005 && Math.abs(state.velocity) < 0.05
}
