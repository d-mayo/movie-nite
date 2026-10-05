import { describe, expect, test } from 'vitest'
import {
  addWildcard,
  materialiseDefault,
  moveSlice,
  removeWildcard,
  resolveLayout,
  setViewerSlices,
  setViewerWeight,
  setWildcardWeight,
  spreadEvenly,
  spreadOrder,
  syncLayout,
  type SliceRef,
  type WheelLayout,
} from './edit.ts'
import { defaultLayout } from './layout.ts'

const label = (r: SliceRef) => (r.kind === 'wildcard' ? 'W' : r.viewerId)
const labels = (l: WheelLayout) => l.order.map(label)
const ids = (l: WheelLayout) => l.order.map((r) => r.id)

function hand(order: string[], viewers: Record<string, number>): WheelLayout {
  const counts: Record<string, number> = {}
  let w = 0
  const wildcards: WheelLayout['wildcards'] = []
  const refs = order.map((x): SliceRef => {
    if (x === 'W') {
      const id = `w${w++}`
      wildcards.push({ id, weight: 1 })
      return { kind: 'wildcard', id }
    }
    const j = (counts[x] = (counts[x] ?? -1) + 1)
    return { kind: 'nomination', id: `${x}#${j}`, viewerId: x }
  })
  return {
    viewers: Object.fromEntries(
      Object.entries(viewers).map(([k, n]) => [k, { weight: 5, slices: n }]),
    ),
    wildcards,
    order: refs,
    handPlaced: true,
  }
}

describe('spreading', () => {
  test('equals defaultLayout for 1 to 5 viewers', () => {
    for (let n = 1; n <= 5; n++) {
      const on = Array.from({ length: n }, (_, i) => `v${i}`)
      const expected = defaultLayout(on, {}).map((s) =>
        s.kind === 'wildcard' ? 'W' : s.viewerId,
      )
      expect(labels(materialiseDefault(on))).toEqual(expected)
    }
  })

  test('five slices for Ann leaves none adjacent and wildcards sit after round(mN/W)', () => {
    const on = ['A', 'B', 'C']
    const five = setViewerSlices(materialiseDefault(on), on, 'A', 5)
    const order = labels(five)
    expect(order.filter((x) => x === 'A')).toHaveLength(5)
    order.forEach((x, i) => {
      if (x === 'A') expect(order[(i + 1) % order.length]).not.toBe('A')
    })
    const afterNoms: number[] = []
    let seen = 0
    for (const x of order) {
      if (x === 'W') afterNoms.push(seen)
      else seen++
    }
    expect(seen).toBe(11)
    expect(afterNoms).toEqual([Math.round(11 / 3), Math.round(22 / 3), 11])
  })

  test('ids are unique', () => {
    const l = setViewerSlices(materialiseDefault(['A', 'B']), ['A', 'B'], 'A', 7)
    expect(new Set(ids(l)).size).toBe(ids(l).length)
  })
})

describe('resolving and validation', () => {
  test('default resolves to defaultLayout slices', () => {
    const on = ['A', 'B', 'C']
    expect(resolveLayout(materialiseDefault(on))).toEqual(defaultLayout(on, {}))
  })

  test('weight 8 with 4 slices gives 2 each', () => {
    const on = ['A']
    let l = materialiseDefault(on)
    l = setViewerSlices(l, on, 'A', 4)
    l = setViewerWeight(l, 'A', 8)
    const noms = resolveLayout(l).filter((s) => s.kind === 'nomination')
    expect(noms.map((s) => s.weight)).toEqual([2, 2, 2, 2])
  })

  test('invalid values change nothing', () => {
    const on = ['A']
    const l = materialiseDefault(on)
    for (const w of [0, 0.3, 2.3, 100, NaN]) expect(setViewerWeight(l, 'A', w)).toBe(l)
    for (const n of [0, 13, 2.5]) expect(setViewerSlices(l, on, 'A', n)).toBe(l)
    expect(setWildcardWeight(l, 'w0', 0.3)).toBe(l)
  })
})

describe('wildcards', () => {
  test('add, weight, remove everything', () => {
    const on = ['A']
    let l = addWildcard(materialiseDefault(on), on)
    expect(l.wildcards).toHaveLength(2)
    expect(l.wildcards[1].weight).toBe(1)
    l = setWildcardWeight(l, l.wildcards[1].id, 4)
    expect(l.wildcards[1].weight).toBe(4)
    for (const w of [...l.wildcards]) l = removeWildcard(l, on, w.id)
    expect(labels(l)).toEqual(['A', 'A', 'A'])
  })

  test('hand-placed adds go last', () => {
    const l = hand(['A', 'W', 'A', 'A'], { A: 3 })
    expect(labels(addWildcard(l, ['A'])).pop()).toBe('W')
  })

  test('auto-spread results equal the spread order', () => {
    const on = ['A', 'B']
    const l = addWildcard(materialiseDefault(on), on)
    expect(l.order).toEqual(spreadOrder(l, on))
  })
})

describe('moving and spread evenly', () => {
  test('move sets handPlaced; spread evenly keeps it', () => {
    const on = ['A', 'B', 'C']
    const l = materialiseDefault(on)
    const moved = moveSlice(l, 0, 3)
    expect(moved.handPlaced).toBe(true)
    expect(labels(moved).slice(0, 4)).toEqual(['B', 'C', 'W', 'A'])
    const back = spreadEvenly(moved, on)
    expect(back.handPlaced).toBe(true)
    expect(labels(back)).toEqual(labels(l))
  })
})

