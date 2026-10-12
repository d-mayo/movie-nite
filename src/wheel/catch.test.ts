import { expect, test } from 'vitest'
import { catchWidth, catchZone, forcedCatchRotation, isCatch } from './catch.ts'
import { slipClearance } from './closeCall.ts'
import { angleUnderPointer, edgeMargin } from './draw.ts'
import { sliceArcs, type Slice } from './layout.ts'
import { pushEnd } from './pins.ts'

const film = (viewerId: string, weight = 1): Slice => ({ kind: 'nomination', viewerId, weight })

// 24 equal 15° slices, viewers A and B alternating.
const alternating = Array.from({ length: 24 }, (_, i) => film(i % 2 ? 'B' : 'A'))
const altArcs = sliceArcs(alternating)

test('a pinned slice has a zone from the clearance past its start, 1° wide', () => {
  const zone = catchZone(alternating, altArcs, 3)!
  expect(zone[0]).toBeCloseTo(45 + pushEnd + 0.2, 9)
  expect(zone[0]).toBe(45 + slipClearance)
  expect(zone[1] - zone[0]).toBeCloseTo(catchWidth, 9)
})

test('a rest inside the zone is a catch; just outside it and mid-slice are not', () => {
  const [from, to] = catchZone(alternating, altArcs, 3)!
  expect(isCatch(alternating, altArcs, 3, from)).toBe(true)
  expect(isCatch(alternating, altArcs, 3, (from + to) / 2)).toBe(true)
  expect(isCatch(alternating, altArcs, 3, to)).toBe(false)
  expect(isCatch(alternating, altArcs, 3, from - 0.01)).toBe(false)
  expect(isCatch(alternating, altArcs, 3, 52.5)).toBe(false)
})

test('the neighbor does not matter: a one-viewer wheel has zones', () => {
  const same = [film('A'), film('A'), film('A')]
  const arcs = sliceArcs(same)
  expect(catchZone(same, arcs, 1)).not.toBeNull()
  expect(catchZone(same, arcs, 0)).not.toBeNull()
})

test('a slice whose start pin was thinned away has no zone', () => {
  // 1° and 1.5° slices put the pins at 0 and 2.5°; the wide slice after them starts at 2.5 + ... with no pin.
  const slices = [film('A', 1), film('B', 1), film('C', 1), film('D', 100)]
  const arcs = sliceArcs(slices)
  const thin = [
    { start: 0, end: 1 },
    { start: 1, end: 100 },
    { start: 100, end: 360 },
  ]
  expect(catchZone(slices.slice(0, 3), thin, 1)).toBeNull()
  expect(catchZone(slices.slice(0, 3), thin, 2)).not.toBeNull()
  expect(arcs.length).toBe(4)
})

test('a slice too narrow to hold the zone clear of its end margin has none', () => {
  const slices = [film('A', 1), film('A', 1)]
  const arcs = [
    { start: 0, end: 3.5 },
    { start: 3.5, end: 360 },
  ]
  expect(catchZone(slices, arcs, 0)).toBeNull()
  expect(3.5 - edgeMargin(arcs[0])).toBeLessThan(slipClearance + catchWidth)
})

test('a zone overlapping the slip close-call zone is dropped, the same slice without that close call keeps it', () => {
  // The slip zone is the last 4° of the slice (less the clearance), the catch zone starts 1.98° in.
  const arcs = [
    { start: 0, end: 4.5 },
    { start: 4.5, end: 360 },
  ]
  expect(catchZone([film('A'), film('B')], arcs, 0)).toBeNull()
  expect(catchZone([film('A'), film('A')], arcs, 0)).not.toBeNull()
})

test('the forced catch rest lands in the zone, at least the requested turns on', () => {
  let seed = 5
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 200; i++) {
    const from = random() * 1000
    const to = forcedCatchRotation(from, alternating, altArcs, 3, random, 4)!
    expect(to).toBeGreaterThanOrEqual(from + 4 * 360)
    expect(to).toBeLessThan(from + 5 * 360 + 1)
    expect(isCatch(alternating, altArcs, 3, angleUnderPointer(to))).toBe(true)
  }
  expect(forcedCatchRotation(0, [film('A', 1), film('A', 1)], [{ start: 0, end: 3.5 }, { start: 3.5, end: 360 }], 0, random, 4)).toBeNull()
})
