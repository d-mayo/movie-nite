import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type AppState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'

const film: Nomination = {
  tmdbId: 1,
  title: 'Film',
  year: 2000,
  posterPath: null,
  overview: 'A film.',
  runtime: 112,
  genres: [],
}

function setup(night: Partial<AppState['night']> = {}, holdover: Nomination | null = film, token = 'tok') {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: token },
      roster: [{ id: 'a', name: 'Ann', color: '#e6194b' }],
      night: {
        ...defaultState.night,
        presentIds: ['a'],
        nominations: { a: { ...film, tmdbId: 2, title: 'Other' } },
        ...night,
      },
      holdover,
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} random={() => 0} spinMs={20} />)
  return store
}

const card = () => screen.queryByRole('complementary', { name: 'Watch next session' })
const chip = () => screen.queryByRole('button', { name: 'Next: Film' })

test('the card shows the held film with its poster, label, runtime and two buttons', () => {
  setup()
  const c = within(card()!)
  expect(c.getByRole('img', { name: 'No poster' })).toBeInTheDocument()
  expect(c.getByText('Film (2000)')).toBeInTheDocument()
  expect(c.getByText('1h 52m')).toBeInTheDocument()
  expect(c.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  expect(c.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  expect(chip()).toBeNull()
})

test('no card or chip without a held film', () => {
  setup({}, null)
  expect(card()).toBeNull()
  expect(chip()).toBeNull()
})

test('a dismissed film shows no card', () => {
  setup({ holdoverDismissed: true })
  expect(card()).toBeNull()
  expect(chip()).toBeInTheDocument()
})

test('the token prompt has no card', () => {
  setup({}, film, '')
  expect(card()).toBeNull()
})

test('Dismiss shows the chip before Wheel settings and focuses it; the chip brings the card back and focuses Dismiss', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(card()).toBeNull()
  const c = chip()!
  expect(c).toHaveFocus()
  const wheel = screen.getByRole('button', { name: 'Wheel settings' })
  expect(c.compareDocumentPosition(wheel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(c)
  expect(chip()).toBeNull()
  expect(card()).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus()
})

test('Clear removes the film and both card and chip', () => {
  const store = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(store.getState().holdover).toBeNull()
  expect(card()).toBeNull()
  expect(chip()).toBeNull()
})

test('after New night a dismissed film shows its card again without taking focus', () => {
  const store = setup({ ended: true })
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(chip()).toHaveFocus()
  const newNight = screen.getByRole('button', { name: 'New night' })
  newNight.focus()
  fireEvent.click(newNight)
  expect(store.getState().night.holdoverDismissed).toBe(false)
  expect(card()).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dismiss' })).not.toHaveFocus()
})

test('the card stays up and enabled through a later spin and its reveal', async () => {
  setup({ spun: true })
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  expect(card()).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled()
  await screen.findByRole('dialog')
  expect(card()).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled()
})

test('the chip stays enabled during a spin', async () => {
  setup({ spun: true, holdoverDismissed: true })
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  expect(chip()).toBeEnabled()
  await screen.findByRole('dialog')
  expect(chip()).toBeEnabled()
})