describe('slice counts on a hand-placed wheel', () => {
  const on = ['A', 'B']
  const gaps = ['A', 'B', 'A', 'B', 'B', 'B', 'A', 'B']

  test('new slice goes midway in the largest gap', () => {
    const out = setViewerSlices(hand(gaps, { A: 3, B: 5 }), on, 'A', 4)
    expect(labels(out)).toEqual(['A', 'B', 'A', 'B', 'A', 'B', 'B', 'A', 'B'])
  })

  test('equal gaps use the first gap clockwise from the first slice', () => {
    const l = hand(['A', 'B', 'B', 'A', 'B', 'B'], { A: 2, B: 4 })
    expect(labels(setViewerSlices(l, on, 'A', 3))).toEqual(['A', 'B', 'A', 'B', 'A', 'B', 'B'])
  })

  test('3 to 5 equals 3 to 4 to 5; lowering drops the last slice', () => {
    const l = hand(gaps, { A: 3, B: 5 })
    const stepwise = setViewerSlices(setViewerSlices(l, on, 'A', 4), on, 'A', 5)
    expect(setViewerSlices(l, on, 'A', 5).order).toEqual(stepwise.order)
    const down = setViewerSlices(l, on, 'A', 2)
    expect(labels(down)).toEqual(['A', 'B', 'A', 'B', 'B', 'B', 'B'])
  })

  test('a single slice grows to about half the wheel away', () => {
    const l = hand(['A', 'B', 'B', 'B', 'B', 'B'], { A: 1, B: 5 })
    expect(labels(setViewerSlices(l, on, 'A', 2))).toEqual([
      'A', 'B', 'B', 'A', 'B', 'B', 'B',
    ])
  })
})

describe('syncLayout', () => {
  const on = ['A', 'B', 'C']

  test('nothing changed returns the same layout', () => {
    const l = materialiseDefault(on)
    expect(syncLayout(l, on)).toBe(l)
  })

  test('auto-spread leaver and joiner give the spread of the result', () => {
    const left = syncLayout(materialiseDefault(on), ['A', 'C'])
    expect(left.order).toEqual(spreadOrder(left, ['A', 'C']))
    expect(left.wildcards).toHaveLength(2)
    const joined = syncLayout(left, ['A', 'C', 'D'])
    expect(joined.order).toEqual(spreadOrder(joined, ['A', 'C', 'D']))
    expect(joined.viewers.D).toEqual({ weight: 5, slices: 3 })
  })

  test('a hand-placed leaver takes their slices and the first wildcard clockwise', () => {
    const l = hand(['W', 'A', 'B', 'W', 'A', 'B', 'W'], { A: 2, B: 2 })
    const out = syncLayout(l, ['B'])
    expect(labels(out)).toEqual(['W', 'B', 'B', 'W'])
    expect(out.wildcards.map((w) => w.id)).toEqual(['w0', 'w2'])
  })

  test('two leavers take different wildcards, and the last leaver clears them all', () => {
    const l = hand(['A', 'W', 'B', 'W', 'C', 'C', 'W'], { A: 1, B: 1, C: 2 })
    const out = syncLayout(l, ['C'])
    expect(labels(out)).toEqual(['C', 'C', 'W'])
    expect(out.wildcards.map((w) => w.id)).toEqual(['w2'])
    const empty = syncLayout(l, [])
    expect(empty.order).toEqual([])
    expect(empty.wildcards).toEqual([])
  })

  test('wrapping round finds the wildcard before the first slice', () => {
    const l = hand(['W', 'A', 'B', 'B'], { A: 1, B: 2 })
    expect(labels(syncLayout(l, ['B']))).toEqual(['B', 'B'])
  })

  test('with no wildcards left a leaver takes none', () => {
    const l = hand(['A', 'B', 'A', 'B'], { A: 2, B: 2 })
    expect(labels(syncLayout(l, ['B']))).toEqual(['B', 'B'])
  })

  test('a hand-placed joiner is spread with a wildcard after their last slice', () => {
    const base = hand(['A', 'B', 'C', 'W', 'A', 'B', 'C', 'W', 'A', 'B', 'C', 'W'], {
      A: 3,
      B: 3,
      C: 3,
    })
    const before = ids(base)
    const out = syncLayout(base, [...on, 'D'])
    expect(out.viewers.D).toEqual({ weight: 5, slices: 3 })
    const d = out.order.flatMap((r, i) =>
      r.kind === 'nomination' && r.viewerId === 'D' ? [i] : [],
    )
    expect(d).toHaveLength(3)
    expect(out.order[d[2] + 1].kind).toBe('wildcard')
    expect(d[1] - d[0] - 1).toBeGreaterThanOrEqual(3)
    expect(d[2] - d[1] - 1).toBeGreaterThanOrEqual(3)
    expect(ids(out).filter((id) => before.includes(id))).toEqual(before)
    expect(new Set(ids(out)).size).toBe(ids(out).length)
    expect(out.handPlaced).toBe(true)
  })

  test('a re-joiner gets their kept settings', () => {
    let l = materialiseDefault(on)
    l = setViewerSlices(setViewerWeight(l, 'B', 8), on, 'B', 4)
    const gone = syncLayout(l, ['A', 'C'])
    expect(gone.viewers.B).toEqual({ weight: 8, slices: 4 })
    const back = syncLayout(gone, on)
    expect(
      back.order.filter((r) => r.kind === 'nomination' && r.viewerId === 'B'),
    ).toHaveLength(4)
  })
})
