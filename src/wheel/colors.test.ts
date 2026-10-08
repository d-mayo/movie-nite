import { describe, expect, test } from 'vitest'
import { assignColors, contrast, labelTextColor, presetColors } from './colors.ts'

describe('presets', () => {
  test('there are 12 distinct hex colors', () => {
    expect(presetColors).toHaveLength(12)
    expect(new Set(presetColors).size).toBe(12)
    for (const c of presetColors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('labelTextColor picks black on white and white on black', () => {
    expect(labelTextColor('#ffffff')).toBe('#000000')
    expect(labelTextColor('#000000')).toBe('#ffffff')
  })

  test.each([...presetColors])('%s reaches 4.5:1 with its label color', (preset) => {
    const label = labelTextColor(preset)
    const other = label === '#000000' ? '#ffffff' : '#000000'
    expect(contrast(preset, label)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(preset, label)).toBeGreaterThanOrEqual(contrast(preset, other))
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
