import { expect, test } from 'vitest'
import {
  angleUnderPointer,
  cryptoRandom,
  drawSlice,
  edgeMargins,
  endClearance,
  pushAllowance,
  restRotation,
  startClearance,
} from './draw.ts'
import { pinAngles, pushEnd, pushStart, targetBend } from './pins.ts'
import { sliceArcs } from './layout.ts'
import { defaultWheelSettings, deriveSlices } from './edit.ts'

const slices = deriveSlices(['A', 'B', 'C'], defaultWheelSettings, {})
const total = slices.reduce((sum, s) => sum + s.weight, 0)

// Small seeded PRNG (mulberry32).
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

test('boundaries select the expected slice', () => {
  expect(drawSlice(slices, () => 0)).toBe(0)
  let cumulative = 0
  slices.forEach((s, i) => {
    const before = (cumulative + s.weight - 1e-9) / total
    expect(drawSlice(slices, () => before)).toBe(i)
    cumulative += s.weight
    if (i < slices.length - 1) {
      expect(drawSlice(slices, () => (cumulative + 1e-9) / total)).toBe(i + 1)
    }
  })
})

test('draw frequencies follow the weights', () => {
  const random = seeded(42)
  const n = 100_000
  const counts = slices.map(() => 0)
  for (let i = 0; i < n; i++) counts[drawSlice(slices, random)]++
  slices.forEach((s, i) => {
    expect(Math.abs(counts[i] / n - s.weight / total)).toBeLessThan(0.01)
  })
  const wild = slices.reduce(
    (sum, s, i) => (s.kind === 'wildcard' ? sum + counts[i] : sum),
    0,
  )
  expect(Math.abs(wild / n - 3 / 18)).toBeLessThan(0.01)
})

test('cryptoRandom stays in [0, 1)', () => {
  for (let i = 0; i < 1000; i++) {
    const v = cryptoRandom()
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  }
})

test('restRotation spreads the pointer across the slice but its margins and adds the turns', () => {
  const wide = sliceArcs(slices)
  const narrow = sliceArcs(
    Array.from({ length: 156 }, () => ({ kind: 'wildcard' as const, weight: 1 })),
  )
  for (const arcs of [wide, narrow]) {
    const random = seeded(7)
    let nearEdge = 0
    for (let n = 0; n < 2000; n++) {
      const index = Math.floor(random() * arcs.length)
      const current = random() * 2000
      const turns = 4 + Math.floor(random() * 3)
      const final = restRotation(current, arcs, index, random, turns)
      expect(final - current).toBeGreaterThanOrEqual(turns * 360)
      expect(final - current).toBeLessThan((turns + 1) * 360)
      const angle = angleUnderPointer(final)
      const { start, end } = arcs[index]
      const margins = edgeMargins(arcs[index])
      expect(angle).toBeGreaterThanOrEqual(start + margins.start - 1e-6)
      expect(angle).toBeLessThanOrEqual(end - margins.end + 1e-6)
      const width = end - start
      if (angle < start + width * 0.02 + margins.start || angle > end - width * 0.02 - margins.end) {
        nearEdge++
      }
    }
    // The old middle-80% rule never came within 10% of an edge.
    if (arcs === wide) expect(nearEdge).toBeGreaterThan(0)
  }
})

test('restRotation lands on the margins at the ends of random', () => {
  const arcs = sliceArcs(slices)
  arcs.forEach((arc, index) => {
    const margins = edgeMargins(arc)
    const low = angleUnderPointer(restRotation(0, arcs, index, () => 0, 3))
    const high = angleUnderPointer(restRotation(0, arcs, index, () => 1 - 1e-12, 3))
    expect(low).toBeCloseTo(arc.start + margins.start, 6)
    expect(high).toBeCloseTo(arc.end - margins.end, 6)
  })
})

