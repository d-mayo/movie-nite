import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { defaultLayout, type Slice } from '../wheel/layout.ts'

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

const spinButton = () => screen.getByRole('button', { name: 'Spin' })

// A `random` value that lands in the middle of the first slice matching `pick`.
function landOn(pick: (s: Slice) => boolean): () => number {
  const slices = defaultLayout(['a', 'b', 'c'], {})
  const total = slices.reduce((sum, s) => sum + s.weight, 0)
  let before = 0
  for (const s of slices) {
    if (pick(s)) return () => (before + s.weight / 2) / total
    before += s.weight
  }
  throw new Error('no such slice')
}

const ann = landOn((s) => s.kind === 'nomination' && s.viewerId === 'a')
const cy = landOn((s) => s.kind === 'nomination' && s.viewerId === 'c')
const wildcard = landOn((s) => s.kind === 'wildcard')

// Ann and Bo nominated film 1, Cy film 2.
function setupNight(random: () => number, fetchFn: typeof fetch = vi.fn(), spin = true) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok' },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
        { id: 'c', name: 'Cy', color: '#ffe119' },
      ],
      night: {
        ...defaultState.night,
        presentIds: ['a', 'b', 'c'],
        nominations: { a: film(1), b: film(1), c: film(2) },
      },
    }),
  )
  render(<App store={store} fetchFn={fetchFn} random={random} spinMs={20} />)
  if (spin) fireEvent.click(spinButton())
  return store
}

test('Close on a nomination reveal changes nothing', async () => {
  const store = setupNight(ann)
  const dialog = await screen.findByRole('dialog')
  const before = store.getState().night
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(store.getState().night).toBe(before)
  expect(screen.getAllByTestId('wedge')).toHaveLength(12)
  expect(screen.getByLabelText('Ann')).toBeEnabled()
})

test('Watch takes the winner and the duplicate off the wheel and unlocks setup', async () => {
  const store = setupNight(ann)
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Watch' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(store.getState().night.wonFilms).toEqual([1])
  expect(store.getState().night.watched.map((f) => f.tmdbId)).toEqual([1])
  // Only Cy's 3 slices and wildcard remain.
  expect(screen.getAllByTestId('wedge')).toHaveLength(4)
  expect(screen.getByLabelText('Cy')).toBeEnabled()
  expect(spinButton()).toBeEnabled()
})

test('Too long saves the Watch next session film and not the watched list', async () => {
  const store = setupNight(ann)
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Too long' }))
  expect(store.getState().holdover?.tmdbId).toBe(1)
  expect(store.getState().night.watched).toEqual([])
  expect(store.getState().night.wonFilms).toEqual([1])
})

test('the night ends when the last viewer on the wheel wins', async () => {
  const store = setupNight(cy)
  act(() => store.getState().recordOutcome(film(1), 'watch', true))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Watch' }))
  expect(store.getState().night.ended).toBe(true)
  expect(screen.queryByRole('button', { name: 'Spin' })).toBeNull()
})

const wildcardFetch = vi.fn((url: string) => {
  const search = String(url).includes('/search/')
  const body = search
    ? { results: [{ id: 9, title: 'Pick Me', release_date: '2001-01-01', poster_path: null }] }
    : {
        id: 9,
        title: 'Pick Me',
        release_date: '2001-01-01',
        poster_path: null,
        overview: 'o',
        runtime: 120,
        genres: [],
      }
  return Promise.resolve(new Response(JSON.stringify(body)))
}) as unknown as typeof fetch

async function pickWildcardFilm() {
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Wildcard!')).toBeInTheDocument()
  expect(screen.getByLabelText('Ann')).toBeDisabled()
  fireEvent.change(within(dialog).getByLabelText('Search for a wildcard film'), {
    target: { value: 'pick' },
  })
  fireEvent.click(await screen.findByRole('button', { name: 'Pick Pick Me (2001)' }))
  await within(dialog).findByText('Wildcard pick')
  return dialog
}

test('Back to the wheel from the wildcard search changes nothing', async () => {
  const store = setupNight(wildcard)
  const dialog = await screen.findByRole('dialog')
  const before = store.getState().night
  fireEvent.click(within(dialog).getByRole('button', { name: 'Back to the wheel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(store.getState().night).toBe(before)
  expect(screen.getByLabelText('Ann')).toBeEnabled()
})

test('a wildcard pick is revealed from the pick time and Watch leaves the wheel alone', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 5, 20, 0))
  const store = setupNight(wildcard, wildcardFetch)
  await screen.findByRole('dialog')
  vi.setSystemTime(new Date(2026, 9, 5, 21, 0))
  const dialog = await pickWildcardFilm()
  expect(within(dialog).getByText('Ends around 11:00 PM–11:15 PM')).toBeInTheDocument()
  expect(screen.getByLabelText('Ann')).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Watch' }))
  expect(store.getState().night.watched.map((f) => f.tmdbId)).toEqual([9])
  expect(store.getState().night.wonFilms).toEqual([])
  expect(screen.getAllByTestId('wedge')).toHaveLength(12)
  expect(screen.getByLabelText('Ann')).toBeEnabled()
})

test('Too long on a wildcard pick saves the holdover and leaves the wheel alone', async () => {
  const store = setupNight(wildcard, wildcardFetch)
  const dialog = await pickWildcardFilm()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Too long' }))
  expect(store.getState().holdover?.tmdbId).toBe(9)
  expect(store.getState().night.watched).toEqual([])
  expect(store.getState().night.wonFilms).toEqual([])
  expect(screen.getAllByTestId('wedge')).toHaveLength(12)
})

test('Close on a wildcard pick changes nothing', async () => {
  const store = setupNight(wildcard, wildcardFetch)
  const dialog = await pickWildcardFilm()
  const before = store.getState().night
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(store.getState().night).toBe(before)
  expect(store.getState().holdover).toBeNull()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('the summary lists the watched films and the Watch next session film', async () => {
  const store = setupNight(ann)
  act(() => store.getState().recordOutcome(film(5), 'tooLong', false))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Watch' }))
  act(() => store.getState().endNight())
  const summary = screen.getByRole('region', { name: 'Night over' })
  expect(within(summary).getByText('Film 1 (2000)')).toBeInTheDocument()
  expect(within(summary).getByText(/Watch next session: Film 5/)).toBeInTheDocument()
})
