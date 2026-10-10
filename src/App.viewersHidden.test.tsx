import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App.tsx'
import { defaultState, type AppState, type Nomination } from './state/model.ts'
import { createMemoryPersistence } from './state/persistence.ts'
import { createAppStore } from './state/store.ts'
import { defaultWheelSettings } from './wheel/edit.ts'
import { header, openCell } from './test/cells.ts'

afterEach(() => vi.useRealTimers())

function film(id: number): Nomination {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    year: 2000,
    posterPath: null,
    overview: 'A film.',
    runtime: 112,
    genres: [],
  }
}

function setup(
  viewersHidden = false,
  seed: { night?: Partial<AppState['night']>; holdover?: Nomination | null } = {},
) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok', viewersHidden, wheel: defaultWheelSettings },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
      ],
      night: {
        ...defaultState.night,
        presentIds: ['a', 'b'],
        nominations: { a: film(1), b: film(2) },
        ...seed.night,
      },
      holdover: seed.holdover ?? null,
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} random={() => 0.1} spinMs={20} />)
  return store
}

const hideButton = () => screen.getByRole('button', { name: 'Hide viewers' })
const showButton = () => screen.getByRole('button', { name: 'Show viewers' })
const noShow = () => expect(screen.queryByRole('button', { name: 'Show viewers' })).toBeNull()
const night = () => document.querySelector('.night')!

test('Hide viewers shows the tab and focuses it; Show viewers restores the pane and focuses Hide', () => {
  const store = setup()
  noShow()
  fireEvent.click(hideButton())
  expect(store.getState().settings.viewersHidden).toBe(true)
  expect(night()).toHaveClass('viewers-hidden')
  expect(showButton()).toHaveFocus()
  fireEvent.click(showButton())
  expect(store.getState().settings.viewersHidden).toBe(false)
  noShow()
  expect(night()).not.toHaveClass('viewers-hidden')
  expect(hideButton()).toHaveFocus()
})

test('a pane saved hidden shows the tab without taking focus', () => {
  setup(true)
  expect(showButton()).not.toHaveFocus()
  expect(night()).toHaveClass('viewers-hidden')
})

test('hiding and showing work during a spin and its reveal, and change no night data', async () => {
  const store = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  expect(hideButton()).toBeEnabled()
  expect(screen.getByRole('button', { name: 'More for all viewers' })).toBeDisabled()
  const { roster, night: n, holdover } = store.getState()
  fireEvent.click(hideButton())
  expect(store.getState().settings.viewersHidden).toBe(true)
  await screen.findByRole('dialog')
  fireEvent.click(showButton())
  expect(store.getState().settings.viewersHidden).toBe(false)
  const after = store.getState()
  expect(after.roster).toBe(roster)
  expect(after.night).toBe(n)
  expect(after.holdover).toBe(holdover)
})

test('the Hide viewers button sits outside the fieldset and the menu stays locked in a spin', () => {
  setup()
  expect(hideButton().closest('fieldset')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  const reset = screen.getByRole('button', { name: 'Reset all slices and weights', hidden: true })
  expect(reset).toBeDisabled()
})

test('hiding closes the open cell, and a pane saved hidden still opens cells', () => {
  setup()
  openCell('Ann')
  expect(header('Ann')).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(hideButton())
  expect(header('Ann')).toHaveAttribute('aria-expanded', 'false')
})

test('a cell still opens when the pane is saved hidden (a narrow screen)', () => {
  setup(true)
  openCell('Ann')
  expect(header('Ann')).toHaveAttribute('aria-expanded', 'true')
})

test('Wheel settings, End night, New night and the held-film card work while hidden', () => {
  setup(true, { night: { spun: true }, holdover: film(9) })
  const banner = within(screen.getByRole('banner'))
  fireEvent.click(banner.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Wheel settings' }))
  expect(screen.getByRole('dialog', { name: 'Wheel settings' })).toBeInTheDocument()
  act(() => (screen.getByRole('dialog') as HTMLDialogElement).close())

  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  fireEvent.click(banner.getByRole('button', { name: /^Next:/ }))
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()

  fireEvent.click(banner.getByRole('button', { name: 'End night' }))
  const dialog = screen.getByRole('dialog', { name: 'End the night?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'End night' }))
  act(() => {})
  fireEvent.click(banner.getByRole('button', { name: 'New night' }))
  expect(banner.getByRole('button', { name: 'End night' })).toBeInTheDocument()
  showButton()
})

test('the waiting message goes in the slot after the wheel, outside the wheel panel', () => {
  setup(false, { night: { nominations: { a: film(1) } } })
  const message = screen.getByText('Waiting for Bo to nominate.')
  expect(message.closest('.wheel-reason-slot')).not.toBeNull()
  expect(message.closest('.wheel-panel')).toBeNull()
})
