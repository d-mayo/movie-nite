import { describe, expect, test } from 'vitest'
import { sliceArcs, type Slice } from './layout.ts'
import {
  flapperStep,
  isSettled,
  maxBendDegrees,
  minPinGapDegrees,
  contactSide,
  nextDirection,
  pinPastPointer,
  pushEnd,
  pushStart,
  pinAngles,
  pinExits,
  targetBend,
  type Flapper,
} from './pins.ts'

const arcsAt = (starts: number[]) => starts.map((start) => ({ start, end: start + 1 }))

describe('pinAngles', () => {
  test('equal arcs of 30째 give 12 pins at their starts', () => {
    const slices: Slice[] = Array.from({ length: 12 }, () => ({ kind: 'wildcard', weight: 1 }))
    expect(pinAngles(sliceArcs(slices))).toEqual(Array.from({ length: 12 }, (_, i) => i * 30))
  })

  test('one arc gives one pin at 0', () => {
    expect(pinAngles(sliceArcs([{ kind: 'wildcard', weight: 1 }]))).toEqual([0])
  })

  test('edges too close after the last pin, or before 360째, get none', () => {
    expect(pinAngles(arcsAt([0, 0.5, 1.5, 2.1, 3, 359]))).toEqual([0, 2.1])
  })

  test('random wheels: every pin is an arc start and no cyclic gap is under 2째', () => {
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
  // The bend as the wheel creeps forward past a pin at 0 (rotation r, a tiny step).
  const creep = (r: number) => targetBend([0], r - 0.01, r, 1)

  test('forward: a pin pushes the tongue along from where it touches until it slips off', () => {
    expect(creep(-3)).toBe(0)
    expect(creep(-1.6)).toBe(0)
    const bends = [-1.2, -0.6, 0, 0.6, 1.2, 1.7].map(creep)
    for (const bend of bends) expect(bend).toBeLessThan(0)
    for (let i = 1; i < bends.length; i++) expect(bends[i]).toBeLessThan(bends[i - 1])
    expect(bends[bends.length - 1]).toBeGreaterThan(-maxBendDegrees - 1e-9)
    expect(bends[bends.length - 1]).toBeLessThan(-28)
    // Past the end the tongue has slipped off the pin.
    expect(creep(2)).toBe(0)
    expect(creep(5)).toBe(0)
  })

  test('backward mirrors it', () => {
    const back = (r: number) => targetBend([0], r + 0.01, r, -1)
    expect(back(1.6)).toBe(0)
    expect(back(0.6)).toBeCloseTo(-creep(-0.6), 1)
    expect(back(0.6)).toBeGreaterThan(0)
    expect(back(-2)).toBe(0)
  })

  test('a frame that crosses a pin whole bends the tongue fully, one that stops short does not', () => {
    expect(targetBend([0], -8, 8, 1)).toBeCloseTo(-maxBendDegrees, 5)
    expect(targetBend([0], 8, -8, -1)).toBeCloseTo(maxBendDegrees, 5)
    expect(targetBend([0], -10, -5, 1)).toBe(0)
    expect(targetBend([0], -8, 3, 1)).toBeCloseTo(-maxBendDegrees, 5)
  })

  test('a still wheel is held by a pin in the push range, and pins wrap round 360째', () => {
    expect(targetBend([0], 0, 0, 1)).toBeLessThan(-5)
    expect(targetBend([0], -5, -5, 1)).toBe(0)
    expect(targetBend([359], 0.5, 0.51, 1)).toBeLessThan(0)
    expect(targetBend([0], 360, 360.01, 1)).toBeLessThan(0)
    expect(targetBend([0], 719.5, 719.51, 1)).toBeLessThan(0)
  })
})

describe('pinExits', () => {
  // A pin at 0 leaves the push range at about 1.8째 past the pointer.
  test('forward: a frame that carries a pin across the end of the range counts it once', () => {
    expect(pinExits([0], 1, 4, 1)).toBe(1)
    expect(pinExits([0], -8, 8, 1)).toBe(1)
    expect(pinExits([0], 359.9, 364, 1)).toBe(1)
  })

  test('a frame that stops short, or has not reached the range, counts none', () => {
    expect(pinExits([0], -10, -5, 1)).toBe(0)
    expect(pinExits([0], -8, 1, 1)).toBe(0)
    expect(pinExits([0], 3, 8, 1)).toBe(0)
    expect(pinExits([0], 2, 2, 1)).toBe(0)
  })

  test('a fast frame crossing three pins counts three', () => {
    expect(pinExits([0, 350, 340, 330], 0, 30, 1)).toBe(3)
    expect(pinExits([0], 0, 725, 1)).toBe(3)
  })

  test('backward mirrors it, and a pin moving away from the tongue counts none', () => {
    expect(pinExits([0], -1, -4, -1)).toBe(1)
    expect(pinExits([0, 10, 20, 30], 5, -25, -1)).toBe(3)
    expect(pinExits([0], 4, 1, -1)).toBe(0)
    expect(pinExits([0], 1, 4, -1)).toBe(0)
    expect(pinExits([0], 4, 1, 1)).toBe(0)
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
    expect(targetBend([0], -1, -1, direction)).toBeLessThan(0)
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

  test.each([0.016, 0.1])('released from 30째 it swings through 0 and settles in a second (%s s frames)', (frame) => {
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

describe('a pin holding the tongue while the wheel backs off it', () => {
  // The loop's frame: the side, exits, the target bend and the flapper, for a pin at 0.
  function run(angles: number[]) {
    let state: Flapper = { angle: 0, velocity: 0 }
    let side: 1 | -1 = 1
    let direction: 1 | -1 = 1
    let exits = 0
    const frames: Array<{ at: number; angle: number; bend: number }> = []
    for (let i = 1; i < angles.length; i++) {
      const from = angles[i - 1]
      const to = angles[i]
      direction = nextDirection(direction, to - from)
      side = contactSide([0], from, side, direction)
      exits += pinExits([0], from, to, side)
      const bend = targetBend([0], from, to, side, direction)
      state = flapperStep(state, bend, 0.016)
      frames.push({ at: to, angle: state.angle, bend })
    }
    return { frames, exits }
  }
  // Forward to a peak of 20� bend, then back by a half-cosine to 2.5� short of the pin.
  const peak = pinPastPointer(20)
  const forward = Array.from({ length: 80 }, (_, i) => -4 + ((peak + 4) * i) / 79)
  const rock = Array.from({ length: 31 }, (_, i) => peak - (peak + 2.5) * ((1 - Math.cos((Math.PI * i) / 30)) / 2))

  test('the tongue stays bent the forward way, at least as bent as the pin asks, until the pin is out of range', () => {
    const { frames } = run([...forward, ...rock])
    const back = frames.slice(forward.length - 1)
    for (const { at, angle, bend } of back) {
      if (at > pushStart) {
        expect(angle).toBeLessThan(0)
        expect(Math.abs(angle)).toBeGreaterThanOrEqual(Math.abs(bend) - 1e-9)
        expect(bend).toBeLessThan(0)
      }
    }
    expect(Math.abs(frames[forward.length - 2].angle)).toBeCloseTo(20, 1)
  })

  test('once the pin is out of range the flapper springs straight and settles, and no exit was counted', () => {
    const rest = Array.from({ length: 80 }, () => -2.5)
    const { frames, exits } = run([...forward, ...rock, ...rest])
    expect(exits).toBe(0)
    expect(Math.abs(frames[frames.length - 1].angle)).toBeLessThan(0.5)
  })

  test('a forward pass over a pin still counts one exit', () => {
    expect(run(Array.from({ length: 200 }, (_, i) => -4 + i * 0.05)).exits).toBe(1)
  })

  test('a free tongue follows the direction: a pin coming from the far side bends it the other way and counts its exit', () => {
    const { frames, exits } = run(Array.from({ length: 200 }, (_, i) => 6 - i * 0.05))
    expect(exits).toBe(1)
    expect(frames.some((f) => f.angle > 5)).toBe(true)
  })

  test('the side follows the direction when no pin holds the tongue, and stays while one does', () => {
    expect(contactSide([0], 5, 1, -1)).toBe(-1)
    expect(contactSide([0], 0.5, 1, -1)).toBe(1)
    expect(contactSide([0], pushEnd + 0.1, 1, -1)).toBe(-1)
    expect(contactSide([0], 0.5, -1, -1)).toBe(-1)
  })
})
