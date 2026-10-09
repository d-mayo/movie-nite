export type Slice =
  | { kind: 'nomination'; viewerId: string; weight: number }
  | { kind: 'wildcard'; weight: number }

export interface Arc {
  start: number
  end: number
}

export function sliceArcs(slices: Slice[]): Arc[] {
  const total = slices.reduce((sum, s) => sum + s.weight, 0)
  let start = 0
  return slices.map((s, i) => {
    const end = i === slices.length - 1 ? 360 : start + (s.weight / total) * 360
    const arc = { start, end }
    start = end
    return arc
  })
}
