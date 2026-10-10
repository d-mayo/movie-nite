import { expect, test } from 'vitest'
import { angleUnderPointer, edgeMargin, restRotation } from './draw.ts'
import type { Arc } from './layout.ts'
import {
  buildReducedSpinPath,
  buildSpinPath,
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
    arc,
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
    const total = glideEnd + 750

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

test('T2: the overshoot is small and the pointer stays in the slice once in', () => {
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
        arc: slice,
        phases: spinPhases(20_000),
      })
      expect(rest).toBeGreaterThanOrEqual(slice.start + edgeMargin(slice) - 1e-6)
      const peak = path.rotationAt(500 + 20_000) - to
      expect(peak).toBeLessThanOrEqual(Math.min(1.4, (rest - slice.start) / 2) + 1e-9)
      expect(peak).toBeGreaterThanOrEqual(0)

      let lastEnter = 0
      let inside = false
      for (let t = 0; t <= path.durationMs; t += 2) {
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

test('spinPhases keeps the glide at its length and scales to a total', () => {
  expect(spinPhases(7000)).toEqual({ windUpMs: 500, glideMs: 7000, rockMs: 750 })
  const scaled = spinPhases(7000, 20)
  expect(scaled.windUpMs + scaled.glideMs + scaled.rockMs).toBeCloseTo(20, 9)
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
