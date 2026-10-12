import { render } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import Wheel from '../components/Wheel.tsx'
import type { Wedge } from '../wheel/wedges.ts'
import indexHtml from '../../index.html?raw'
import favicon from '../../public/favicon.svg?raw'
import iconDark from './logo/logo-icon-dark.svg?raw'
import iconLight from './logo/logo-icon-light.svg?raw'
import readme from '../../README.md?raw'

const finals = import.meta.glob('./logo/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const olds = import.meta.glob('./logo/old-iterations/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const names = (files: Record<string, string>) =>
  Object.keys(files)
    .map((path) => path.split('/').pop())
    .sort()

// Each logo is a standalone SVG whose wordmark is outlined paths, so it needs
// no installed font and loads nothing else.
const standalone = (svg: string) =>
  svg.trimStart().startsWith('<svg') &&
  svg.includes('viewBox=') &&
  !/<text|font-family|href/.test(svg)

describe('the logo set', () => {
  test('holds exactly the six final standalone SVGs', () => {
    expect(names(finals)).toEqual([
      'logo-dark-transparent.svg',
      'logo-dark.svg',
      'logo-icon-dark.svg',
      'logo-icon-light.svg',
      'logo-light-transparent.svg',
      'logo-light.svg',
    ])
    for (const [path, svg] of Object.entries(finals)) {
      expect(standalone(svg), path).toBe(true)
    }
  })

  test('keeps the 18 earlier iterations as standalone SVGs', () => {
    const files = names(olds)
    expect(files).toHaveLength(18)
    expect(files.every((name) => name?.endsWith('.svg'))).toBe(true)
    for (const [path, svg] of Object.entries(olds)) {
      expect(standalone(svg), path).toBe(true)
    }
  })
})

describe('the favicon', () => {
  test('is a copy of the light square icon', () => {
    expect(favicon).toBe(iconLight)
  })

  test('is linked once from index.html as /favicon.svg', () => {
    const links = indexHtml.match(/<link\b[^>]*\brel="icon"[^>]*>/g) ?? []
    expect(links).toHaveLength(1)
    expect(links[0]).toContain('type="image/svg+xml"')
    expect(links[0]).toContain('href="/favicon.svg"')
  })
})

describe('the README logo block', () => {
  const block = readme.trimStart().match(/^(?:<p[^>]*>\s*)?<picture>[\s\S]*?<\/picture>/)?.[0]

  test('opens with a picture of the dark and light transparent logos', () => {
    expect(block).toBeDefined()
    expect(block).toMatch(
      /<source media="\(prefers-color-scheme: dark\)" srcset="src\/assets\/logo\/logo-dark-transparent\.svg">/,
    )
    expect(block).toMatch(
      /<img src="src\/assets\/logo\/logo-light-transparent\.svg" alt="Movie Nite"/,
    )
  })

  test('points only at logo files that exist', () => {
    const paths = [...(block ?? '').matchAll(/src\/assets\/logo\/([\w.-]+)/g)]
    expect(paths).toHaveLength(2)
    for (const [, name] of paths) {
      expect(Object.keys(finals), name).toContain(`./logo/${name}`)
    }
  })

  test('names the project and describes it after the logo', () => {
    const after = readme.slice(readme.indexOf('</picture>'))
    expect(after).toContain('Movie Nite')
    expect(after).toContain(
      "Pick tonight's film for the FFF movie-night group: viewers nominate films from TMDB, and a weighted, editable wheel picks what to watch.",
    )
  })
})

describe("the wheel's wildcard watermark", () => {
  test("copies the dark icon's M shapes exactly", () => {
    const dark = new DOMParser().parseFromString(iconDark, 'image/svg+xml')
    const mark = dark.querySelector('g[transform^="translate(5.2"]')!
    const geometry = ['d', 'x', 'y', 'width', 'height', 'rx', 'transform']
    const attrs = (el: Element) => geometry.map((a) => `${a}=${el.getAttribute(a)}`).join(' ')
    const shapes = (root: Element) =>
      Array.from(root.querySelectorAll('rect, path')).map((el) => attrs(el))
    const wedge: Wedge = {
      arc: { start: 0, end: 90 },
      slice: { kind: 'wildcard', weight: 1 },
      color: '#5a5a54',
      viewerName: null,
      nomination: null,
    } as unknown as Wedge
    const { container } = render(createElement(Wheel, { wedges: [wedge], groupRef: null }))
    const copy = container.querySelector('[data-testid="watermark"]')!
    expect(shapes(copy)).toEqual(shapes(mark))
  })
})
