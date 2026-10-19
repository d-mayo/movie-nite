import { describe, expect, test } from 'vitest'
import css from './index.css?raw'
import appCss from './App.css?raw'

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

const isColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value)
const isFilm = (name: string) => name.startsWith('--film-')
const colorNames = Object.keys(light).filter((name) => isColor(light[name]) && !isFilm(name))
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

describe('color tokens', () => {
  test('the import is not empty and both schemes define colors', () => {
    expect(css.length).toBeGreaterThan(0)
    expect(colorNames.length).toBeGreaterThan(5)
  })

  test('every color and shadow token in light is also in dark, and body uses tokens', () => {
    for (const name of Object.keys(light)) {
      if ((isColor(light[name]) && !isFilm(name)) || isShadow(name)) {
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

  test('every color token is a logo grey, except danger', () => {
    for (const [scheme, set] of Object.entries(schemes)) {
      for (const name of colorNames) {
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

describe('film tokens', () => {
  test('stock and cream are the design colors, with steel greys, on :root only', () => {
    expect(light['--film-stock']).toBe('#121211')
    expect(light['--film-cream']).toBe('#f5f1dc')
    for (const name of ['--film-steel-light', '--film-steel', '--film-steel-dark']) {
      expect(light[name], name).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(Object.keys(dark).filter(isFilm)).toEqual([])
  })
})

describe('shared control rules', () => {
  test('the slider track is drawn from --fill in both engines', () => {
    expect(css).toMatch(/::-webkit-slider-runnable-track[^}]*var\(--fill/)
    expect(css).toContain('::-moz-range-progress')
  })

  const rules = (selector: string) =>
    [...css.matchAll(/(^|\n)([^{}\n@][^{}]*)\{([^}]*)\}/g)]
      .filter((m) => m[2].split(',').some((s) => s.trim().startsWith(selector)))
      .map((m) => m[3])

  test.each(['.inset-card', '.stepper', '.slider'])('%s has rules that use only color tokens', (selector) => {
    const found = rules(selector)
    expect(found.length, selector).toBeGreaterThan(0)
    for (const body of found) {
      for (const m of body.matchAll(/(?:^|[\s;])(?:color|background|border|border-color|outline):\s*([^;]+);/g)) {
        const value = m[1].replace(/color-mix\([^)]*\)/g, '')
        expect(value, `${selector}: ${m[0].trim()}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
      }
    }
  })
})

describe('reveal frame', () => {
  const reveal = tokens(block(css.slice(css.lastIndexOf('@media (prefers-color-scheme: dark)')), '.reveal'))
  const revealBody = block(css.slice(css.lastIndexOf('@media (prefers-color-scheme: dark)')), '.reveal')

  test('sets color-scheme dark and every color token to its dark value', () => {
    expect(revealBody).toMatch(/color-scheme:\s*dark/)
    expect(reveal['--danger']).toBeDefined()
    for (const [name, value] of Object.entries(reveal)) {
      expect(value, name).toBe(dark[name])
    }
    for (const name of colorNames) expect(reveal[name], name).toBe(dark[name])
  })

  test('text, muted, danger and cream read on the film stock', () => {
    for (const color of [reveal['--text'], reveal['--muted'], reveal['--danger'], light['--film-cream']]) {
      expect(contrast(color, light['--film-stock']), color).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the wildcard wheel stylesheet', () => {
  const rules = (source: string) =>
    [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))

  test('reduced motion stops the grain', () => {
    expect(appCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.wheel \.wheel-grain\s*\{\s*animation:\s*none/,
    )
  })

  test('reduced motion turns the cans flip off', () => {
    expect(appCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.can-turn\s*\{\s*transition:\s*none/)
  })

  test('the stage itself never gets a transform or filter (it holds fixed descendants)', () => {
    for (const { selector, body } of rules(appCss)) {
      const parts = selector.split(',').map((part) => part.trim())
      if (!parts.some((part) => /(^|\s)\.wheel-stage(\[[^\]]*\])*$/.test(part))) continue
      expect(body, selector).not.toMatch(/(^|[\s;])(transform|filter|scale|translate|rotate|perspective|backdrop-filter):/)
    }
  })
})

describe('card faces', () => {
  // The first film token a property of the exact selector's rule is set to, as its hex value.
  const color = (selector: string, prop: string): string => {
    for (const m of appCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!m[1].split(',').some((part) => part.trim() === selector)) continue
      const value = m[2].match(new RegExp(String.raw`(?:^|[\s;])${prop}:\s*([^;]+);`))?.[1]
      const token = value?.match(/var\((--film-[\w-]+)\)/)?.[1]
      if (token) return light[token]
    }
    throw new Error(`no ${prop} on ${selector}`)
  }

  const cream = light['--film-cream']
  const stock = light['--film-stock']

  test('a wheel card reads on its cream face, text at AA and outlines at 3:1', () => {
    const face = color('.card-face-wheel', 'background')
    expect(face).toBe(cream)
    const text: [string, string][] = [
      ['.card-face-wheel', 'color'],
      ['.card-face-wheel .card-type', 'color'],
      ['.card-face-wheel .reveal-tag', 'color'],
      ['.card-face-wheel .film-cans-status', 'color'],
    ]
    for (const [selector, prop] of text) expect(contrast(color(selector, prop), face), selector).toBeGreaterThanOrEqual(4.5)
    const lines: [string, string][] = [
      ['.card-face-wheel', 'border-color'],
      ['.card-face-wheel .reveal-tag', 'border-color'],
      ['.card-face-wheel .card-back-button:focus-visible', 'outline'],
      ['.card-face-wheel .can-arrow', 'border-top-color'],
      ['.card-face-wheel .can:focus-visible', 'outline-color'],
      ['.card-face-wheel .can-chosen .can-film', 'outline-color'],
      ['.card-face-wheel .can-film', 'border'],
    ]
    for (const [selector, prop] of lines) expect(contrast(color(selector, prop), face), selector).toBeGreaterThanOrEqual(3)
    const button = color('.card-face-wheel .card-back-button', 'background')
    expect(button).toBe(stock)
    expect(contrast(color('.card-face-wheel .card-back-button', 'color'), button)).toBeGreaterThanOrEqual(4.5)
  })

  test('a movie card reads on its stock face', () => {
    const face = color('.card-face', 'background')
    expect(face).toBe(stock)
    for (const selector of ['.card-face', '.card-type', '.film-cans-status']) {
      expect(contrast(color(selector, 'color'), face), selector).toBeGreaterThanOrEqual(4.5)
    }
    expect(color('.card-face-movie', 'border-color')).toBe(light['--film-steel-light'])
    expect(contrast(color('.card-face-movie', 'border-color'), face)).toBeGreaterThanOrEqual(3)
    expect(contrast(color('.card-face-movie .card-back-button:focus-visible', 'outline'), face)).toBeGreaterThanOrEqual(3)
    const button = color('.card-back-button', 'background')
    expect(button).toBe(cream)
    expect(contrast(color('.card-back-button', 'color'), button)).toBeGreaterThanOrEqual(4.5)
  })
})
