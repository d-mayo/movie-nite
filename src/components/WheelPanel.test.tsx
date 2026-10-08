import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { angleUnderPointer } from '../wheel/draw.ts'
import { defaultLayout, sliceArcs } from '../wheel/layout.ts'
import { header, markAway, markHere } from '../test/cells.ts'

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
    { id: 'a', name: 'Ann', color: '#e6194b' },
    { id: 'b', name: 'Bo', color: '#f58231' },
  ]
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok', viewersHidden: false },
      roster,
      night: {
        ...defaultState.night,
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

test('there is no Spin button with no viewers, and the empty-wheel text shows', () => {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok', viewersHidden: false },
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Spin' })).toBeNull()
  expect(screen.getByText('Tick or add viewers to put them on the wheel.')).toBeVisible()
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
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeDisabled()
  expect(screen.getByLabelText('Add a viewer')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Settings' })).toBeDisabled()
  expect(header('Ann')).toBeDisabled()

  const before = hrefs()
  act(() => store.getState().nominate('a', film(7, '/other.jpg')))
  expect(hrefs()).toEqual(before)

  await screen.findByRole('dialog')
  expect(spinButton()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeDisabled()

  const slices = defaultLayout(['a', 'b'], {})
  const arcs = sliceArcs(slices)
  // random() = 0.5 draws the slice holding half the total weight and rests at its middle.
  const total = slices.reduce((s, x) => s + x.weight, 0)
  let cumulative = 0
  const index = slices.findIndex((s) => (cumulative += s.weight) > total / 2)
  const transform = document.querySelector('svg.wheel > g')!.getAttribute('transform')!
  const rotation = Number(/rotate\(([^)]+)\)/.exec(transform)![1])
  const angle = angleUnderPointer(rotation)
  expect(angle).toBeGreaterThan(arcs[index].start)
  expect(angle).toBeLessThan(arcs[index].end)
  expect(rotation).toBeGreaterThanOrEqual(5 * 360)
})

test('Close makes the wheel live and unlocks setup', async () => {
  const store = setup(['a', 'b'], { random: () => 0.01, spinMs: 20 })
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  act(() => store.getState().nominate('a', film(7, '/other.jpg')))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeEnabled()
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

test('a 401 from the wildcard search unlocks setup once a new token is saved', async () => {
  const fetchFn = vi.fn((url: RequestInfo | URL) =>
    Promise.resolve(
      new Response('{}', {
        status: String(url).includes('/search/') ? 401 : 200,
      }),
    ),
  )
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok', viewersHidden: false },
      roster: [{ id: 'a', name: 'Ann', color: '#e6194b' }],
      night: {
        ...defaultState.night,
        presentIds: ['a'],
        nominations: { a: film(1) },
      },
    }),
  )
  // The first wildcard in the default layout, landed on by the draw.
  const slices = defaultLayout(['a'], {})
  const total = slices.reduce((sum, s) => sum + s.weight, 0)
  const at = slices.findIndex((s) => s.kind === 'wildcard')
  const before = slices.slice(0, at).reduce((sum, s) => sum + s.weight, 0)
  const random = () => (before + slices[at].weight / 2) / total
  render(<App store={store} fetchFn={fetchFn as typeof fetch} random={random} spinMs={20} />)
  fireEvent.click(spinButton())
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Search for a wildcard film'), {
    target: { value: 'ab' },
  })

  const prompt = await screen.findByLabelText('TMDB Read Access Token')
  fireEvent.change(prompt, { target: { value: 'new' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ann is here' })).toBeEnabled())
  expect(spinButton()).toBeEnabled()
})

test('the wheel drops viewers whose film has won, and follows ticks', () => {
  const store = setup(['a', 'b'])
  store.getState().addViewer('Cy')
  const cy = store.getState().roster[2].id
  act(() => store.getState().nominate(cy, film(2)))
  act(() => store.getState().nominate('a', film(1)))
  act(() => store.getState().nominate('b', film(1)))
  expect(screen.getAllByTestId('wedge')).toHaveLength(12)
  act(() => store.getState().recordOutcome(film(1), 'watch', true))
  // Cy's 3 slices and 1 wildcard remain.
  expect(screen.getAllByTestId('wedge')).toHaveLength(4)
  expect(spinButton()).toBeEnabled()

  markAway('Cy')
  expect(screen.queryAllByTestId('wedge')).toHaveLength(0)
  expect(store.getState().night.ended).toBe(false)
  expect(screen.getByText('Viewers are needed to spin.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Spin' })).toBeNull()
  markHere('Cy')

  expect(screen.getAllByTestId('wedge')).toHaveLength(4)
})

test('a done viewer does not block Spin, and an ended night disables it', () => {
  const store = setup(['a', 'b'])
  act(() => store.getState().nominate('a', film(1)))
  act(() => store.getState().nominate('b', film(2)))
  act(() => store.getState().recordOutcome(film(1), 'watch', true))
  expect(spinButton()).toBeEnabled()
  act(() => store.getState().endNight())
  expect(spinButton()).toBeDisabled()
  expect(screen.getByText('The night is over.')).toBeInTheDocument()
})

test('the spin draws by the edited weights', async () => {
  const store = setup(['a', 'b'], { random: () => 0.5, spinMs: 20 })
  act(() => store.getState().setViewerWeight('a', 20))
  act(() => store.getState().setViewerWeight('b', 0.5))
  fireEvent.click(spinButton())
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveTextContent('Film 1')
})

test('the waiting message lists names with and, and a final comma and and for three or more', () => {
  setup([])
  expect(screen.getByText('Waiting for Ann and Bo to nominate.')).toBeInTheDocument()
  cleanup()
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok', viewersHidden: false },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
        { id: 'c', name: 'Cy', color: '#4363d8' },
      ],
      night: { ...defaultState.night, presentIds: ['a', 'b', 'c'] },
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} />)
  expect(screen.getByText('Waiting for Ann, Bo, and Cy to nominate.')).toBeInTheDocument()
})
