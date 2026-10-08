import { describe, expect, test } from 'vitest'
import css from './index.css?raw'

const GREYS = ['#262626', '#4a4c43', '#8f9186', '#b7b9a8', '#eeeee2', '#f6f6ee']

const block = (source: string, selector: string) => {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} rule`)
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

const tokens = (body: string) =>
  Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  )

const darkStart = css.indexOf('@media (prefers-color-scheme: dark)')
const light = tokens(block(css.slice(0, darkStart), ':root'))
const dark = tokens(block(css.slice(darkStart), ':root'))

const isColour = (value: string) => /^#[0-9a-f]{6}$/i.test(value)
const colourNames = Object.keys(light).filter((name) => isColour(light[name]))
const isShadow = (name: string) => name.startsWith('--shadow')

const channel = (v: number) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const schemes = { light, dark }

describe('colour tokens', () => {
  test('the import is not empty and both schemes define colours', () => {
    expect(css.length).toBeGreaterThan(0)
    expect(colourNames.length).toBeGreaterThan(5)
  })

  test('every colour and shadow token in light is also in dark, and body uses tokens', () => {
    for (const name of Object.keys(light)) {
      if (isColour(light[name]) || isShadow(name)) {
        expect(dark, name).toHaveProperty(name)
      }
    }
    const body = block(css, 'body')
    for (const prop of ['background', 'color']) {
      const m = body.match(new RegExp(String.raw`(?:^|[\s;])${prop}:\s*var\((--[\w-]+)\)`))
      expect(m, prop).not.toBeNull()
      expect(light).toHaveProperty(m![1])
    }
  })

  test('every colour token is a logo grey, except danger', () => {
    for (const [scheme, set] of Object.entries(schemes)) {
      for (const name of colourNames) {
        if (name === '--danger') continue
        expect(GREYS, `${scheme} ${name}`).toContain(set[name].toLowerCase())
      }
    }
  })

  test('contrast meets WCAG for text, accent and borders', () => {
    for (const [scheme, set] of Object.entries(schemes)) {
      for (const surface of ['--page', '--card']) {
        for (const text of ['--text', '--muted', '--danger']) {
          expect(contrast(set[text], set[surface]), `${scheme} ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5)
        }
        for (const ui of ['--accent', '--border']) {
          expect(contrast(set[ui], set[surface]), `${scheme} ${ui} on ${surface}`).toBeGreaterThanOrEqual(3)
        }
      }
      expect(contrast(set['--accent-text'], set['--accent']), `${scheme} accent-text`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
