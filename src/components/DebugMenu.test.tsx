import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'
import { cards } from '../wildcards/cards.ts'
import { closeDebug, openDebug } from '../test/debug.ts'

function film(id: number): Nomination {
  return { tmdbId: id, title: `Film ${id}`, year: 2000, posterPath: null, overview: 'A film.', runtime: 112, genres: [] }
}

function setup(wheel = {}, fffUnlocked = false) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, fffUnlocked, wheel: { ...defaultWheelSettings, ...wheel } },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
      ],
      night: { ...defaultState.night, presentIds: ['a', 'b'], nominations: { a: film(1), b: film(2) } },
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} random={() => 0.5} spinMs={20} />)
  return store
}

const bug = () => screen.getByRole('button', { name: 'Debug options' })
const spin = () => screen.getByRole('button', { name: 'Spin' })
const labels = ['Force close calls', 'Force catches', 'Force countdowns', 'Force wildcards']

beforeEach(() => window.history.pushState({}, '', '/?debug'))
afterEach(() => window.history.pushState({}, '', '/'))

test('without ?debug there is no debug button', () => {
  window.history.pushState({}, '', '/')
  setup()
  expect(screen.queryByRole('button', { name: 'Debug options' })).toBeNull()
})

test('the popover holds every Force control once, none under the wheel, and starts off', () => {
  setup()
  for (const label of [...labels, 'Force card']) expect(screen.queryByLabelText(label)).toBeNull()
  expect(document.querySelector('.debug-force')).toBeNull()
  const dialog = openDebug()
  expect(bug()).toHaveClass('active')
  for (const label of labels) {
    expect(screen.getAllByLabelText(label)).toHaveLength(1)
    expect(within(dialog).getByLabelText(label)).not.toBeChecked()
  }
  expect(within(dialog).getAllByRole('switch').map((s) => s.parentElement!.textContent!.trim())).toEqual(labels)
  expect(screen.getAllByLabelText('Force card')).toHaveLength(1)
  expect(within(dialog).getByLabelText('Force card')).toHaveValue('')
  closeDebug()
  expect(bug()).not.toHaveClass('active')
  for (const label of labels) expect(screen.queryByLabelText(label)).toBeNull()
})

test('the Force card select starts at Random deal and lists the FFF cards only while unlocked', () => {
  setup()
  const options = () => within(openDebug()).getAllByRole('option').map((o) => o.textContent)
  expect(options()[0]).toBe('Random deal')
  expect(options().slice(1)).toEqual(cards.filter((c) => !c.fff).map((c) => c.id))
  cleanup()
  setup({}, true)
  expect(options().slice(1)).toEqual(cards.map((c) => c.id))
})

test('the controls lock during a spin while the popover still opens, and Force close calls needs a Length of 5 s', async () => {
  setup()
  fireEvent.click(spin())
  const dialog = openDebug()
  for (const label of [...labels, 'Force card']) expect(within(dialog).getByLabelText(label)).toBeDisabled()
  closeDebug()
  await screen.findByRole('dialog', { name: /./ })
  fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
  for (const label of [...labels, 'Force card']) expect(within(openDebug()).getByLabelText(label)).toBeEnabled()
  closeDebug()
  cleanup()
  setup({ spinSeconds: 4 })
  const close = within(openDebug()).getByLabelText(/Force close calls/)
  expect(close).toBeDisabled()
  expect(close.parentElement).toHaveTextContent('needs a spin Length of 5 s or more')
})

test('a value persists across closing and reopening, and is off again after a remount', () => {
  setup()
  fireEvent.click(within(openDebug()).getByLabelText('Force catches'))
  fireEvent.change(within(openDebug()).getByLabelText('Force card'), { target: { value: 'blind-spin' } })
  closeDebug()
  const dialog = openDebug()
  expect(within(dialog).getByLabelText('Force catches')).toBeChecked()
  expect(within(dialog).getByLabelText('Force card')).toHaveValue('blind-spin')
  cleanup()
  setup()
  expect(within(openDebug()).getByLabelText('Force catches')).not.toBeChecked()
  expect(within(openDebug()).getByLabelText('Force card')).toHaveValue('')
})

describe('closing', () => {
  const at = (x: number, y: number) => ({ clientX: x, clientY: y })
  const stubRect = (dialog: HTMLElement) =>
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, right: 400, bottom: 500, width: 300, height: 400, x: 100, y: 100, toJSON: () => ({}),
    })

  test('Escape closes it and focus returns to the button', () => {
    setup()
    openDebug()
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Debug options' }))
    // dialog.close() stands in for Escape, which closes a modal dialog natively.
    closeDebug()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(bug())
  })

  test('a press outside it closes it on its click and starts no spin', () => {
    setup()
    const dialog = openDebug()
    stubRect(dialog)
    fireEvent.pointerDown(dialog, at(10, 10))
    expect(screen.getByRole('dialog', { name: 'Debug options' })).toBeInTheDocument()
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(spin()).toBeEnabled()
    expect(document.activeElement).toBe(bug())
  })

  describe('where a pointer can hover', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
    })
    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    test('it closes 150 ms after the pointer leaves it once it has been inside', () => {
      setup()
      stubRect(openDebug())
      fireEvent.pointerMove(document, at(10, 10))
      act(() => vi.advanceTimersByTime(1000))
      expect(screen.queryByRole('dialog', { name: 'Debug options' })).not.toBeNull()
      fireEvent.pointerMove(document, at(200, 200))
      fireEvent.pointerMove(document, at(10, 10))
      act(() => vi.advanceTimersByTime(149))
      expect(screen.queryByRole('dialog', { name: 'Debug options' })).not.toBeNull()
      act(() => vi.advanceTimersByTime(1))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(bug())
    })
  })
})
