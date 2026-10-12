// The spin's path as a pure function of elapsed time: a wind-up that pulls
// the wheel back, then a glide that slows like friction and creeps onto the
// rest point, where it stops with no speed left. Rotation grows clockwise, so "forward" is a larger rotation and the
// angle under the pointer falls as it grows.

export const windUpMs = 500
export const windUpDegrees = 11

// The idle drift, in degrees a second, and how fast its speed follows its
// target (the time constant gives about 95% of the way in a second).
export const driftDegreesPerSecond = 4
const driftEaseSeconds = 1 / 3
// A longer frame (a background tab pauses requestAnimationFrame) is cut to
// this, so the wheel never jumps on return.
export const maxFrameSeconds = 0.1

const decay = 4
const rampShare = 0.06
const tableSize = 512

// Moves `speed` toward `target` over a frame of `seconds`.
export function driftSpeedStep(speed: number, target: number, seconds: number): number {
  const dt = Math.min(Math.max(seconds, 0), maxFrameSeconds)
  const next = speed + (target - speed) * (1 - Math.exp(-dt / driftEaseSeconds))
  // Close enough: land on the target so a stopped wheel is exactly still.
  return Math.abs(target - next) < 0.01 ? target : next
}

// The glide's speed at u in [0, 1]: a smooth ramp up over the first 6%, then
// `e^(-k·u)` times `(1-u)²`. The square brings the speed to zero with no
// leftover motion, so the last slices click by ever more slowly and the wheel
// settles; a tail that still has speed when it ends (a straight-line or
// square-root fall) looks like a hand stopping the wheel.
function glideSpeed(u: number): number {
  const ramp = u >= rampShare ? 1 : (u / rampShare) ** 2 * (3 - (2 * u) / rampShare)
  return ramp * Math.exp(-decay * u) * (1 - u) ** 2
}

// The glide's cumulative distance, normalized to 1, at tableSize + 1 points.
const glideTable = (() => {
  const table = new Float64Array(tableSize + 1)
  for (let i = 1; i <= tableSize; i++) {
    table[i] =
      table[i - 1] +
      (glideSpeed((i - 1) / tableSize) + glideSpeed(i / tableSize)) / 2 / tableSize
  }
  const total = table[tableSize]
  for (let i = 0; i <= tableSize; i++) table[i] /= total
  return table
})()

// The share of the glide's distance covered at u in [0, 1].
export function glideProgress(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const x = u * tableSize
  const i = Math.floor(x)
  return glideTable[i] + (glideTable[i + 1] - glideTable[i]) * (x - i)
}

export interface Phases {
  windUpMs: number
  glideMs: number
}

// The two phases for a glide of `glideMs`. With `totalMs` they shrink in
// proportion to fit it (used by tests to keep spins short).
export function spinPhases(glideMs: number, totalMs?: number): Phases {
  const phases = { windUpMs, glideMs }
  if (totalMs === undefined) return phases
  const scale = totalMs / (windUpMs + glideMs)
  return {
    windUpMs: windUpMs * scale,
    glideMs: glideMs * scale,
  }
}

export interface SpinPath {
  durationMs: number
  rotationAt: (elapsedMs: number) => number
}

interface PathInput {
  // The rotation and the forward speed (degrees a second) at the press.
  from: number
  driftSpeed: number
  // The final rotation.
  to: number
  phases: Phases
}

export function buildSpinPath({ from, driftSpeed, to, phases }: PathInput): SpinPath {
  const windUpEnd = from - windUpDegrees
  const glideStart = phases.windUpMs
  const durationMs = glideStart + phases.glideMs
  const windSeconds = phases.windUpMs / 1000

  const rotationAt = (elapsedMs: number): number => {
    if (elapsedMs >= durationMs) return to
    if (elapsedMs < glideStart) {
      const s = Math.max(0, elapsedMs / phases.windUpMs)
      const h00 = 2 * s ** 3 - 3 * s ** 2 + 1
      const h10 = s ** 3 - 2 * s ** 2 + s
      const h01 = -2 * s ** 3 + 3 * s ** 2
      return h00 * from + h10 * windSeconds * driftSpeed + h01 * windUpEnd
    }
    const u = (elapsedMs - glideStart) / phases.glideMs
    return windUpEnd + (to - windUpEnd) * glideProgress(u)
  }
  return { durationMs, rotationAt }
}

