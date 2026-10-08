import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { addViewer, defaultState, recordOutcome, setToken } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
import { createTmdbClient } from '../tmdb/client.ts'
import { openCell } from '../test/cells.ts'
import NominationSearch from './NominationSearch.tsx'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

const searchBody = (...titles: string[]) =>
  json({
    results: titles.map((title, i) => ({
      id: i + 1,
      title,
      release_date: '1999-01-01',
      poster_path: i === 0 ? '/p.jpg' : null,
    })),
  })

const movieBody = (id: number, title: string) =>
  json({
    id,
    title,
    release_date: '1999-01-01',
    poster_path: '/p.jpg',
    overview: 'ov',
    runtime: 120,
    genres: [{ name: 'Drama' }],
  })

function initial() {
  return addViewer(setToken(defaultState, 'tok'), 'Ann', 'a')
}

function mount(fetchFn: typeof fetch, onAuthError = vi.fn()) {
  const store = createAppStore(createMemoryPersistence(initial()))
  render(
    <AppStoreContext.Provider value={store}>
      <NominationSearch
        viewerId="a"
        viewerName="Ann"
        client={createTmdbClient('tok', fetchFn)}
        onAuthError={onAuthError}
      />
    </AppStoreContext.Provider>,
  )
  return { store, onAuthError }
}

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Search a film for Ann'), {
    target: { value },
  })

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

test('searches only after the debounce and shows poster, placeholder, title and year', async () => {
  const fetchFn = vi.fn().mockResolvedValue(searchBody('Alien', 'Aliens'))
  mount(fetchFn)
  type('alien')
  await tick(299)
  expect(fetchFn).not.toHaveBeenCalled()
  await tick(1)
  expect(fetchFn).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('img', { name: 'Poster of Alien' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'No poster' })).toBeInTheDocument()
  expect(screen.getByText('Alien (1999)')).toBeInTheDocument()
})

test('only the newest query shows when an older response arrives late', async () => {
  let resolveOld!: (r: Response) => void
  const fetchFn = vi
    .fn()
    .mockImplementationOnce(() => new Promise<Response>((r) => (resolveOld = r)))
    .mockResolvedValueOnce(searchBody('New one'))
  mount(fetchFn)
  type('old')
  await tick(300)
  type('new')
  await tick(300)
  await act(async () => resolveOld(searchBody('Old one')))
  expect(screen.getByText('New one (1999)')).toBeInTheDocument()
  expect(screen.queryByText('Old one (1999)')).not.toBeInTheDocument()
})

test('picking stores the full nomination, and picking again replaces it', async () => {
  const fetchFn = vi.fn((url: string) =>
    Promise.resolve(
      url.includes('/search/')
        ? searchBody('Alien', 'Aliens')
        : url.endsWith('/movie/1')
          ? movieBody(1, 'Alien')
          : movieBody(2, 'Aliens'),
    ),
  )
  const { store } = mount(fetchFn as unknown as typeof fetch)
  type('alien')
  await tick(300)
  fireEvent.click(screen.getByRole('button', { name: 'Pick Alien (1999)' }))
  await tick(0)
  const nomination = store.getState().night.nominations.a
  expect(nomination).toMatchObject({ tmdbId: 1, runtime: 120, genres: ['Drama'] })
  expect(screen.getByText('Alien (1999)')).toBeInTheDocument()
  expect(screen.queryByLabelText('Search a film for Ann')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Remove Alien from Ann' }))
  expect(store.getState().night.nominations.a).toBeUndefined()
  type('aliens')
  await tick(300)
  fireEvent.click(screen.getByRole('button', { name: 'Pick Aliens (1999)' }))
  await tick(0)
  expect(store.getState().night.nominations.a.tmdbId).toBe(2)
})

test('a failing getMovie shows an error with Retry and nominates nothing', async () => {
  const fetchFn = vi.fn((url: string) =>
    Promise.resolve(
      url.includes('/search/')
        ? searchBody('Alien', 'Aliens')
        : url.endsWith('/movie/1')
          ? movieBody(1, 'Alien')
          : json({}, 500),
    ),
  )
  const { store } = mount(fetchFn as unknown as typeof fetch)
  type('aliens')
  await tick(300)
  fireEvent.click(screen.getByRole('button', { name: 'Pick Aliens (1999)' }))
  await tick(0)
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load Aliens')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  expect(store.getState().night.nominations.a).toBeUndefined()
})

test.each([
  ['search', (url: string) => url.includes('/search/')],
  ['getMovie', (url: string) => !url.includes('/search/')],
])('a 401 on %s brings the token prompt back through App', async (_n, is401) => {
  const fetchFn = vi.fn((url: string) =>
    Promise.resolve(
      is401(url)
        ? json({}, 401)
        : url.includes('/search/')
          ? searchBody('Alien')
          : json({}, 500),
    ),
  )
  const store = createAppStore(createMemoryPersistence(initial()))
  render(<App store={store} fetchFn={fetchFn as unknown as typeof fetch} />)
  openCell('Ann')
  type('alien')
  await tick(300)
  if (_n === 'getMovie') {
    fireEvent.click(screen.getByRole('button', { name: 'Pick Alien (1999)' }))
    await tick(0)
  }
  expect(screen.getByRole('alert')).toHaveTextContent(
    'TMDB rejected the saved token',
  )
  expect(store.getState().settings.tmdbToken).toBeNull()
  expect(screen.getByLabelText('TMDB Read Access Token')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
})

test('a film that has already won tonight cannot be nominated', async () => {
  const fetchFn = vi.fn((url: string) =>
    Promise.resolve(url.includes('/search/') ? searchBody('Alien') : movieBody(1, 'Alien')),
  )
  const start = addViewer(initial(), 'Bo', 'b')
  const won = recordOutcome(start, { ...movieNomination(1) }, 'watch', true)
  const store = createAppStore(createMemoryPersistence(won))
  render(
    <AppStoreContext.Provider value={store}>
      <NominationSearch
        viewerId="a"
        viewerName="Ann"
        client={createTmdbClient('tok', fetchFn as unknown as typeof fetch)}
        onAuthError={vi.fn()}
      />
    </AppStoreContext.Provider>,
  )
  type('alien')
  await tick(300)
  fireEvent.click(screen.getByRole('button', { name: 'Pick Alien (1999)' }))
  await tick(0)
  expect(screen.getByRole('alert')).toHaveTextContent('Alien has already won tonight')
  expect(store.getState().night.nominations.a).toBeUndefined()
})

function movieNomination(id: number) {
  return {
    tmdbId: id,
    title: 'Alien',
    year: 1999,
    posterPath: null,
    overview: '',
    runtime: 120,
    genres: [],
  }
}
