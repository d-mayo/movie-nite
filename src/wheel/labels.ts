// The wheel's labels and wildcard word, laid out without touching the DOM.
// Positions are in the label's turned frame: x runs from the hub out along the slice's middle
// radius, y across it, in the wheel's units (the rim is at 100).

// Bebas Neue's advance widths in 1/1000 em, read from the bundled font
// (@fontsource/bebas-neue, latin 400) with fontTools' hmtx table. Bebas Neue is capitals only.
const advances: Record<string, number> = {
  A: 401, B: 404, C: 383, D: 406, E: 363, F: 344, G: 391, H: 420, I: 192, J: 265, K: 414, L: 344, M: 538,
  N: 427, O: 400, P: 386, Q: 400, R: 403, S: 372, T: 364, U: 402, V: 382, W: 557, X: 406, Y: 394, Z: 362,
  '0': 400, '1': 400, '2': 400, '3': 400, '4': 400, '5': 400, '6': 400, '7': 400, '8': 400, '9': 400,
  ' ': 160, '.': 188, ',': 188, ':': 188, ';': 188, "'": 188, '"': 336, '!': 210, '?': 363, '&': 417,
  '-': 270, '(': 276, ')': 276, '…': 500,
}
// Any other character: no narrower than the widest capital (W).
const fallbackAdvance = 557

export const capHeight = 0.7
export const hubRadius = 28
export const labelOuter = 96
// The clapper's sticks fill the rim from here out to the wedge's edge at 100.
export const sticksInner = 85
const wordOuter = sticksInner - 1.5
const edgeMargin = 0.7
const padding = 1.2
const lineGap = 1
const titleRatio = 0.65
const sizeSteps = [9, 8, 7, 6, 5.5]
const watermarkCenter = (sticksInner + hubRadius) / 2

export function textWidth(text: string, size: number): number {
  let total = 0
  for (const ch of text) total += advances[ch] ?? fallbackAdvance
  return (total * size) / 1000
}

export interface TextPlace {
  text: string
  size: number
  // The end of the text (it is end-anchored) and its baseline.
  x: number
  y: number
}

export interface LabelLayout {
  tag: { x: number; y: number; width: number; height: number }
  name: TextPlace
  title: TextPlace | null
}

function halfAngleOf(widthDeg: number): number {
  return (Math.min(widthDeg, 360) / 2) * (Math.PI / 180)
}

// The smallest x a box of half-height `halfH` may start at: outside the hub, and with its inner
// corners the margin inside the slice's edges.
function innerLimit(halfH: number, half: number, margin: number): number {
  const hub = Math.sqrt(Math.max(0, hubRadius * hubRadius - halfH * halfH))
  if (half >= Math.PI / 2) return hub
  const s = Math.sin(half)
  if (s <= 0) return Infinity
  return Math.max(hub, (margin + halfH * Math.cos(half)) / s)
}

function shorten(text: string, size: number, maxWidth: number): string | null {
  if (textWidth(text, size) <= maxWidth) return text
  const chars = Array.from(text)
  for (let n = chars.length - 1; n >= 2; n--) {
    const candidate = `${chars.slice(0, n).join('').trimEnd()}…`
    if (textWidth(candidate, size) <= maxWidth) return candidate
  }
  return null
}

function build(name: string, title: string | null, size: number): LabelLayout {
  const titleSize = size * titleRatio
  const nameWidth = textWidth(name, size)
  const width = Math.max(nameWidth, title === null ? 0 : textWidth(title, titleSize)) + 2 * padding
  const height =
    2 * padding + capHeight * size + (title === null ? 0 : lineGap + capHeight * titleSize)
  const nameBaseline = -height / 2 + padding + capHeight * size
  return {
    tag: { x: labelOuter - width, y: -height / 2, width, height },
    name: { text: name, size, x: labelOuter - padding, y: nameBaseline },
    title:
      title === null
        ? null
        : {
            text: title,
            size: titleSize,
            x: labelOuter - padding,
            y: nameBaseline + lineGap + capHeight * titleSize,
          },
  }
}