// Reduced motion: the glide curve alone, from `from` to `to`, with no wind-up.
export function buildReducedSpinPath(
  from: number,
  to: number,
  durationMs: number,
): SpinPath {
  return {
    durationMs,
    rotationAt: (elapsedMs) =>
      from + (to - from) * glideProgress(elapsedMs / durationMs),
  }
}

// A close call's approach: from where the wheel has this far left to go, the ordinary
// glide hands over to a longer one. It brakes smoothly for `closeCallEaseSeconds`
// to a creep, then the creep slows to the rest over `closeCallCreepSeconds`,
// so the wheel keeps visibly inching up to the pin until it stops. The speed carries
// on from the ordinary glide's without a jump, and the path ends on the rest point.
export const closeCallApproachDegrees = 24
export const closeCallEaseSeconds = 0.6
export const closeCallCreepSeconds = 7
// The creep's speed falls as (1 - y)^0.6, so the distance left falls as (1 - y)^1.6: it keeps
// moving at the end, so a pin a few degrees from the rest is crossed within a couple of seconds of the stop.
const creepExponent = 0.6
// How long after the stop the zoom holds, and then eases back, before the reveal opens.
export const closeCallHoldMs = 2000
export const closeCallEaseOutMs = 1000

export interface CloseCallPath {
  path: SpinPath
  // Where the approach begins, in ms from the press: the cue (zoom, gasp, drumroll).
  cueMs: number
}

// The close-call path built on the ordinary `base` that ends at `to`. `scale` shortens
// the braking and the creep (a test's short spin).
export function buildCloseCallPath(base: SpinPath, to: number, scale = 1): CloseCallPath {
  const remaining = (ms: number) => to - base.rotationAt(ms)
  // The ordinary path's forward speed, degrees a second, from a short window round `ms`.
  const speedAt = (ms: number) => {
    const lo = Math.max(ms - 5, 0)
    const hi = Math.min(ms + 5, base.durationMs)
    return ((base.rotationAt(hi) - base.rotationAt(lo)) / (hi - lo)) * 1000
  }
  const ease = closeCallEaseSeconds * scale
  const creep = closeCallCreepSeconds * scale
  const glideStart = windUpMs * scale
  // The earliest hand-over with enough distance left for the braking and a creep.
  let degrees = closeCallApproachDegrees
  let handoff = base.durationMs
  let speed = 0
  for (;;) {
    let lo = Math.min(glideStart, base.durationMs)
    let hi = base.durationMs
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (remaining(mid) > degrees) lo = mid
      else hi = mid
    }
    handoff = hi
    speed = speedAt(handoff)
    if (2 * degrees - ease * speed > 0.1 * degrees || handoff <= glideStart + 1) break
    degrees *= 1.5
  }
  const left = remaining(handoff)
  const creepSpeed = Math.max((left - (ease * speed) / 2) / (ease / 2 + creep / (creepExponent + 1)), 0)
  const easeDistance = (seconds: number) => {
    const x = seconds / ease
    return creepSpeed * seconds + (speed - creepSpeed) * ease * (x - x ** 3 + x ** 4 / 2)
  }
  const durationMs = handoff + (ease + creep) * 1000
  const rotationAt = (ms: number) => {
    if (ms <= handoff) return base.rotationAt(ms)
    if (ms >= durationMs) return to
    const seconds = (ms - handoff) / 1000
    if (seconds < ease) return to - left + easeDistance(seconds)
    const y = (seconds - ease) / creep
    return to - left + easeDistance(ease) + ((creepSpeed * creep) / (creepExponent + 1)) * (1 - (1 - y) ** (creepExponent + 1))
  }
  return { path: { durationMs, rotationAt }, cueMs: handoff }
}

