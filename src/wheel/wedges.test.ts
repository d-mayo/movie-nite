import { describe, expect, test } from 'vitest'
import { addViewer, defaultState, newNight, setPresent } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { presetColors } from './colors.ts'
import { buildWedges } from './wedges.ts'

const two = () => addViewer(addViewer(defaultState, 'Ann', 'a'), 'Bo', 'b')
const annColors = (s: typeof defaultState) =>
  buildWedges(s.night, s.roster, s.settings.wheel)
    .filter((w) => w.slice.kind === 'nomination' && w.slice.viewerId === 'a')
    .map((w) => w.color)

describe('buildWedges colors', () => {
  test('a viewer keeps their color whoever else is present', () => {
    const s = two()
    const colors = annColors(s)
    expect(colors.length).toBeGreaterThan(0)
    expect(new Set(colors)).toEqual(new Set([presetColors[0]]))
    expect(annColors(setPresent(s, 'b', false))).toEqual(colors)
    expect(annColors(setPresent(setPresent(s, 'b', false), 'b', true))).toEqual(colors)
  })

  test('the color survives New night and a reload', () => {
    const s = two()
    expect(annColors(newNight(s))).toEqual(annColors(s))
    const store = createAppStore(createMemoryPersistence(s))
    expect(annColors(store.getState())).toEqual(annColors(s))
  })

  test('wildcards keep their grey', () => {
    const s = two()
    const wild = buildWedges(s.night, s.roster, s.settings.wheel).filter((w) => w.slice.kind === 'wildcard')
    for (const w of wild) expect(w.color).toBe('hsl(0 0% 25%)')
    expect(wild.length).toBeGreaterThan(0)
  })

  test('the wheel follows roster order, not the order viewers were marked present', () => {
    const s = setPresent(setPresent(two(), 'a', false), 'a', true)
    expect(s.night.presentIds).toEqual(['b', 'a'])
    const first = buildWedges(s.night, s.roster, s.settings.wheel)[0]
    expect(first.viewerName).toBe('Ann')
  })
})