test('restRotation returns the same values for fixed random inputs', () => {
  const arcs = sliceArcs([
    { kind: 'nomination', viewerId: 'a', weight: 1 },
    { kind: 'nomination', viewerId: 'b', weight: 1 },
    { kind: 'nomination', viewerId: 'c', weight: 1 },
    { kind: 'nomination', viewerId: 'd', weight: 1 },
  ])
  // 90° slices, margins of the push range plus the allowance: the target is 90 + start + r * (90 - start - end) in slice 1.
  const target = (r: number, index: number) => index * 90 + startClearance + r * (90 - startClearance - endClearance)
  const turned = (current: number, angle: number, turns: number) =>
    current + turns * 360 + ((((-angle - current - turns * 360) % 360) + 360) % 360)
  expect(restRotation(0, arcs, 1, () => 0.5, 5)).toBeCloseTo(turned(0, target(0.5, 1), 5), 9)
  expect(restRotation(10, arcs, 1, () => 0, 5)).toBeCloseTo(turned(10, target(0, 1), 5), 9)
  expect(restRotation(0, arcs, 3, () => 0.999999, 1)).toBeCloseTo(turned(0, target(0.999999, 3), 1), 9)
})

test("the margins are the flapper's push range plus the allowance, or a quarter of a narrow slice", () => {
  expect(startClearance).toBeCloseTo(-pushStart + pushAllowance, 12)
  expect(endClearance).toBeCloseTo(pushEnd + pushAllowance, 12)
  const threshold = startClearance + endClearance
  expect(edgeMargins({ start: 10, end: 10 + threshold + 0.01 })).toEqual({ start: startClearance, end: endClearance })
  expect(edgeMargins({ start: 0, end: threshold })).toEqual({ start: threshold / 4, end: threshold / 4 })
  expect(edgeMargins({ start: 0, end: 2 })).toEqual({ start: 0.5, end: 0.5 })
})

test('restRotation spreads rests evenly across the allowed band', () => {
  const arcs = sliceArcs(slices)
  const random = seeded(11)
  const buckets = new Array(10).fill(0)
  const { start, end } = arcs[1]
  const margins = edgeMargins(arcs[1])
  const band = end - start - margins.start - margins.end
  const n = 10_000
  for (let i = 0; i < n; i++) {
    const angle = angleUnderPointer(restRotation(0, arcs, 1, random, 3))
    buckets[Math.min(9, Math.floor(((angle - start - margins.start) / band) * 10))]++
  }
  for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan((n / 10) * 0.15)
})

test("no pin lies in the flapper's push range at an ordinary stop on a wide enough slice", () => {
  const random = seeded(3)
  let wide = 0
  let narrow = 0
  let thinned = 0
  for (let wheel = 0; wheel < 3000; wheel++) {
    const count = 2 + Math.floor(random() * 149)
    const arcs = sliceArcs(
      Array.from({ length: count }, () => ({ kind: 'wildcard' as const, weight: 0.05 + random() ** 3 * 5 })),
    )
    const pins = pinAngles(arcs)
    if (pins.length < count) thinned++
    for (const draw of [0, 1 - 1e-12, random(), random()]) {
      const index = Math.floor(random() * count)
      const { start, end } = arcs[index]
      const margins = edgeMargins(arcs[index])
      const rest = angleUnderPointer(restRotation(random() * 100, arcs, index, () => draw, 3))
      expect(rest).toBeGreaterThanOrEqual(start + margins.start - 1e-6)
      expect(rest).toBeLessThanOrEqual(end - margins.end + 1e-6)
      if (end - start <= startClearance + endClearance) {
        narrow++
        continue
      }
      wide++
      for (const pin of pins) {
        const fromPointer = ((((pin - rest) % 360) + 540) % 360) - 180
        expect(fromPointer < pushStart || fromPointer > pushEnd).toBe(true)
      }
      expect(targetBend(pins, -rest, -rest, 1)).toBe(0)
    }
  }
  expect(wide).toBeGreaterThan(0)
  expect(narrow).toBeGreaterThan(0)
  expect(thinned).toBeGreaterThan(0)
})