// A catch: the wheel runs on into the slice's start-edge pin, which bends the flapper to a peak, and the
// flapper's spring rocks the wheel back off the pin onto a rest just short of it. The ordinary
// glide is aimed `catchCoastDegrees` past the peak, and a short braking from where it has
// the speed to stop within `catchBrakeSeconds` takes it to the peak with no speed left, and a half-cosine
// rock of `catchRockSeconds` brings it back onto the rest with none either, so the speed has no jump anywhere.
export const catchCoastDegrees = 4
export const catchBrakeSeconds = 0.1
export const catchRockSeconds = 0.5

export interface CatchPath {
  path: SpinPath
  // When the pin first touches the tongue, in ms from the press (before the peak).
  contactMs: number
  // When the wheel is at the peak, in ms from the press.
  peakMs: number
}

interface CatchInput extends Omit<PathInput, 'to'> {
  // The rest rotation.
  to: number
  // How far (degrees) the pin is from the pointer's line at the rest, short of the pointer (positive), and at the peak, past it.
  restGap: number
  peakPast: number
  // The pin's angle from the pointer at which it first touches the tongue (negative).
  touchAt: number
}

// The caught path from `from` (see `PathInput`) to the rest `to`; `scale` shortens the braking and the rock (a test's short spin).
export function buildCatchPath({ restGap, peakPast, touchAt, to, ...input }: CatchInput, scale = 1): CatchPath {
  const peak = to + restGap + peakPast
  const touch = to + restGap + touchAt
  const base = buildSpinPath({ ...input, to: peak + catchCoastDegrees })
  const brake = catchBrakeSeconds * scale
  const rock = catchRockSeconds * scale
  const glideStart = input.phases.windUpMs
  const speedAt = (ms: number) => {
    const lo = Math.max(ms - 5, 0)
    const hi = Math.min(ms + 5, base.durationMs)
    return ((base.rotationAt(hi) - base.rotationAt(lo)) / (hi - lo)) * 1000
  }
  // Where the glide reaches the peak, then the hand-over before it: the braking at constant
  // deceleration covers half the speed times its time, so the distance left to the peak equals that.
  let lo = Math.min(glideStart, base.durationMs)
  let hi = base.durationMs
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (base.rotationAt(mid) < peak) lo = mid
    else hi = mid
  }
  let handoffLo = Math.min(glideStart, base.durationMs)
  let handoffHi = hi
  for (let i = 0; i < 40; i++) {
    const mid = (handoffLo + handoffHi) / 2
    if (peak - base.rotationAt(mid) > (speedAt(mid) * brake) / 2) handoffLo = mid
    else handoffHi = mid
  }
  const handoff = handoffHi
  const handoffAt = base.rotationAt(handoff)
  const handoffSpeed = speedAt(handoff)
  const peakMs = handoff + brake * 1000
  const durationMs = peakMs + rock * 1000
  const rotationAt = (ms: number) => {
    if (ms <= handoff) return base.rotationAt(ms)
    if (ms >= durationMs) return to
    if (ms < peakMs) {
      const seconds = (ms - handoff) / 1000
      return handoffAt + handoffSpeed * (seconds - (seconds * seconds) / (2 * brake))
    }
    const s = (ms - peakMs) / 1000 / rock
    return peak - (peak - to) * ((1 - Math.cos(Math.PI * s)) / 2)
  }
  // The first time the glide has turned to the touch (forward only up to the peak).
  let touchLo = Math.min(glideStart, base.durationMs)
  let touchHi = peakMs
  for (let i = 0; i < 40; i++) {
    const mid = (touchLo + touchHi) / 2
    if (rotationAt(mid) < touch) touchLo = mid
    else touchHi = mid
  }
  return { path: { durationMs, rotationAt }, contactMs: touchHi, peakMs }
}

// The first time (ms into `path`, from `fromMs` on) at which the path has turned to `rotation`,
// for a path that only moves forward from `fromMs`.
export function timeAtRotation(path: SpinPath, rotation: number, fromMs = 0): number {
  let lo = fromMs
  let hi = path.durationMs
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (path.rotationAt(mid) < rotation) lo = mid
    else hi = mid
  }
  return hi
}
