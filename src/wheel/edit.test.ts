import { describe, expect, test } from 'vitest'
import {
  deriveSlices,
  defaultWheelSettings,
  effectiveSetting,
  isValidSliceCount,
  isValidWeight,
  isValidWildcardCount,
  type WheelSettings,
} from './edit.ts'
import type { Slice } from './layout.ts'

const labels = (slices: Slice[]) => slices.map((s) => (s.kind === 'wildcard' ? 'W' : s.viewerId))
const wheel = (change: Partial<WheelSettings> = {}): WheelSettings => ({
  ...defaultWheelSettings,
  ...change,
})

describe('the derived wheel', () => {
  test('two viewers with the factory settings give A B A W B A B W', () => {
    const slices = deriveSlices(['A', 'B'], wheel(), {})
    expect(labels(slices)).toEqual(['A', 'B', 'A', 'W', 'B', 'A', 'B', 'W'])
    for (const s of slices) expect(s.weight).toBeCloseTo(s.kind === 'wildcard' ? 1 : 5 / 3)
  })

  test('three viewers give A B C W three times, and one gives A A A W', () => {
    expect(labels(deriveSlices(['A', 'B', 'C'], wheel(), {}))).toEqual([
      'A', 'B', 'C', 'W', 'A', 'B', 'C', 'W', 'A', 'B', 'C', 'W',
    ])
    expect(labels(deriveSlices(['A'], wheel(), {}))).toEqual(['A', 'A', 'A', 'W'])
  })

  test('one to five viewers get one wildcard each and three slices at weight 5/3', () => {
    for (let n = 1; n <= 5; n++) {
      const on = Array.from({ length: n }, (_, i) => `v${i}`)
      const slices = deriveSlices(on, wheel(), {})
      expect(slices.filter((s) => s.kind === 'wildcard')).toHaveLength(n)
      expect(slices.filter((s) => s.kind === 'nomination')).toHaveLength(3 * n)
    }
  })

  test('an adjusted viewer spreads their own slices and weight evenly', () => {
    const slices = deriveSlices(['A', 'B'], wheel(), { A: { slices: 4, weight: 8 } })
    const a = slices.filter((s) => s.kind === 'nomination' && s.viewerId === 'A')
    const b = slices.filter((s) => s.kind === 'nomination' && s.viewerId === 'B')
    expect(a).toHaveLength(4)
    for (const s of a) expect(s.weight).toBeCloseTo(2)
    expect(b).toHaveLength(3)
    for (const s of b) expect(s.weight).toBeCloseTo(5 / 3)
  })

  test('the wildcard count follows the viewers only while One per viewer is on', () => {
    const count = (s: Slice[]) => s.filter((x) => x.kind === 'wildcard').length
    expect(count(deriveSlices(['A', 'B'], wheel({ wildcardsPerViewer: false, wildcardCount: 0 }), {}))).toBe(0)
    const five = deriveSlices(['A', 'B'], wheel({ wildcardsPerViewer: false, wildcardCount: 5 }), {})
    expect(count(five)).toBe(5)
    expect(count(deriveSlices(['A', 'B', 'C'], wheel(), {}))).toBe(3)
    expect(deriveSlices([], wheel({ wildcardsPerViewer: false, wildcardCount: 5 }), {})).toEqual([])
  })

  test('wildcards are spaced among the slices as evenly as possible', () => {
    const slices = deriveSlices(['A', 'B'], wheel({ wildcardsPerViewer: false, wildcardCount: 5 }), {})
    const at = labels(slices).flatMap((x, i) => (x === 'W' ? [i] : []))
    const gaps = at.map((p, i) => (at[(i + 1) % at.length] - p + slices.length) % slices.length)
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1)
  })

  test('the wildcard weight and the defaults apply', () => {
    const slices = deriveSlices(['A'], wheel({ wildcardWeight: 3, defaultSlices: 2, defaultWeight: 6 }), {})
    expect(slices).toEqual([
      { kind: 'nomination', viewerId: 'A', weight: 3 },
      { kind: 'nomination', viewerId: 'A', weight: 3 },
      { kind: 'wildcard', weight: 3 },
    ])
  })

  test('effectiveSetting takes an adjustment field by field, else the default', () => {
    const w = wheel({ defaultSlices: 2, defaultWeight: 6 })
    expect(effectiveSetting(w, {}, 'A')).toEqual({ slices: 2, weight: 6 })
    expect(effectiveSetting(w, { A: { weight: 9 } }, 'A')).toEqual({ slices: 2, weight: 9 })
  })
})

describe('validity', () => {
  test('weights run from 0.5 to 20 in halves', () => {
    expect(isValidWeight(0.5)).toBe(true)
    expect(isValidWeight(20)).toBe(true)
    expect(isValidWeight(20.5)).toBe(false)
    expect(isValidWeight(99)).toBe(false)
    expect(isValidWeight(1.3)).toBe(false)
  })

  test('slices run from 1 to 12 and wildcards from 0 to 12', () => {
    expect(isValidSliceCount(0)).toBe(false)
    expect(isValidSliceCount(12)).toBe(true)
    expect(isValidSliceCount(13)).toBe(false)
    expect(isValidWildcardCount(0)).toBe(true)
    expect(isValidWildcardCount(12)).toBe(true)
    expect(isValidWildcardCount(13)).toBe(false)
    expect(isValidWildcardCount(1.5)).toBe(false)
  })
})
