import { expect, test } from 'vitest'
import { closeCallShare, closeCallZones, forcedRestRotation, isCloseCall } from './closeCall.ts'
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

test('a rest just short of a pinned start edge is a close call; one just past the end edge, which the pointer has crossed, is not', () => {
  expect(isCloseCall(alternating, altArcs, 3, 45 + 1.3)).toBe(true)
  expect(isCloseCall(alternating, altArcs, 3, 60 - 1.3)).toBe(false)
  // Slice 0's start is the pin at 0°, shared with the last slice.
  expect(isCloseCall(alternating, altArcs, 0, 1.3)).toBe(true)
  expect(isCloseCall(alternating, altArcs, 23, 360 - 1.3)).toBe(false)
  expect(closeCallZones(alternating, altArcs, 3)).toEqual([[45, 45 + 1.2 + closeCallShare * 15]])
})

test('exactly margin plus 10% from the edge, or mid-slice, is not a close call', () => {
  const reach = 1.2 + closeCallShare * 15
  expect(isCloseCall(alternating, altArcs, 3, 45 + reach)).toBe(false)
  expect(isCloseCall(alternating, altArcs, 3, 52.5)).toBe(false)
  expect(isCloseCall(alternating, altArcs, 3, 45 + reach - 0.01)).toBe(true)
})

test('an edge whose pin was thinned away never counts', () => {
  // Slices of 1.5°, 1.5° and a rest: the second edge (1.5°) is within 2° of the pin at 0°.
  const slices = [film('A', 1), film('B', 1), film('C', 1), film('D', 1), film('E', 1), film('F', 200)]
  const arcs = sliceArcs(slices)
  const total = 205
  expect(arcs[1].start).toBeCloseTo(360 / total)
  // Slice 1's start edge is dropped (under 2° from the pin at 0°).
  const dropped = arcs[1].start
  expect(closeCallZones(slices, arcs, 1).some(([from]) => from === dropped)).toBe(false)
  expect(isCloseCall(slices, arcs, 1, dropped + 0.1)).toBe(false)
  // A kept edge still counts at the same distance: slice 4's start edge.
  expect(closeCallZones(slices, arcs, 4)).toHaveLength(1)
  expect(isCloseCall(slices, arcs, 4, arcs[4].start + 0.1)).toBe(true)
  // Slice 5's start edge was thinned away too.
  expect(closeCallZones(slices, arcs, 5)).toEqual([])
})

test('the reach follows edgeMargin for a narrow slice', () => {
  const slices = [film('A', 1), film('B', 40), film('C', 40)]
  const arcs = sliceArcs(slices)
  const width = arcs[0].end - arcs[0].start
  const reach = edgeMargin(arcs[0]) + closeCallShare * width
  expect(edgeMargin(arcs[0])).toBeCloseTo(width / 4)
  expect(isCloseCall(slices, arcs, 0, reach - 0.001)).toBe(true)
  expect(isCloseCall(slices, arcs, 0, reach + 0.001)).toBe(false)
})

test('the same viewer, two wildcards and a one-viewer wheel have no close calls', () => {
  const same = [film('A'), film('A'), film('B'), film('B')]
  const sameArcs = sliceArcs(same)
  expect(closeCallZones(same, sameArcs, 0).length).toBe(1) // the start edge, shared with the last B
  expect(isCloseCall(same, sameArcs, 1, sameArcs[1].start + 1.3)).toBe(false)
  expect(isCloseCall(same, sameArcs, 2, sameArcs[2].start + 1.3)).toBe(true)

  const wild = [wildcard(), wildcard(), film('A')]
  const wildArcs = sliceArcs(wild)
  expect(isCloseCall(wild, wildArcs, 1, wildArcs[1].start + 1.3)).toBe(false)
  expect(isCloseCall(wild, wildArcs, 2, wildArcs[2].start + 1.3)).toBe(true)

  const one = [film('A', 3), film('A', 2), film('A', 1)]
  const oneArcs = sliceArcs(one)
  one.forEach((_, i) => expect(closeCallZones(one, oneArcs, i)).toEqual([]))
  const alone = [film('A')]
  expect(closeCallZones(alone, sliceArcs(alone), 0)).toEqual([])
})

test('a wildcard next to a film counts', () => {
  const slices = [film('A'), wildcard(), film('B')]
  const arcs = sliceArcs(slices)
  expect(isCloseCall(slices, arcs, 1, arcs[1].start + 1.3)).toBe(true)
  expect(isCloseCall(slices, arcs, 2, arcs[2].start + 1.3)).toBe(true)
  // Neither slice's end edge counts: the pointer has crossed it.
  expect(isCloseCall(slices, arcs, 0, arcs[0].end - 1.3)).toBe(false)
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
    const margin = edgeMargin(arcs[index])
    const usable = zones.filter(([from, to]) => (from === arcs[index].start ? to - (from + margin) : to - margin - from) > 0)
    if (rotation === null) {
      expect(usable).toEqual([])
      continue
    }
    const rest = angleUnderPointer(rotation)
    expect(rest).toBeGreaterThanOrEqual(arcs[index].start + margin - 1e-6)
    expect(rest).toBeLessThanOrEqual(arcs[index].end - margin + 1e-6)
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
