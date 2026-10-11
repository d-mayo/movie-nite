import { expect, test } from 'vitest'
import { angleUnderPointer, edgeMargin, restRotation } from './draw.ts'
import type { Arc } from './layout.ts'
import {
  buildReducedSpinPath,
  buildSpinPath,
  buildCloseCallPath,
  closeCallApproachDegrees,
  closeCallCreepSeconds,
  closeCallEaseSeconds,
  driftSpeedStep,
  glideProgress,
  spinPhases,
} from './motion.ts'

const arc: Arc = { start: 100, end: 160 }

function pathFor(from: number, driftSpeed: number, glideSeconds: number, turns: number) {
  const to = restRotation(from, [arc], 0, () => 0.5, turns)
  const path = buildSpinPath({
    from,
    driftSpeed,
    to,
    phases: spinPhases(glideSeconds * 1000),
  })
  return { to, path }
}

const cases = [
  [0, 0, 2, 3],
  [123.4, 4, 7, 14],
  [-50, 4, 20, 60],
  [800, 0, 7, 14],
] as const

test('T1: the path starts at the drift, winds up 11° back, and is continuous', () => {
  for (const [from, drift, length, turns] of cases) {
    const { to, path } = pathFor(from, drift, length, turns)
    const glideEnd = 500 + length * 1000
    const total = glideEnd

    expect(path.rotationAt(0)).toBeCloseTo(from, 9)
    const speed = (path.rotationAt(0.01) - path.rotationAt(0)) * 1e5
    expect(speed).toBeCloseTo(drift, 1)

    let min = Infinity
    for (let t = 0; t <= 500; t += 1) min = Math.min(min, path.rotationAt(t))
    expect(Math.abs(min - (from - 11))).toBeLessThan(0.5)
    expect(path.rotationAt(500)).toBeCloseTo(from - 11, 6)

    expect(path.durationMs).toBe(total)
    for (const edge of [500, glideEnd]) {
      expect(Math.abs(path.rotationAt(edge + 1) - path.rotationAt(edge))).toBeLessThan(0.5)
      expect(Math.abs(path.rotationAt(edge) - path.rotationAt(edge - 1))).toBeLessThan(0.5)
    }

    // The glide never moves backward and slows down.
    let prev = path.rotationAt(500)
    for (let t = 501; t <= glideEnd; t += 5) {
      const now = path.rotationAt(t)
      expect(now).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = now
    }
    const speedAt = (share: number) => {
      const t = 500 + length * 1000 * share
      return path.rotationAt(t + 1) - path.rotationAt(t)
    }
    expect(speedAt(0.1)).toBeGreaterThan(speedAt(0.5))
    expect(speedAt(0.5)).toBeGreaterThan(speedAt(0.9))
    expect(speedAt(0.999)).toBeLessThan(speedAt(0.9) / 3)

    expect(path.rotationAt(total)).toBe(to)
    expect(path.rotationAt(total + 100)).toBe(to)
    expect(Math.abs(path.rotationAt(total - 0.001) - to)).toBeLessThan(0.01)
  }
})

test('T2: the wheel never passes the rest point, and stays in the slice once in', () => {
  for (const width of [2.3, 5, 20, 60, 180]) {
    const slice: Arc = { start: 100, end: 100 + width }
    for (const random of [0, 1 - 1e-12]) {
      const from = 33
      const to = restRotation(from, [slice], 0, () => random, 60)
      const rest = angleUnderPointer(to)
      const path = buildSpinPath({
        from,
        driftSpeed: 4,
        to,
        phases: spinPhases(20_000),
      })
      expect(rest).toBeGreaterThanOrEqual(slice.start + edgeMargin(slice) - 1e-6)

      let lastEnter = 0
      let inside = false
      for (let t = 0; t <= path.durationMs; t += 2) {
        expect(path.rotationAt(t)).toBeLessThanOrEqual(to + 1e-9)
        const angle = angleUnderPointer(path.rotationAt(t))
        const now = angle >= slice.start && angle <= slice.end
        if (now && !inside) lastEnter = t
        inside = now
      }
      expect(inside).toBe(true)
      for (let t = lastEnter; t <= path.durationMs; t += 2) {
        const angle = angleUnderPointer(path.rotationAt(t))
        expect(angle).toBeGreaterThanOrEqual(slice.start)
        expect(angle).toBeLessThanOrEqual(slice.end)
      }
    }
  }
})

test('the glide keeps creeping through the last slices', () => {
  // At the default 6 s and 5 turns, the last 30° of the glide takes over 2.5 s
  // and the last 5° about 1.7 s, and the speed has all but died out well
  // before the end, so nothing is left to stop abruptly.
  const { to, path } = pathFor(0, 0, 6, 5)
  const glideEnd = 500 + 6000
  const secondsWithin = (degrees: number) => {
    let t = glideEnd
    while (t > 500 && to - path.rotationAt(t) < degrees) t -= 1
    return (glideEnd - t) / 1000
  }
  expect(secondsWithin(30)).toBeGreaterThan(2.5)
  expect(secondsWithin(5)).toBeGreaterThan(1.6)
  const speedAt = (secondsLeft: number) => {
    const t = glideEnd - secondsLeft * 1000
    return (path.rotationAt(t + 1) - path.rotationAt(t)) * 1000
  }
  expect(speedAt(1)).toBeLessThan(4)
  expect(speedAt(0.5)).toBeLessThan(1.5)
  expect(speedAt(0.1)).toBeLessThan(0.2)
})

