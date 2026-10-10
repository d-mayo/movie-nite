import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type AppState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'

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
      settings: { tmdbToken: token, viewersHidden: false, wheel: defaultWheelSettings },
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

const card = (name = 'Watch next session:') => screen.queryByRole('complementary', { name })
const chip = () => screen.queryByRole('button', { name: 'Next: Film' })
const ack = () => screen.queryByRole('button', { name: 'Acknowledge/Watch' })

test('before the first spin the card says From last session and has only Acknowledge/Watch', () => {
  setup()
  const c = within(card('From last session:')!)
  expect(c.getByRole('img', { name: 'No poster' })).toBeInTheDocument()
  expect(c.getByText('Film (2000)')).toBeInTheDocument()
  expect(c.getByText('1h 52m')).toBeInTheDocument()
  expect(c.getAllByRole('button')).toHaveLength(1)
  expect(ack()).toBeInTheDocument()
  expect(chip()).toBeNull()
})

test('Acknowledge/Watch clears the film for good', () => {
  const store = setup()
  fireEvent.click(ack()!)
  expect(store.getState().holdover).toBeNull()
  expect(card('From last session:')).toBeNull()
  expect(chip()).toBeNull()
})

test('a spun night shows Watch next session with only Dismiss', () => {
  setup({ spun: true })
  const c = within(card()!)
  expect(c.getByText('Film (2000)')).toBeInTheDocument()
  expect(c.getAllByRole('button').map((b) => b.textContent)).toEqual(['Dismiss'])
})

test('no card or chip without a held film', () => {
  setup({}, null)
  expect(card()).toBeNull()
  expect(card('From last session:')).toBeNull()
  expect(chip()).toBeNull()
})

test('a dismissed film on a spun night shows the chip and no card', () => {
  setup({ spun: true, holdoverDismissed: true })
  expect(card()).toBeNull()
  expect(chip()).toBeInTheDocument()
})

test('the token prompt has no card', () => {
  setup({}, film, '')
  expect(card('From last session:')).toBeNull()
})

test('Dismiss shows the chip before End night and focuses it; the chip brings the card back and focuses Dismiss', () => {
  setup({ spun: true })
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(card()).toBeNull()
  const c = chip()!
  expect(c).toHaveFocus()
  const endNight = screen.getByRole('button', { name: 'End night' })
  expect(c.compareDocumentPosition(endNight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  fireEvent.click(c)
  expect(chip()).toBeNull()
  expect(card()).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveFocus()
})

test('after New night the film comes back as From last session without taking focus', () => {
  const store = setup({ ended: true, spun: true })
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(chip()).toHaveFocus()
  const newNight = screen.getByRole('button', { name: 'New night' })
  newNight.focus()
  fireEvent.click(newNight)
  expect(store.getState().night.holdoverDismissed).toBe(false)
  expect(card('From last session:')).toBeInTheDocument()
  expect(ack()).not.toHaveFocus()
})

test('the From last session card stays through a spin only until the spin starts', async () => {
  const store = setup()
  expect(card('From last session:')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  expect(store.getState().holdover).toBeNull()
  expect(card('From last session:')).toBeNull()
  await screen.findByRole('dialog')
})

test('the card stays up and enabled through a later spin and its reveal', async () => {
  setup({ spun: true })
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  expect(card()).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled()
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

test('a second Save for Next Week warns before replacing the first, and Keep it backs out', async () => {
  const store = setup({ spun: true })
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save for Next Week' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('This will replace Film')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }))
  expect(within(dialog).queryByRole('alert')).toBeNull()
  expect(store.getState().holdover?.title).toBe('Film')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save for Next Week' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Replace it' }))
  expect(store.getState().holdover?.title).toBe('Other')
})
