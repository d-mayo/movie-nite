import { expect, test } from 'vitest'
import {
  bendFarthest,
  bendNearest,
  closeCallZones,
  forcedRestRotation,
  isCloseCall,
  slipClearance,
  slipReach,
} from './closeCall.ts'
import { pushEnd } from './pins.ts'
import { angleUnderPointer, edgeMargin, restRotation } from './draw.ts'
import { sliceArcs, type Slice } from './layout.ts'

const film = (viewerId: string, weight = 1): Slice => ({ kind: 'nomination', viewerId, weight })
const wildcard = (weight = 1): Slice => ({ kind: 'wildcard', weight })

// 24 equal 15° slices, viewers A and B alternating.
const alternating = Array.from({ length: 24 }, (_, i) => film(i % 2 ? 'B' : 'A'))
const altArcs = sliceArcs(alternating)

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

test('a rest just short of a pinned start edge (the flapper bent, same film) is a close call', () => {
  expect(isCloseCall(alternating, altArcs, 3, 45 + bendNearest)).toBe(true)
  expect(isCloseCall(alternating, altArcs, 3, 45 + bendFarthest - 0.01)).toBe(true)
  expect(isCloseCall(alternating, altArcs, 3, 45 + bendFarthest)).toBe(false)
  expect(isCloseCall(alternating, altArcs, 3, 45 + bendNearest - 0.01)).toBe(false)
  // Slice 0's start is the pin at 0°, shared with the last slice.
  expect(isCloseCall(alternating, altArcs, 0, 0.5)).toBe(true)
})

test('a rest just past a pinned end edge, once the flapper has slipped off it, is a close call', () => {
  // Past the push range with a little to spare, and within the reach.
  expect(slipClearance).toBeGreaterThan(pushEnd)
  expect(isCloseCall(alternating, altArcs, 3, 60 - slipClearance - 0.01)).toBe(true)
  expect(isCloseCall(alternating, altArcs, 3, 60 - slipReach + 0.01)).toBe(true)
  // Still inside the push range, the pin holds the flapper bent on the wrong film: not one.
  expect(isCloseCall(alternating, altArcs, 3, 60 - 1.5)).toBe(false)
  expect(isCloseCall(alternating, altArcs, 3, 60 - slipReach - 0.01)).toBe(false)
  expect(isCloseCall(alternating, altArcs, 23, 360 - 3)).toBe(true)
})

test('the middle of a slice is not a close call, and an ordinary rest can be a slip', () => {
  expect(isCloseCall(alternating, altArcs, 3, 52.5)).toBe(false)
  expect(closeCallZones(alternating, altArcs, 3)).toHaveLength(2)
  // The ordinary rest range (1.2° in) includes the slip zone but not the bend zone.
  const natural = restRotation(0, altArcs, 3, () => 0.8, 3)
  expect(isCloseCall(alternating, altArcs, 3, angleUnderPointer(natural))).toBe(true)
})

test('an edge whose pin was thinned away never counts', () => {
  const slices = [film('A', 1), film('B', 1), film('C', 1), film('D', 1), film('E', 1), film('F', 200)]
  const arcs = sliceArcs(slices)
  // Slice 5's start edge is under 2° from the pin before it, so only its end edge (the pin at 0°) has a zone.
  expect(closeCallZones(slices, arcs, 5)).toHaveLength(1)
  expect(isCloseCall(slices, arcs, 5, arcs[5].start + 0.5)).toBe(false)
  expect(isCloseCall(slices, arcs, 5, 360 - 3)).toBe(true)
  // Slice 4's start edge keeps its pin.
  expect(isCloseCall(slices, arcs, 4, arcs[4].start + 0.3 * 1)).toBe(true)
})

