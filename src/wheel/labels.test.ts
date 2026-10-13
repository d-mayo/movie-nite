import { describe, expect, it } from 'vitest'
import {
  capHeight,
  hubRadius,
  labelOuter,
  layoutLabel,
  layoutWatermark,
  layoutWildcard,
  sticksInner,
  textWidth,
} from './labels.ts'

const widths = [360, 180, 90, 60, 45, 30, 22, 15, 10, 6, 3, 1]

// The tag's four corners against the slice's edges and the hub.
function inside(tag: { x: number; y: number; width: number; height: number }, widthDeg: number) {
  const half = (Math.min(widthDeg, 360) / 2) * (Math.PI / 180)
  for (const cx of [tag.x, tag.x + tag.width]) {
    for (const cy of [tag.y, tag.y + tag.height]) {
      expect(Math.hypot(cx, cy)).toBeGreaterThanOrEqual(hubRadius - 1e-9)
      if (half < Math.PI / 2) {
        expect(cx * Math.sin(half) - Math.abs(cy) * Math.cos(half)).toBeGreaterThanOrEqual(0.5)
      }
    }
  }
}

describe('textWidth', () => {
  it('covers the required characters and falls back to the widest capital', () => {
    for (const ch of "ABCXYZ0189 .,:;'\"!?&-()…") expect(textWidth(ch, 1000)).toBeGreaterThan(0)
    expect(textWidth('é', 1000)).toBeGreaterThanOrEqual(textWidth('W', 1000))
  })

  it('is the sum of the advances times the size', () => {
    expect(textWidth('AB', 10)).toBeCloseTo((401 + 404) / 100)
    expect(textWidth('', 10)).toBe(0)
  })
})

describe('layoutLabel', () => {
  it('sizes the tag from the longer line with equal padding on all four sides', () => {
    const l = layoutLabel('Ann', 'The Long Title', 90)!
    expect(l.title).not.toBeNull()
    const text = Math.max(textWidth(l.name.text, l.name.size), textWidth(l.title!.text, l.title!.size))
    const pad = (l.tag.width - text) / 2
    expect(pad).toBeGreaterThan(0.8)
    expect(pad).toBeLessThan(1.5)
    // Left and right.
    expect(l.name.x - text - l.tag.x).toBeCloseTo(pad)
    expect(l.tag.x + l.tag.width - l.name.x).toBeCloseTo(pad)
    // Top: the name's capitals; bottom: the title's baseline.
    expect(l.name.y - capHeight * l.name.size - l.tag.y).toBeCloseTo(pad)
    expect(l.tag.y + l.tag.height - l.title!.y).toBeCloseTo(pad)
    expect(l.title!.size / l.name.size).toBeGreaterThanOrEqual(0.6)
    expect(l.title!.size / l.name.size).toBeLessThanOrEqual(0.7)
  })

  it('puts the outer end at the same radius on every label', () => {
    const ends = [layoutLabel('Ann', null, 90)!, layoutLabel('Barbara Jean', 'Heat', 60)!].map(
      (l) => l.tag.x + l.tag.width,
    )
    expect(ends[0]).toBe(ends[1])
    expect(ends[0]).toBe(labelOuter)
    expect(labelOuter).toBeLessThan(100)
  })

  it('upper-cases the text', () => {
    expect(layoutLabel('Ann', 'Heat', 90)!.name.text).toBe('ANN')
  })

  it('keeps every tag inside its slice and outside the hub', () => {
    for (const w of widths) {
      for (const [n, t] of [
        ['Ann', null],
        ['Ann', 'Heat'],
        ['A very long viewer name indeed', 'An extremely long film title that goes on'],
        ['Bartholomew', 'Up'],
      ] as const) {
        const l = layoutLabel(n, t, w)
        if (l) inside(l.tag, w)
      }
    }
  })

  it('shrinks before it shortens, and a shortened line ends in an ellipsis and fits', () => {
    const long = 'Bartholomew Fitzgerald'
    const wide = layoutLabel(long, null, 360)!
    const mid = layoutLabel(long, null, 40)!
    expect(mid.name.size).toBeLessThanOrEqual(wide.name.size)
    expect(wide.name.text).toBe(long.toUpperCase())
    const cut = layoutLabel('Bartholomew Fitzgerald Winterbottom', null, 25)!
    expect(cut.name.text.endsWith('…')).toBe(true)
    expect(cut.name.size).toBe(5.5)
    inside(cut.tag, 25)
  })

  it('cuts a long title by room, not at 14 characters', () => {
    const l = layoutLabel('Ann', 'The Godfather Part II Remastered', 180)!
    expect(l.title!.text.length).toBeGreaterThan(14)
    const tighter = layoutLabel('Ann', 'The Godfather Part II Remastered Extended Director Cut Edition Special', 30)!
    expect(tighter.title!.text.endsWith('…')).toBe(true)
    expect(tighter.title!.text.length).toBeGreaterThan(14)
  })

  it('drops the title before the label, and the label on a slice too thin', () => {
    let dropped = false
    let gone = false
    for (let w = 40; w >= 0.5; w -= 0.5) {
      const l = layoutLabel('Ann', 'Heat', w)
      if (l === null) gone = true
      else if (l.title === null) {
        expect(gone).toBe(false)
        dropped = true
      } else expect(dropped || gone).toBe(false)
    }
    expect(dropped).toBe(true)
    expect(gone).toBe(true)
    expect(layoutLabel('Ann', null, 1)).toBeNull()
    expect(layoutLabel('Ann', null, 0)).toBeNull()
  })
})

describe('layoutWildcard', () => {
  it('shows WILDCARD at full size on a wide slice, inside the sticks', () => {
    const w = layoutWildcard(90)
    expect(w.text).toBe('WILDCARD')
    expect(w.size).toBe(9)
    expect(w.x).toBeLessThan(sticksInner)
    expect(w.x - textWidth(w.text, w.size)).toBeGreaterThanOrEqual(hubRadius)
  })

  it('shrinks on narrower slices, never shortening, then gives a ? that fits', () => {
    let seenSmaller = false
    let seenQuestion = false
    for (let deg = 120; deg >= 1; deg -= 1) {
      const w = layoutWildcard(deg)
      expect(w.text === 'WILDCARD' || w.text === '?').toBe(true)
      expect(w.size).toBeGreaterThan(0)
      expect(w.x).toBeLessThan(sticksInner)
      const half = (deg / 2) * (Math.PI / 180)
      const x0 = w.x - textWidth(w.text, w.size)
      const h = (capHeight * w.size) / 2
      expect(Math.hypot(x0, h)).toBeGreaterThanOrEqual(hubRadius - 1e-9)
      expect(x0 * Math.sin(half) - h * Math.cos(half)).toBeGreaterThanOrEqual(-1e-9)
      if (w.text === 'WILDCARD' && w.size < 9) seenSmaller = true
      if (w.text === '?') seenQuestion = true
    }
    expect(seenSmaller).toBe(true)
    expect(seenQuestion).toBe(true)
    expect(layoutWildcard(1).text).toBe('?')
  })
})

describe('layoutWatermark', () => {
  it('sits between the sticks and the hub, and is left out on a narrow slice', () => {
    const big = layoutWatermark(90)!
    expect(big.radius).toBeCloseTo((sticksInner + hubRadius) / 2)
    const small = layoutWatermark(20)!
    expect(small.scale).toBeLessThan(big.scale)
    expect(layoutWatermark(8)).toBeNull()
  })
})
