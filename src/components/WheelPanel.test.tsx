import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { angleUnderPointer } from '../wheel/draw.ts'
import { defaultLayout, sliceArcs } from '../wheel/layout.ts'

function film(id: number, posterPath: string | null = null): Nomination {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    year: 2000,
    posterPath,
    overview: 'A film.',
    runtime: 112,
    genres: [],
  }
}

function setup(
  nominated: string[],
  extra: { random?: () => number; spinMs?: number } = { spinMs: 20 },
) {
  const roster = [
    { id: 'a', name: 'Ann' },
    { id: 'b', name: 'Bo' },
  ]
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok' },
      roster,
      night: {
        presentIds: ['a', 'b'],
        nominations: Object.fromEntries(
          nominated.map((id, i) => [id, film(i + 1, `/p${i + 1}.jpg`)]),
        ),
      },
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} {...extra} />)
  return store
}

const spinButton = () => screen.getByRole('button', { name: 'Spin' })
const hrefs = () =>
  Array.from(document.querySelectorAll('image')).map((i) => i.getAttribute('href'))

test('spin is disabled with no viewers', () => {
  const store = createAppStore(
    createMemoryPersistence({ ...defaultState, settings: { tmdbToken: 'tok' } }),
  )
  render(<App store={store} fetchFn={vi.fn()} />)
  expect(spinButton()).toBeDisabled()
  expect(screen.getByText('Viewers are needed to spin.')).toBeInTheDocument()
})

test('spin waits for the viewers who have not nominated', () => {
  const store = setup(['a'])
  expect(spinButton()).toBeDisabled()
  expect(screen.getByText('Waiting for Bo to nominate.')).toBeInTheDocument()
  act(() => store.getState().nominate('b', film(9)))
  expect(spinButton()).toBeEnabled()
})

test('spinning locks setup, rests in the drawn slice and shows a snapshot', async () => {
  const store = setup(['a', 'b'], { random: () => 0.5, spinMs: 20 })
  fireEvent.click(spinButton())

  expect(spinButton()).toBeDisabled()
  expect(screen.getByLabelText('Ann')).toBeDisabled()
  expect(screen.getByLabelText('Add a viewer')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'New night' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Change TMDB token' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Change film for Ann' })).toBeDisabled()

  const before = hrefs()
  act(() => store.getState().nominate('a', film(7, '/other.jpg')))
  expect(hrefs()).toEqual(before)

  await screen.findByRole('dialog')
  expect(spinButton()).toBeDisabled()
  expect(screen.getByLabelText('Ann')).toBeDisabled()

  const slices = defaultLayout(['a', 'b'], {})
  const arcs = sliceArcs(slices)
  // random() = 0.5 draws the slice holding half the total weight and rests at its middle.
  const total = slices.reduce((s, x) => s + x.weight, 0)
  let cumulative = 0
  const index = slices.findIndex((s) => (cumulative += s.weight) > total / 2)
  const transform = document
    .querySelector('svg.wheel > g')!
    .getAttribute('transform')!
  const rotation = Number(/rotate\(([^)]+)\)/.exec(transform)![1])
  const angle = angleUnderPointer(rotation)
  expect(angle).toBeGreaterThan(arcs[index].start)
  expect(angle).toBeLessThan(arcs[index].end)
  expect(rotation).toBeGreaterThanOrEqual(5 * 360)
})

test('Close makes the wheel live and unlocks setup', async () => {
  const store = setup(['a', 'b'])
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  act(() => store.getState().nominate('a', film(7, '/other.jpg')))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Ann')).toBeEnabled()
  expect(spinButton()).toBeEnabled()
  await waitFor(() => expect(hrefs()).toContain('https://image.tmdb.org/t/p/w185/other.jpg'))
})

test('the draw uses crypto.getRandomValues by default', async () => {
  const spy = vi.spyOn(crypto, 'getRandomValues')
  setup(['a', 'b'])
  fireEvent.click(spinButton())
  expect(spy).toHaveBeenCalled()
  await screen.findByRole('dialog')
  spy.mockRestore()
})
