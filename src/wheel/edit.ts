import type { Slice } from './layout.ts'

// The global wheel settings: how many wildcards, their one shared weight, and
// the slices and weight every viewer gets unless the host adjusts them tonight.
export interface WheelSettings {
  wildcardsPerViewer: boolean
  wildcardCount: number
  wildcardWeight: number
  defaultSlices: number
  defaultWeight: number
  spinSeconds: number
  spinTurnsPerSecond: number
  soundMusic: boolean
  soundEffects: boolean
  soundVolume: number
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
  spinSeconds: 6,
  spinTurnsPerSecond: 0.8,
  soundMusic: true,
  soundEffects: true,
  soundVolume: 70,
}

export const minWeight = 0.5
export const maxWeight = 20
export const minSlices = 1
export const maxSlices = 12
export const minWildcards = 0
export const maxWildcards = 12
export const minSpinSeconds = 2
export const maxSpinSeconds = 20
export const minSpinTurnsPerSecond = 0.3
export const maxSpinTurnsPerSecond = 3
export const minSoundVolume = 0
export const maxSoundVolume = 100

export function isValidWeight(weight: number): boolean {
  return (
    Number.isFinite(weight) &&
    weight >= minWeight &&
    weight <= maxWeight &&
    Number.isInteger(weight * 2)
  )
}

export function isValidSpinSeconds(seconds: number): boolean {
  return (
    Number.isFinite(seconds) &&
    seconds >= minSpinSeconds &&
    seconds <= maxSpinSeconds &&
    Number.isInteger(seconds * 2)
  )
}

export function isValidSpinTurnsPerSecond(turns: number): boolean {
  return (
    Number.isFinite(turns) &&
    turns >= minSpinTurnsPerSecond &&
    turns <= maxSpinTurnsPerSecond &&
    Number.isInteger(turns * 10)
  )
}

export function isValidSoundVolume(volume: number): boolean {
  return Number.isInteger(volume) && volume >= minSoundVolume && volume <= maxSoundVolume
}

// How long the spin lasts and how many full turns it makes. Reduced motion
// shortens it to one second and one turn, whatever the settings.
export function spinPlan(
  wheel: WheelSettings,
  reducedMotion: boolean,
): { durationMs: number; turns: number } {
  if (reducedMotion) return { durationMs: 1000, turns: 1 }
  return {
    durationMs: wheel.spinSeconds * 1000,
    turns: Math.max(1, Math.round(wheel.spinSeconds * wheel.spinTurnsPerSecond)),
  }
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