test('spinPhases keeps the glide at its length and scales to a total', () => {
  expect(spinPhases(7000)).toEqual({ windUpMs: 500, glideMs: 7000 })
  const scaled = spinPhases(7000, 20)
  expect(scaled.windUpMs + scaled.glideMs).toBeCloseTo(20, 9)
})

test('glideProgress runs from 0 to 1', () => {
  expect(glideProgress(0)).toBe(0)
  expect(glideProgress(1)).toBe(1)
  expect(glideProgress(0.5)).toBeGreaterThan(0.5)
})

test('T6: the reduced-motion path is the glide curve, in range', () => {
  const path = buildReducedSpinPath(10, 370, 1000)
  expect(path.durationMs).toBe(1000)
  expect(path.rotationAt(0)).toBe(10)
  expect(path.rotationAt(1000)).toBe(370)
  for (let t = 0; t <= 1000; t += 10) {
    expect(path.rotationAt(t)).toBeGreaterThanOrEqual(10)
    expect(path.rotationAt(t)).toBeLessThanOrEqual(370)
  }
})

test('the drift speed eases toward its target and caps a long frame', () => {
  let speed = 0
  for (let i = 0; i < 60; i++) speed = driftSpeedStep(speed, 4, 1 / 60)
  expect(speed).toBeGreaterThan(3.6)
  expect(speed).toBeLessThan(4)
  for (let i = 0; i < 60; i++) speed = driftSpeedStep(speed, 0, 1 / 60)
  expect(speed).toBeLessThan(0.2)
  for (let i = 0; i < 180; i++) speed = driftSpeedStep(speed, 0, 1 / 60)
  expect(speed).toBe(0)
  expect(driftSpeedStep(0, 4, 10)).toBe(driftSpeedStep(0, 4, 0.1))
})

function closeCallPaths(glideSeconds: number, from = 0, driftSpeed = 4, turns = 3, scale = 1) {
  const to = restRotation(from, [arc], 0, () => 0.5, turns)
  const ordinary = buildSpinPath({ from, driftSpeed, to, phases: spinPhases(glideSeconds * 1000) })
  return { to, ordinary, ...buildCloseCallPath(ordinary, to, scale) }
}

test('T3: the close-call path matches the ordinary one until the approach, ends on the rest and runs longer', () => {
  for (const glide of [2, 4, 6]) {
    const { to, ordinary, path, cueMs } = closeCallPaths(glide)
    expect(path.rotationAt(path.durationMs)).toBe(to)
    expect(path.durationMs).toBeGreaterThan(ordinary.durationMs)
    for (let ms = 0; ms <= cueMs; ms += 25) {
      expect(path.rotationAt(ms)).toBeCloseTo(ordinary.rotationAt(ms), 9)
    }
    // The approach starts with about the set distance to go.
    expect(to - ordinary.rotationAt(cueMs)).toBeGreaterThan(closeCallApproachDegrees - 0.5)
    expect(path.durationMs - cueMs).toBeCloseTo((closeCallEaseSeconds + closeCallCreepSeconds) * 1000, 6)
  }
})

test('T3: the path is monotonic with no jump in speed where the approach begins, and the wheel still visibly creeps late', () => {
  const { to, path, cueMs } = closeCallPaths(6)
  let previous = path.rotationAt(cueMs)
  for (let ms = cueMs + 5; ms <= path.durationMs; ms += 5) {
    const now = path.rotationAt(ms)
    expect(now).toBeGreaterThanOrEqual(previous - 1e-9)
    previous = now
  }
  const speed = (ms: number) => (path.rotationAt(ms + 0.1) - path.rotationAt(ms - 0.1)) / 0.2
  const before = speed(cueMs - 0.5)
  const after = speed(cueMs + 0.5)
  expect(Math.abs(after - before)).toBeLessThan(Math.max(before, after) * 0.01)
  // Two seconds before the stop the wheel still has real distance to go and moves
  // at a visible speed, where the ordinary glide has long since stopped.
  expect(to - path.rotationAt(path.durationMs - 2000)).toBeGreaterThan(0.5)
  expect(speed(path.durationMs - 2000)).toBeGreaterThan(0.0005)
})

test('T3: a test scale shortens the approach in proportion', () => {
  const full = closeCallPaths(2)
  const scaled = closeCallPaths(2, 0, 4, 3, 0.1)
  expect(scaled.path.durationMs - scaled.cueMs).toBeCloseTo((full.path.durationMs - full.cueMs) / 10, 6)
  expect(scaled.path.rotationAt(scaled.path.durationMs)).toBe(scaled.to)
})
