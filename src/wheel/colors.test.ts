import { describe, expect, test } from 'vitest'
import { assignColors, mixColor, presetColors } from './colors.ts'

describe('presets', () => {
  test('there are 12 distinct hex colors', () => {
    expect(presetColors).toHaveLength(12)
    expect(new Set(presetColors).size).toBe(12)
    for (const c of presetColors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('mixColor mixes toward a target', () => {
    expect(mixColor('#e6194b', '#000000', 0)).toBe('#e6194b')
    expect(mixColor('#e6194b', '#000000', 1)).toBe('#000000')
    expect(mixColor('#ffffff', '#000000', 0.5)).toBe('#808080')
    expect(mixColor('#000000', '#ffffff', 0.14)).toBe('#242424')
  })
})

describe('assignColors', () => {
  test('keeps valid colors first, then fills in order', () => {
    const out = assignColors([{ id: 'a' }, { id: 'b', color: presetColors[0] }])
    expect(out.map((v) => v.color)).toEqual([presetColors[1], presetColors[0]])
  })

  test('past twelve, a viewer gets their index mod 12', () => {
    const out = assignColors(Array.from({ length: 14 }, (_, i) => ({ id: String(i) })))
    expect(out[12].color).toBe(presetColors[0])
    expect(out[13].color).toBe(presetColors[1])
  })
})
