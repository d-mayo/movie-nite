import { describe, expect, test } from 'vitest'
import { sliceArcs, type Slice } from './layout.ts'
import {
  flapperStep,
  isSettled,
  maxBendDegrees,
  minPinGapDegrees,
  nextDirection,
  pinAngles,
  pinReachDegrees,
  targetBend,
  type Flapper,
} from './pins.ts'

const arcsAt = (starts: number[]) => starts.map((start) => ({ start, end: start + 1 }))

describe('pinAngles', () => {
  test('equal arcs of 30° give 12 pins at their starts', () => {
    const slices: Slice[] = Array.from({ length: 12 }, () => ({ kind: 'wildcard', weight: 1 }))
    expect(pinAngles(sliceArcs(slices))).toEqual(Array.from({ length: 12 }, (_, i) => i * 30))
  })

  test('one arc gives one pin at 0', () => {
    expect(pinAngles(sliceArcs([{ kind: 'wildcard', weight: 1 }]))).toEqual([0])
  })

  test('edges too close after the last pin, or before 360°, get none', () => {
    expect(pinAngles(arcsAt([0, 0.5, 1.5, 2.1, 3, 359]))).toEqual([0, 2.1])
  })

  test('random wheels: every pin is an arc start and no cyclic gap is under 2°', () => {
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let round = 0; round < 200; round++) {
      const count = 1 + Math.floor(random() * 156)
      const slices: Slice[] = Array.from({ length: count }, () => ({
        kind: 'wildcard',
        weight: 0.5 + random() * 19.5,
      }))
      const arcs = sliceArcs(slices)
      const pins = pinAngles(arcs)
      const starts = new Set(arcs.map((a) => a.start))
      expect(pins.every((p) => starts.has(p))).toBe(true)
      if (pins.length > 1) {
        pins.forEach((p, i) => {
          const next = i === pins.length - 1 ? pins[0] + 360 : pins[i + 1]
          expect(next - p).toBeGreaterThanOrEqual(minPinGapDegrees)
        })
      }
    }
  })
})

describe('targetBend', () => {
  test('forward: bends toward +x by how near the pin is, only before the pointer', () => {
    expect(targetBend([0], -pinReachDegrees, 1)).toBe(0)
    expect(targetBend([0], -1.8, 1)).toBeCloseTo(-maxBendDegrees / 2)
    const near = targetBend([0], -0.01, 1)
    expect(near).toBeLessThan(-29.9)
    expect(near).toBeGreaterThanOrEqual(-maxBendDegrees)
    expect(targetBend([0], 0.01, 1)).toBe(0)
  })

  test('backward mirrors it', () => {
    expect(targetBend([0], 1.8, -1)).toBeCloseTo(maxBendDegrees / 2)
    expect(targetBend([0], 0.01, -1)).toBeGreaterThan(29.9)
    expect(targetBend([0], -0.01, -1)).toBe(0)
  })

  test('the nearer of two pins decides, and pins wrap round 360°', () => {
    // Pins at 0 and 2, wheel at -2.5: the pin at 2 is 0.5 short; the one at 0 is 2.5 short.
    expect(targetBend([0, 2], -2.5, 1)).toBeCloseTo(-30 * (1 - 0.5 / 3.6))
    // A pin at 359 with the wheel at 0.2 sits at 359.2, which is 0.8 short of the pointer.
    expect(targetBend([359], 0.2, 1)).toBeCloseTo(-30 * (1 - 0.8 / 3.6))
    expect(targetBend([359], 1, 1)).toBe(-30)
  })
})

describe('nextDirection', () => {
  test('forward from the start, flips on the other sign, keeps on zero', () => {
    expect(nextDirection(1, 0)).toBe(1)
    expect(nextDirection(1, -0.2)).toBe(-1)
    expect(nextDirection(-1, 0)).toBe(-1)
    expect(nextDirection(-1, 0.2)).toBe(1)
  })

  test('a still wheel keeps its bend against a pin on the side it came from', () => {
    const direction = nextDirection(1, 0)
    expect(targetBend([0], -1.2, direction)).toBeLessThan(0)
  })
})

describe('flapperStep', () => {
  function release(frame: number) {
    let state: Flapper = { angle: -maxBendDegrees, velocity: 0 }
    let crossed = false
    let peak = 0
    for (let t = 0; t < 1 - 1e-9; t += frame) {
      state = flapperStep(state, 0, frame)
      if (state.angle > 0) crossed = true
      peak = Math.max(peak, Math.abs(state.angle))
    }
    return { crossed, peak, end: state }
  }

  test.each([0.016, 0.1])('released from 30° it swings through 0 and settles in a second (%s s frames)', (frame) => {
    const { crossed, peak, end } = release(frame)
    expect(crossed).toBe(true)
    expect(peak).toBeLessThanOrEqual(maxBendDegrees)
    expect(Math.abs(end.angle)).toBeLessThan(0.5)
  })

  test('a pin that bends it more holds it; a lesser one lets it spring', () => {
    expect(flapperStep({ angle: -5, velocity: 3 }, -20, 0.016)).toEqual({ angle: -20, velocity: 0 })
    expect(flapperStep({ angle: -5, velocity: 0 }, 5, 0.016)).toEqual({ angle: 5, velocity: 0 })
    expect(flapperStep({ angle: -20, velocity: 0 }, -5, 0.016).angle).toBeGreaterThan(-20)
  })

  test('settled means straight and still', () => {
    expect(isSettled({ angle: 0, velocity: 0 })).toBe(true)
    expect(isSettled({ angle: -3, velocity: 0 })).toBe(false)
  })
})