test('a narrow slice cuts the zones to where it can rest', () => {
  const slices = [film('A', 10), film('B', 0.3), film('C', 20)]
  const arcs = sliceArcs(slices)
  expect(arcs[1].end - arcs[1].start).toBeLessThan(slipReach)
  for (const [from, to] of closeCallZones(slices, arcs, 1)) {
    expect(from).toBeGreaterThanOrEqual(arcs[1].start - 1e-9)
    expect(to).toBeLessThanOrEqual(arcs[1].end - edgeMargin(arcs[1]) + 1e-9)
    expect(to).toBeGreaterThan(from)
  }
})

test('the same viewer, two wildcards and a one-viewer wheel have no close calls', () => {
  const same = [film('A'), film('A'), film('B'), film('B')]
  const sameArcs = sliceArcs(same)
  // Slice 1: its start edge is across from the same viewer; its end edge is across from B.
  expect(closeCallZones(same, sameArcs, 1)).toHaveLength(1)
  expect(isCloseCall(same, sameArcs, 1, sameArcs[1].start + 0.5)).toBe(false)
  expect(isCloseCall(same, sameArcs, 2, sameArcs[2].start + 0.5)).toBe(true)

  const wild = [wildcard(), wildcard(), film('A')]
  const wildArcs = sliceArcs(wild)
  expect(isCloseCall(wild, wildArcs, 1, wildArcs[1].start + 0.5)).toBe(false)
  expect(isCloseCall(wild, wildArcs, 2, wildArcs[2].start + 0.5)).toBe(true)

  const one = [film('A', 3), film('A', 2), film('A', 1)]
  const oneArcs = sliceArcs(one)
  one.forEach((_, i) => expect(closeCallZones(one, oneArcs, i)).toEqual([]))
  const alone = [film('A')]
  expect(closeCallZones(alone, sliceArcs(alone), 0)).toEqual([])
})

test('a wildcard next to a film counts', () => {
  const slices = [film('A'), wildcard(), film('B')]
  const arcs = sliceArcs(slices)
  expect(isCloseCall(slices, arcs, 1, arcs[1].start + 0.5)).toBe(true)
  expect(isCloseCall(slices, arcs, 0, arcs[0].end - 3)).toBe(true)
})

test('the forced rest rotation lands in a zone of the drawn slice, off its margins', () => {
  const random = seeded(7)
  for (let n = 0; n < 2000; n++) {
    const count = 2 + Math.floor(random() * 11)
    const slices = Array.from({ length: count }, (_, i) =>
      random() < 0.2 ? wildcard(0.2 + random() * 3) : film(String(i % 3), 0.2 + random() * 3),
    )
    const arcs = sliceArcs(slices)
    const index = Math.floor(random() * count)
    const current = random() * 1000
    const turns = 1 + Math.floor(random() * 5)
    const rotation = forcedRestRotation(current, slices, arcs, index, random, turns)
    const zones = closeCallZones(slices, arcs, index)
    if (rotation === null) {
      expect(zones).toEqual([])
      continue
    }
    const rest = angleUnderPointer(rotation)
    expect(rest).toBeGreaterThanOrEqual(arcs[index].start - 1e-6)
    expect(rest).toBeLessThanOrEqual(arcs[index].end + 1e-6)
    expect(isCloseCall(slices, arcs, index, rest + 0)).toBe(true)
    expect(rotation).toBeGreaterThanOrEqual(current + turns * 360 - 1e-9)
    expect(rotation - (current + turns * 360)).toBeLessThan(360)
  }
})

test('the forced rest rotation reports no zone where none qualifies', () => {
  const same = [film('A'), film('A')]
  expect(forcedRestRotation(0, same, sliceArcs(same), 0, () => 0.5, 3)).toBeNull()
  const one = [film('A')]
  expect(forcedRestRotation(0, one, sliceArcs(one), 0, () => 0.5, 3)).toBeNull()
})

test('the plain restRotation is untouched by the close-call rule', () => {
  expect(restRotation(0, altArcs, 3, () => 0.5, 5)).toBeCloseTo(1800 + 360 - 52.5, 9)
})
