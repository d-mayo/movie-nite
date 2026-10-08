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

export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export function labelTextColor(hex: string): '#000000' | '#ffffff' {
  return contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000000' : '#ffffff'
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