function tryLayout(name: string, title: string | null, half: number): LabelLayout | null {
  for (const size of sizeSteps) {
    const isMin = size === sizeSteps[sizeSteps.length - 1]
    const titleSize = size * titleRatio
    const height =
      2 * padding + capHeight * size + (title === null ? 0 : lineGap + capHeight * titleSize)
    const maxText = labelOuter - innerLimit(height / 2, half, edgeMargin) - 2 * padding
    if (!isMin) {
      if (
        textWidth(name, size) <= maxText &&
        (title === null || textWidth(title, titleSize) <= maxText)
      ) {
        return build(name, title, size)
      }
      continue
    }
    const shortName = shorten(name, size, maxText)
    const shortTitle = title === null ? null : shorten(title, titleSize, maxText)
    if (shortName === null || (title !== null && shortTitle === null)) return null
    return build(shortName, shortTitle, size)
  }
  return null
}

// A viewer's label: the name, and the title under it when a two-line tag fits. Shrinks, then
// shortens, then drops the title, then gives up (null).
export function layoutLabel(
  name: string,
  title: string | null,
  widthDeg: number,
): LabelLayout | null {
  if (!(widthDeg > 0) || name === '') return null
  const half = halfAngleOf(widthDeg)
  const upperName = name.toUpperCase()
  if (title !== null && title !== '') {
    const two = tryLayout(upperName, title.toUpperCase(), half)
    if (two) return two
  }
  return tryLayout(upperName, null, half)
}

function wordAt(text: string, size: number): TextPlace {
  return { text, size, x: wordOuter, y: (capHeight * size) / 2 }
}

function wordFits(text: string, size: number, half: number, margin: number): boolean {
  const x0 = wordOuter - textWidth(text, size)
  return x0 >= innerLimit((capHeight * size) / 2, half, margin)
}

// A wildcard's word: WILDCARD at the largest size that fits inside the sticks, or a "?" sized
// to the room there. Never shortened, never nothing.
export function layoutWildcard(widthDeg: number): TextPlace {
  const half = halfAngleOf(widthDeg > 0 ? widthDeg : 0.1)
  for (const size of sizeSteps) {
    if (wordFits('WILDCARD', size, half, edgeMargin)) return wordAt('WILDCARD', size)
  }
  const margin = Math.min(edgeMargin, wordOuter * Math.sin(Math.min(half, Math.PI / 2)) * 0.15)
  let lo = 0.3
  let hi = 10
  if (wordFits('?', hi, half, margin)) return wordAt('?', hi)
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (wordFits('?', mid, half, margin)) lo = mid
    else hi = mid
  }
  return wordAt('?', lo)
}

// Where the wildcard's M watermark goes: centered between the sticks and the hub, at the largest
// size that fits the slice, or null when it would be too small to recognize.
// The M's painted box in the logo's inner units is 437.5 wide and 372.5 tall.
export const markWidth = 437.5
export const markHeight = 372.5
const markMaxHeight = 36
const markMinHeight = 14

export function layoutWatermark(widthDeg: number): { radius: number; scale: number } | null {
  if (!(widthDeg > 0)) return null
  const half = halfAngleOf(widthDeg)
  const fits = (scale: number): boolean => {
    const h = markHeight * scale
    const w = markWidth * scale
    const inner = watermarkCenter - h / 2
    if (inner < hubRadius || watermarkCenter + h / 2 > sticksInner) return false
    if (half >= Math.PI / 2) return true
    return inner * Math.sin(half) - (w / 2) * Math.cos(half) >= edgeMargin
  }
  let lo = 0
  let hi = markMaxHeight / markHeight
  if (fits(hi)) lo = hi
  else {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
  }
  if (markHeight * lo < markMinHeight) return null
  return { radius: watermarkCenter, scale: lo }
}
