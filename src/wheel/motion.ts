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

// A close call stretches the glide's last `leadMs` over `leadMs + extraMs`.
export interface Stretch {
  leadMs: number
  extraMs: number
}

// The close call's end of the glide: the last 1.4 s take 2.9 s, and the zoom
// holds 1.3 s after the stop and eases back over 0.7 s before the reveal opens.
export const closeCallLeadMs = 1400
export const closeCallExtraMs = 1500
export const closeCallHoldMs = 2000

export interface CloseCallTiming {
  phases: Phases
  // Null for reduced motion, which has no stretch.
  stretch: Stretch | null
  // When the cue (zoom, gasp, drumroll) fires, in ms from the press.
  cueMs: number
  // How long after the stop the reveal waits (zero with reduced motion or a test's `totalMs`).
  holdMs: number
}

// The timing of a close-call spin whose glide is `glideMs`. The stretch starts
// `closeCallLeadMs` before the ordinary glide's end (at the glide's start for a
// shorter glide), and the cue fires there. With `totalMs` the whole stretched
// spin shrinks to fit it, as in `spinPhases`, with no hold. With reduced motion
// the path is the ordinary reduced one: no stretch or hold, the cue at the start.
export function closeCallTiming(glideMs: number, reducedMotion: boolean, totalMs?: number): CloseCallTiming {
  if (reducedMotion) {
    return { phases: { windUpMs, glideMs }, stretch: null, cueMs: 0, holdMs: 0 }
  }
  const leadMs = Math.min(closeCallLeadMs, glideMs)
  const scale = totalMs === undefined ? 1 : totalMs / (windUpMs + glideMs + closeCallExtraMs)
  return {
    phases: { windUpMs: windUpMs * scale, glideMs: glideMs * scale },
    stretch: { leadMs: leadMs * scale, extraMs: closeCallExtraMs * scale },
    cueMs: (windUpMs + glideMs - leadMs) * scale,
    holdMs: totalMs === undefined ? closeCallHoldMs : 0,
  }
}

interface PathInput {
  // The rotation and the forward speed (degrees a second) at the press.
  from: number
  driftSpeed: number
  // The final rotation.
  to: number
  phases: Phases
  stretch?: Stretch
}

// The ordinary glide's time for `ms` into the stretched one: the same until the
// stretch begins, then `1 - (1 - x)^a` over the stretched span, where `a` is the
// stretch ratio, so the speed carries on without a jump and reaches zero at the end.
function glideTime(ms: number, glideMs: number, stretch?: Stretch): number {
  if (!stretch) return ms
  const begin = glideMs - stretch.leadMs
  if (ms <= begin) return ms
  const span = stretch.leadMs + stretch.extraMs
  const ratio = span / stretch.leadMs
  const x = Math.min((ms - begin) / span, 1)
  return begin + stretch.leadMs * (1 - (1 - x) ** ratio)
}

export function buildSpinPath({ from, driftSpeed, to, phases, stretch }: PathInput): SpinPath {
  const windUpEnd = from - windUpDegrees
  const glideStart = phases.windUpMs
  const durationMs = glideStart + phases.glideMs + (stretch?.extraMs ?? 0)
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
    const u = glideTime(elapsedMs - glideStart, phases.glideMs, stretch) / phases.glideMs
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
