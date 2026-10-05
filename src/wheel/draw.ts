import type { Arc, Slice } from './layout.ts'

// The pointer is fixed at the top; arcs run clockwise from the top of the
// wheel and the wheel rotates clockwise by `rotation` degrees.
const margin = 0.1

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

// The wheel angle under the pointer for a given rotation.
export function angleUnderPointer(rotation: number): number {
  return (((-rotation % 360) + 360) % 360)
}

// A final rotation at least `turns` full turns past `currentRotation`, with
// the pointer at a random point in the middle 80% of the slice at `index`.
export function restRotation(
  currentRotation: number,
  arcs: Arc[],
  index: number,
  random: () => number,
  turns: number,
): number {
  const { start, end } = arcs[index]
  const width = end - start
  const target = start + width * (margin + random() * (1 - 2 * margin))
  const base = currentRotation + turns * 360
  const delta = (((-target - base) % 360) + 360) % 360
  return base + delta
}
