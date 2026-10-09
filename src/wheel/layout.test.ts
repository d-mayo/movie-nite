import { expect, test } from 'vitest'
import { sliceArcs, type Slice } from './layout.ts'
import { defaultWheelSettings, deriveSlices } from './edit.ts'

function labels(slices: Slice[]) {
  return slices.map((s) => (s.kind === 'wildcard' ? 'W' : s.viewerId))
}

test('three viewers get A B C W three times', () => {
  const slices = deriveSlices(['A', 'B', 'C'], defaultWheelSettings, {})
  expect(labels(slices)).toEqual(
    ['A', 'B', 'C', 'W', 'A', 'B', 'C', 'W', 'A', 'B', 'C', 'W'],
  )
  for (const s of slices) {
    expect(s.weight).toBeCloseTo(s.kind === 'wildcard' ? 1 : 5 / 3)
  }
  for (const id of ['A', 'B', 'C']) {
    const total = slices
      .filter((s) => s.kind === 'nomination' && s.viewerId === id)
      .reduce((sum, s) => sum + s.weight, 0)
    expect(total).toBeCloseTo(5)
  }
})

test('one viewer is A A A W, none is empty, and every viewer has a wildcard', () => {
  expect(labels(deriveSlices(['A'], defaultWheelSettings, {}))).toEqual(['A', 'A', 'A', 'W'])
  expect(deriveSlices([], defaultWheelSettings, {})).toEqual([])
  const two = deriveSlices(['A', 'B'], defaultWheelSettings, {})
  expect(two.filter((s) => s.kind === 'wildcard')).toHaveLength(2)
  expect(two.filter((s) => s.kind === 'nomination')).toHaveLength(6)
})

test('arcs are proportional to weight, contiguous and sum to 360', () => {
  const slices = deriveSlices(['A', 'B', 'C'], defaultWheelSettings, {})
  const arcs = sliceArcs(slices)
  expect(arcs[0].start).toBe(0)
  expect(arcs[arcs.length - 1].end).toBe(360)
  const total = slices.reduce((sum, s) => sum + s.weight, 0)
  arcs.forEach((arc, i) => {
    expect(arc.end - arc.start).toBeCloseTo((slices[i].weight / total) * 360)
    if (i > 0) expect(arc.start).toBe(arcs[i - 1].end)
  })
})
