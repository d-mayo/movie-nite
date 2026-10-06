import { describe, expect, test } from 'vitest'
import indexHtml from '../../index.html?raw'
import favicon from '../../public/favicon.svg?raw'
import iconLight from './logo/logo-icon-light.svg?raw'

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
