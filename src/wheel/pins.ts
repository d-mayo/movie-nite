// The pins on the reel's strip and the flapper that catches them, as pure
// rules with no React, DOM or timers. A pin sits at a slice edge; the flapper
// is bent by a pin coming up to it and springs back once the pin has passed.
// Rotation grows clockwise, so a wheel point at angle `a` sits at `a + rotation`
// from the top, and a flapper rotation is in SVG degrees: negative swings the
// tip toward +x, the way a clockwise wheel pushes it.

import type { Arc } from './layout.ts'

// A pin starts to bend the flapper this far (degrees of wheel) before the pointer.
export const pinReachDegrees = 3.6
export const maxBendDegrees = 30
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

// The bend a pin asks for: toward the direction of motion, by the maximum times
// how near the pin is, for a pin within reach on the side the wheel is moving from.
export function targetBend(pins: number[], rotation: number, direction: Direction): number {
  let nearness = 0
  for (const pin of pins) {
    // Where the pin is from the pointer, in (-180, 180]: negative is counter-clockwise.
    let at = (((pin + rotation) % 360) + 360) % 360
    if (at > 180) at -= 360
    const distance = direction === 1 ? -at : at
    if (distance < 0 || distance >= pinReachDegrees) continue
    nearness = Math.max(nearness, 1 - distance / pinReachDegrees)
  }
  return nearness === 0 ? 0 : -direction * maxBendDegrees * nearness
}

// One frame of the flapper: a pin that bends it more than it is bent now holds
// it there; otherwise it springs toward straight as a damped spring.
export function flapperStep(state: Flapper, bend: number, seconds: number): Flapper {
  if (bend !== 0 && (bend < 0 ? bend < state.angle : bend > state.angle)) {
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
