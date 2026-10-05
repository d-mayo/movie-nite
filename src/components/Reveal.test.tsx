import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'

const { confetti } = vi.hoisted(() => ({ confetti: vi.fn() }))
vi.mock('canvas-confetti', () => ({ default: confetti }))

function film(id: number, over: Partial<Nomination> = {}): Nomination {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    year: 1999,
    posterPath: `/p${id}.jpg`,
    overview: 'A short synopsis.',
    runtime: 112,
    genres: [],
    ...over,
  }
}

beforeEach(() => {
  confetti.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 5, 20, 0))
})
afterEach(() => vi.useRealTimers())

function setup(random: number, a: Nomination, b: Nomination) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok' },
      roster: [
        { id: 'a', name: 'Ann' },
        { id: 'b', name: 'Bo' },
      ],
      night: {
        ...defaultState.night,
        presentIds: ['a', 'b'],
        nominations: { a, b },
      },
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} random={() => random} spinMs={20} />)
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
}

// With viewers a and b the layout is A B A W B A B W; 0.01 lands on the first slice (A).
test('a nomination shows everything and fires confetti once', async () => {
  setup(0.01, film(1), film(2))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Film 1')).toBeInTheDocument()
  expect(within(dialog).getByText('Nominated by Ann')).toBeInTheDocument()
  expect(within(dialog).getByRole('img', { name: 'Poster of Film 1' })).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/w185/p1.jpg',
  )
  expect(within(dialog).getByText('1999')).toBeInTheDocument()
  expect(within(dialog).getByText('A short synopsis.')).toBeInTheDocument()
  expect(within(dialog).getByText('1h 52m')).toBeInTheDocument()
  expect(within(dialog).getByText('Ends around 9:52 PM–10:07 PM')).toBeInTheDocument()
  expect(confetti).toHaveBeenCalledTimes(1)
})

test('no poster gets a placeholder and no runtime says the end is unknown', async () => {
  setup(0.01, film(1, { posterPath: null, runtime: null }), film(2))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByRole('img', { name: 'No poster' })).toBeInTheDocument()
  expect(within(dialog).getByText(/End time unknown/)).toBeInTheDocument()
})

test('a wildcard says so and fires confetti, and Back to the wheel returns to the wheel', async () => {
  setup(0.45, film(1), film(2))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Wildcard!')).toBeInTheDocument()
  expect(confetti).toHaveBeenCalledTimes(1)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Back to the wheel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Ann')).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Spin' })).toBeEnabled()
  expect(screen.getAllByTestId('wedge')).toHaveLength(8)
})
