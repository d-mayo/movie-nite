import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { seeded } from '../wildcards/seeded.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'

function setup(today: Date, random: () => number = () => 0.5) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, debugEnabled: true, wheel: defaultWheelSettings },
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} random={random} spinMs={20} today={today} />)
  return store
}

const layer = () => document.querySelector('.seasonal-effects')
const dec10 = new Date(2026, 11, 10)

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

function stubMotion(initial: boolean) {
  let listener: ((e: { matches: boolean }) => void) | null = null
  vi.stubGlobal('matchMedia', () => ({
    matches: initial,
    addEventListener: (_: string, l: typeof listener) => (listener = l),
    removeEventListener: () => (listener = null),
  }))
  return (matches: boolean) => act(() => listener?.({ matches }))
}

test('Christmas gives one aria-hidden snow layer after main, with 35 to 45 flakes carrying their properties', () => {
  setup(dec10)
  const layers = document.querySelectorAll('.seasonal-effects')
  expect(layers).toHaveLength(1)
  const el = layers[0]
  expect(el).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('main').compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const flakes = el.querySelectorAll('.snowflake')
  expect(flakes.length).toBeGreaterThanOrEqual(35)
  expect(flakes.length).toBeLessThanOrEqual(45)
  for (const flake of Array.from(flakes)) {
    const style = (flake as HTMLElement).style
    for (const name of ['--x', '--size', '--duration', '--delay', '--sway', '--flake-opacity']) {
      expect(style.getPropertyValue(name), name).not.toBe('')
    }
  }
})

test('a seeded random gives the same flake properties on two renders', () => {
  const props = () => Array.from(layer()!.querySelectorAll('.snowflake')).map((f) => f.getAttribute('style'))
  setup(dec10, seeded(7))
  const first = props()
  cleanup()
  setup(dec10, seeded(7))
  expect(props()).toEqual(first)
})

test('no layer with no theme, for Halloween or Valentine\'s Day', () => {
  for (const date of [new Date(2026, 10, 7), new Date(2026, 9, 20), new Date(2026, 1, 10)]) {
    setup(date)
    expect(layer()).toBeNull()
    cleanup()
  }
})

test('no layer under reduced motion, and a change of the preference adds or removes it', () => {
  const flip = stubMotion(true)
  setup(dec10)
  expect(layer()).toBeNull()
  flip(false)
  expect(layer()).not.toBeNull()
  flip(true)
  expect(layer()).toBeNull()
})

test('turning Seasonal themes off removes the snow at once, and on brings it back', () => {
  setup(dec10)
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Wheel settings' }))
  const card = screen.getByRole('heading', { name: 'Seasons', level: 3 }).closest('fieldset') as HTMLElement
  const toggle = within(card).getByRole('switch', { name: 'Seasonal themes' })
  fireEvent.click(toggle)
  expect(layer()).toBeNull()
  fireEvent.click(toggle)
  expect(layer()).not.toBeNull()
})
