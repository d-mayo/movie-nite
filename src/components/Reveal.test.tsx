import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'

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
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 5, 20, 0))
})
afterEach(() => vi.useRealTimers())

function setup(random: number, a: Nomination, b: Nomination) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok', viewersHidden: false, wheel: defaultWheelSettings },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
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
test('a nomination shows everything and shows its details', async () => {
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
})

test('no poster gets a placeholder and no runtime says the end is unknown', async () => {
  setup(0.01, film(1, { posterPath: null, runtime: null }), film(2))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByRole('img', { name: 'No poster' })).toBeInTheDocument()
  expect(within(dialog).getByText(/End time unknown/)).toBeInTheDocument()
})

test('a wildcard says so, and Back to the wheel returns to the wheel', async () => {
  setup(0.45, film(1), film(2))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('Wildcard!')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Back to the wheel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Spin' })).toBeEnabled()
  expect(screen.getAllByTestId('wedge')).toHaveLength(8)
})

const position = (a: Node, b: Node) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING

test('a nomination is a film frame: details in order, the dot in the viewer color', async () => {
  setup(0.01, film(1), film(2))
  const dialog = await screen.findByRole('dialog')
  const poster = within(dialog).getByRole('img', { name: 'Poster of Film 1' })
  const order = [
    poster,
    within(dialog).getByText('Now showing'),
    within(dialog).getByRole('heading', { name: 'Film 1' }),
    within(dialog).getByText('1999'),
    within(dialog).getByText('Nominated by Ann'),
    within(dialog).getByText('1h 52m'),
    within(dialog).getByText('Ends around 9:52 PM–10:07 PM'),
    within(dialog).getByText('A short synopsis.'),
    within(dialog).getByRole('button', { name: 'Watch' }),
  ]
  for (let i = 1; i < order.length; i++) expect(position(order[i - 1], order[i])).toBeTruthy()
  expect(dialog).toHaveAccessibleName('Film 1')
  const dot = dialog.querySelector<HTMLElement>('.reveal-dot')!
  expect(dot.style.getPropertyValue('--dot')).toBe('#e6194b')
})

test('Watch comes before Save for Next Week', async () => {
  setup(0.01, film(1), film(2))
  const dialog = await screen.findByRole('dialog')
  const save = within(dialog).getByRole('button', { name: 'Save for Next Week' })
  expect(position(within(dialog).getByRole('button', { name: 'Watch' }), save)).toBeTruthy()
})

const pickFetch = vi.fn((url: string) => {
  const search = String(url).includes('/search/')
  const body = search
    ? { results: [{ id: 9, title: 'Pick Me', release_date: '2001-01-01', poster_path: null }] }
    : { id: 9, title: 'Pick Me', release_date: '2001-01-01', poster_path: null, overview: 'o', runtime: 120, genres: [] }
  return Promise.resolve(new Response(JSON.stringify(body)))
}) as unknown as typeof fetch

test('a wildcard uses the same frame, with a steel dot before and after the pick', async () => {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok', viewersHidden: false, wheel: defaultWheelSettings },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
      ],
      night: { ...defaultState.night, presentIds: ['a', 'b'], nominations: { a: film(1), b: film(2) } },
    }),
  )
  render(<App store={store} fetchFn={pickFetch} random={() => 0.45} spinMs={20} />)
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  const dialog = await screen.findByRole('dialog')
  const dotOf = () => dialog.querySelector<HTMLElement>('.reveal-dot')!.style.getPropertyValue('--dot')
  expect(within(dialog).getByText('Wildcard', { selector: '.reveal-eyebrow' })).toBeInTheDocument()
  expect(within(dialog).getByRole('heading', { name: 'Wildcard!' })).toBeInTheDocument()
  expect(within(dialog).queryByText('Now showing')).toBeNull()
  expect(within(dialog).getByLabelText('Search for a wildcard film')).toBeInTheDocument()
  expect(dotOf()).toBe('var(--film-steel-light)')
  fireEvent.change(within(dialog).getByLabelText('Search for a wildcard film'), { target: { value: 'pick' } })
  fireEvent.click(await screen.findByRole('button', { name: 'Pick Pick Me (2001)' }))
  await within(dialog).findByText('Wildcard pick')
  expect(within(dialog).getByText('Now showing')).toBeInTheDocument()
  expect(dotOf()).toBe('var(--film-steel-light)')
})

test('the frame slides in unless motion is reduced', async () => {
  setup(0.01, film(1), film(2))
  expect(await screen.findByRole('dialog')).toHaveClass('reveal-thread')
})

test('with reduced motion the frame appears in place', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  try {
    setup(0.01, film(1), film(2))
    expect(await screen.findByRole('dialog')).not.toHaveClass('reveal-thread')
  } finally {
    vi.unstubAllGlobals()
  }
})
