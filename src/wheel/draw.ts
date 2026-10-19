import type { Arc, Slice } from './layout.ts'
import { pushEnd, pushStart } from './pins.ts'

// The pointer is fixed at the top; arcs run clockwise from the top of the
// wheel and the wheel rotates clockwise by `rotation` degrees.

// The room kept beyond the flapper's push range, so a pin just outside it never touches the tongue.
export const pushAllowance = 0.2
// How far a rest keeps from a slice's start edge (the pin coming up to the pointer) and from its end edge (the pin just past it).
export const startClearance = -pushStart + pushAllowance
export const endClearance = pushEnd + pushAllowance

export function cryptoRandom(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return buffer[0] / 2 ** 32
}

// Walks the cumulative weights; `random` is in [0, 1).
export function drawSlice(slices: Slice[], random: () => number): number {
  const total = slices.reduce((sum, s) => sum + s.weight, 0)
  const target = random() * total
  let cumulative = 0
  for (let i = 0; i < slices.length; i++) {
    cumulative += slices[i].weight
    if (target < cumulative) return i
  }
  return slices.length - 1
}

// Like drawSlice, but among the wildcard slices alone (by weight); null when there is none.
export function drawWildcardSlice(slices: Slice[], random: () => number): number | null {
  const wild = slices.flatMap((s, i) => (s.kind === 'wildcard' ? [i] : []))
  if (wild.length === 0) return null
  const total = wild.reduce((sum, i) => sum + slices[i].weight, 0)
  const target = random() * total
  let cumulative = 0
  for (const i of wild) {
    cumulative += slices[i].weight
    if (target < cumulative) return i
  }
  return wild[wild.length - 1]
}

// The wheel angle under the pointer for a given rotation.
export function angleUnderPointer(rotation: number): number {
  return (((-rotation % 360) + 360) % 360)
}

// The clearance kept at each edge of a slice: the flapper's push range plus the allowance, so no
// pin touches the tongue at an ordinary stop, or a quarter of the width at each edge for a slice
// too narrow for both clearances.
export function edgeMargins(arc: Arc): { start: number; end: number } {
  const width = arc.end - arc.start
  if (width <= startClearance + endClearance) return { start: width / 4, end: width / 4 }
  return { start: startClearance, end: endClearance }
}

// A final rotation at least `turns` full turns past `currentRotation`, with
// the pointer anywhere in the slice at `index` but its edge margins.
export function restRotation(
  currentRotation: number,
  arcs: Arc[],
  index: number,
  random: () => number,
  turns: number,
): number {
  const { start, end } = arcs[index]
  const margins = edgeMargins(arcs[index])
  const target = start + margins.start + random() * (end - start - margins.start - margins.end)
  return rotationTo(currentRotation, target, turns)
}

// The rotation at least `turns` full turns past `currentRotation` that puts the
// wheel angle `target` under the pointer.
export function rotationTo(currentRotation: number, target: number, turns: number): number {
  const base = currentRotation + turns * 360
  const delta = (((-target - base) % 360) + 360) % 360
  return base + delta
}
