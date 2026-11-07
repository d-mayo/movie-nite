import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
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

function setup(wheel = {}, fffUnlocked = false, debugEnabled = false) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, fffUnlocked, debugEnabled, wheel: { ...defaultWheelSettings, ...wheel } },
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

const gear = () => screen.getByRole('button', { name: 'Settings' })
const menuItem = () => screen.queryByRole('button', { name: 'Debug options' })
const spin = () => screen.getByRole('button', { name: 'Spin' })
const labels = ['Force close calls', 'Force catches', 'Force countdowns', 'Force wildcards']

beforeEach(() => window.history.pushState({}, '', '/?debug'))
afterEach(() => window.history.pushState({}, '', '/'))

test('without ?debug there is no Debug options item in the settings menu', () => {
  window.history.pushState({}, '', '/')
  setup()
  fireEvent.click(gear())
  expect(menuItem()).toBeNull()
  expect(screen.getByRole('button', { name: 'Credits' })).toBeInTheDocument()
})

test('?debug adds the item to the menu after Credits, and it stays once the address is plain', () => {
  setup()
  fireEvent.click(gear())
  const items = screen.getAllByRole('button').filter((b) => b.closest('#settings-menu'))
  expect(items.map((b) => b.textContent)).toEqual(['Wheel settings', 'Credits', 'Debug options'])
  cleanup()
  window.history.pushState({}, '', '/')
  setup({}, false, true)
  fireEvent.click(gear())
  expect(menuItem()).not.toBeNull()
})

test('?debug=off removes the item again', () => {
  window.history.pushState({}, '', '/?debug=off')
  setup({}, false, true)
  fireEvent.click(gear())
  expect(menuItem()).toBeNull()
})

test('the overlay holds every Force control once, none under the wheel, and starts off', () => {
  setup()
  for (const label of [...labels, 'Force card']) expect(screen.queryByLabelText(label)).toBeNull()
  expect(document.querySelector('.debug-force')).toBeNull()
  const dialog = openDebug()
  for (const label of labels) {
    expect(screen.getAllByLabelText(label)).toHaveLength(1)
    expect(within(dialog).getByLabelText(label)).not.toBeChecked()
  }
  expect(within(dialog).getAllByRole('switch').map((s) => s.parentElement!.textContent!.trim())).toEqual(labels)
  expect(screen.getAllByLabelText('Force card')).toHaveLength(1)
  expect(within(dialog).getByLabelText('Force card')).toHaveValue('')
  closeDebug()
  for (const label of labels) expect(screen.queryByLabelText(label)).toBeNull()
})

test('the Force card select starts at Random deal and lists the FFF cards only while unlocked', () => {
  setup()
  const options = () => within(within(openDebug()).getByLabelText('Force card')).getAllByRole('option').map((o) => o.textContent)
  expect(options()[0]).toBe('Random deal')
  expect(options().slice(1)).toEqual(cards.filter((c) => !c.fff).map((c) => c.id))
  cleanup()
  setup({}, true)
  expect(options().slice(1)).toEqual(cards.map((c) => c.id))
})

test('the controls lock during a spin while the overlay still opens, and Force close calls needs a Length of 5 s', async () => {
  setup()
  fireEvent.click(spin())
  const dialog = openDebug()
  for (const label of [...labels, 'Force card']) expect(within(dialog).getByLabelText(label)).toBeDisabled()
  closeDebug()
  await screen.findByRole('dialog')
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

test('Done, Escape and a press outside close it, a press inside does not, and focus returns to the gear', () => {
  setup()
  const dialog = openDebug()
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
    left: 100, top: 100, right: 400, bottom: 500, width: 300, height: 400, x: 100, y: 100, toJSON: () => ({}),
  })
  fireEvent.pointerDown(dialog, { clientX: 200, clientY: 200 })
  fireEvent.click(dialog)
  expect(screen.queryByRole('dialog', { name: 'Debug options' })).not.toBeNull()
  fireEvent.pointerDown(dialog, { clientX: 10, clientY: 10 })
  fireEvent.click(dialog)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(spin()).toBeEnabled()
  expect(document.activeElement).toBe(gear())
  fireEvent.click(within(openDebug()).getByRole('button', { name: 'Done' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  openDebug()
  // dialog.close() stands in for Escape, which closes a modal dialog natively.
  closeDebug()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(gear())
})
