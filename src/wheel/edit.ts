import type { Slice } from './layout.ts'

// The global wheel settings: how many wildcards, their one shared weight, and
// the slices and weight every viewer gets unless the host adjusts them tonight.
export interface WheelSettings {
  wildcardsPerViewer: boolean
  wildcardCount: number
  wildcardWeight: number
  defaultSlices: number
  defaultWeight: number
}

// What the host changed for one viewer tonight; a field is present only when set.
export interface Adjustment {
  slices?: number
  weight?: number
}

export interface ViewerSetting {
  weight: number
  slices: number
}

export const defaultWheelSettings: WheelSettings = {
  wildcardsPerViewer: true,
  wildcardCount: 3,
  wildcardWeight: 1,
  defaultSlices: 3,
  defaultWeight: 5,
}

export const minWeight = 0.5
export const maxWeight = 20
export const minSlices = 1
export const maxSlices = 12
export const minWildcards = 0
export const maxWildcards = 12

export function isValidWeight(weight: number): boolean {
  return (
    Number.isFinite(weight) &&
    weight >= minWeight &&
    weight <= maxWeight &&
    Number.isInteger(weight * 2)
  )
}

export function isValidSliceCount(count: number): boolean {
  return Number.isInteger(count) && count >= minSlices && count <= maxSlices
}

export function isValidWildcardCount(count: number): boolean {
  return Number.isInteger(count) && count >= minWildcards && count <= maxWildcards
}

// A viewer's adjustment, else the global default, field by field.
export function effectiveSetting(
  wheel: WheelSettings,
  adjustments: Record<string, Adjustment>,
  viewerId: string,
): ViewerSetting {
  const adjustment = adjustments[viewerId]
  return {
    slices: adjustment?.slices ?? wheel.defaultSlices,
    weight: adjustment?.weight ?? wheel.defaultWeight,
  }
}

// The wheel, derived on every render. `onWheel` is the viewers on it in pane
// order. Each viewer's j-th of k slices has the ideal position (j + i/n) / k for
// tick index i of n, compared exactly by cross-multiplying, and the wildcards
// are spaced evenly among the nomination slices. With three slices per viewer
// and one wildcard per viewer this is the round-robin default wheel.
export function deriveSlices(
  onWheel: string[],
  wheel: WheelSettings,
  adjustments: Record<string, Adjustment>,
): Slice[] {
  const n = onWheel.length
  if (n === 0) return []
  const placed: { slice: Slice; j: number; i: number; k: number }[] = []
  onWheel.forEach((viewerId, i) => {
    const { slices: k, weight } = effectiveSetting(wheel, adjustments, viewerId)
    for (let j = 0; j < k; j++) {
      placed.push({ slice: { kind: 'nomination', viewerId, weight: weight / k }, j, i, k })
    }
  })
  placed.sort((a, b) => (a.j * n + a.i) * b.k - (b.j * n + b.i) * a.k || a.i - b.i)
  const nominations = placed.map((p) => p.slice)
  const wildcards = wheel.wildcardsPerViewer ? n : wheel.wildcardCount
  const total = nominations.length
  const slices: Slice[] = []
  let next = 0
  const after = Array.from({ length: wildcards }, (_, m) =>
    Math.round(((m + 1) * total) / wildcards),
  )
  for (let pos = 0; pos <= total; pos++) {
    while (next < wildcards && after[next] === pos) {
      slices.push({ kind: 'wildcard', weight: wheel.wildcardWeight })
      next++
    }
    if (pos < total) slices.push(nominations[pos])
  }
  return slices
}
