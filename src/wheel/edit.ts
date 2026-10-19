import type { CardEffect } from '../wildcards/cards.ts'
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
  // 0 to 100 each; in effect never above the overall volume.
  soundMusic: number
  soundEffects: number
  soundVolume: number
  // Everything silenced, without losing the levels.
  soundMuted: boolean
  // Whether the viewers' names and titles show on the wheel.
  showLabels: boolean
  // Whether a wildcard landing opens the wildcard wheel rather than the search.
  wildcardWheel: boolean
  // The ids of the wildcard cards switched off; a card added later starts on.
  disabledCards: string[]
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
  soundMusic: 100,
  soundEffects: 100,
  soundVolume: 70,
  soundMuted: false,
  showLabels: true,
  wildcardWheel: true,
  disabledCards: [],
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

// A viewer's adjustment, else the global default, field by field; with the
// night's card effects, their sum over that, clamped to the limits.
export function effectiveSetting(
  wheel: WheelSettings,
  adjustments: Record<string, Adjustment>,
  viewerId: string,
  effects: CardEffect[] = [],
): ViewerSetting {
  const adjustment = adjustments[viewerId]
  const own = {
    slices: adjustment?.slices ?? wheel.defaultSlices,
    weight: adjustment?.weight ?? wheel.defaultWeight,
  }
  if (effects.length === 0) return own
  let slices = own.slices
  let weight = own.weight
  for (const { change } of effects) {
    if (change.kind !== 'slices' && change.kind !== 'weight') continue
    if (!change.viewerIds.includes(viewerId)) continue
    if (change.kind === 'slices') slices += change.amount
    else weight += change.amount
  }
  return {
    slices: Math.min(maxSlices, Math.max(minSlices, slices)),
    weight: Math.min(maxWeight, Math.max(minWeight, weight)),
  }
}

// What the night's cards actually add to a viewer's own setting, after clamping.
export function cardBonus(
  wheel: WheelSettings,
  adjustments: Record<string, Adjustment>,
  viewerId: string,
  effects: CardEffect[],
): ViewerSetting {
  const own = effectiveSetting(wheel, adjustments, viewerId)
  const now = effectiveSetting(wheel, adjustments, viewerId, effects)
  return { slices: now.slices - own.slices, weight: now.weight - own.weight }
}

// The wildcards on the main wheel: the setting's, plus the cards', at most 12.
export function wildcardTotal(
  viewerCount: number,
  wheel: WheelSettings,
  effects: CardEffect[] = [],
): number {
  const base = wheel.wildcardsPerViewer ? viewerCount : wheel.wildcardCount
  const extra = effects.reduce((sum, e) => sum + (e.change.kind === 'wildcards' ? e.change.amount : 0), 0)
  return Math.min(maxWildcards, base + extra)
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
  effects: CardEffect[] = [],
): Slice[] {
  const n = onWheel.length
  if (n === 0) return []
  const placed: { slice: Slice; j: number; i: number; k: number }[] = []
  onWheel.forEach((viewerId, i) => {
    const { slices: k, weight } = effectiveSetting(wheel, adjustments, viewerId, effects)
    for (let j = 0; j < k; j++) {
      placed.push({ slice: { kind: 'nomination', viewerId, weight: weight / k }, j, i, k })
    }
  })
  placed.sort((a, b) => (a.j * n + a.i) * b.k - (b.j * n + b.i) * a.k || a.i - b.i)
  const nominations = placed.map((p) => p.slice)
  const wildcards = wildcardTotal(n, wheel, effects)
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
