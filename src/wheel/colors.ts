// The 12 colors a viewer can hold, in the order new viewers are given them.
export const presetColors = [
  '#e6194b',
  '#f58231',
  '#ffe119',
  '#bfef45',
  '#3cb44b',
  '#42d4f4',
  '#4363d8',
  '#911eb4',
  '#f032e6',
  '#fabed4',
  '#aaffc3',
  '#9a6324',
] as const

export const presetNames: Record<string, string> = {
  '#e6194b': 'Red',
  '#f58231': 'Orange',
  '#ffe119': 'Yellow',
  '#bfef45': 'Lime',
  '#3cb44b': 'Green',
  '#42d4f4': 'Cyan',
  '#4363d8': 'Blue',
  '#911eb4': 'Purple',
  '#f032e6': 'Magenta',
  '#fabed4': 'Pink',
  '#aaffc3': 'Mint',
  '#9a6324': 'Brown',
}

export const maxViewers = presetColors.length

export function isPreset(color: unknown): color is string {
  return typeof color === 'string' && (presetColors as readonly string[]).includes(color)
}

// Mixes `hex` toward `target` by `amount` (0 keeps hex, 1 gives target), as #rrggbb.
export function mixColor(hex: string, target: string, amount: number): string {
  const out = [1, 3, 5].map((i) => {
    const from = parseInt(hex.slice(i, i + 2), 16)
    const to = parseInt(target.slice(i, i + 2), 16)
    return Math.round(from + (to - from) * amount)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${out.join('')}`
}

export function firstFreePreset(taken: Iterable<string>): string | null {
  const held = new Set(taken)
  return presetColors.find((c) => !held.has(c)) ?? null
}

// Fills in the color of every viewer that has no valid one: kept colors are
// reserved first, then the rest get the first free preset in roster order.
export function assignColors<T extends object>(roster: T[]): (T & { color: string })[] {
  const kept = new Set<string>()
  const valid = roster.map((v) => {
    if ('color' in v && isPreset(v.color) && !kept.has(v.color)) {
      kept.add(v.color as string)
      return true
    }
    return false
  })
  return roster.map((v, i) => {
    if (valid[i]) return v as T & { color: string }
    const color = firstFreePreset(kept)
    if (color === null) return { ...v, color: presetColors[i % maxViewers] }
    kept.add(color)
    return { ...v, color }
  })
}
