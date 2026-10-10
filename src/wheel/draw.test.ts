import { expect, test } from 'vitest'
import {
  angleUnderPointer,
  cryptoRandom,
  drawSlice,
  edgeMargin,
  restRotation,
} from './draw.ts'
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
      const margin = edgeMargin(arcs[index])
      expect(margin).toBe(Math.min(1.2, (end - start) / 4))
      expect(angle).toBeGreaterThanOrEqual(start + margin - 1e-6)
      expect(angle).toBeLessThanOrEqual(end - margin + 1e-6)
      const width = end - start
      if (angle < start + width * 0.02 + margin || angle > end - width * 0.02 - margin) {
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
    const margin = edgeMargin(arc)
    const low = angleUnderPointer(restRotation(0, arcs, index, () => 0, 3))
    const high = angleUnderPointer(restRotation(0, arcs, index, () => 1 - 1e-12, 3))
    expect(low).toBeCloseTo(arc.start + margin, 6)
    expect(high).toBeCloseTo(arc.end - margin, 6)
  })
})
