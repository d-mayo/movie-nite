import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { addViewer, defaultState, nominate, recordOutcome, type AppState, type LetterboxdLink } from '../state/model.ts'
import type { LetterboxdClient } from '../letterboxd/client.ts'
import { createWatchlistMemory } from '../letterboxd/watchlist.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
import { createTmdbClient } from '../tmdb/client.ts'
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
  return addViewer(defaultState, 'Ann', 'a')
}

function mount(fetchFn: typeof fetch) {
  const store = createAppStore(createMemoryPersistence(initial()))
  render(
    <AppStoreContext.Provider value={store}>
      <NominationSearch
        viewerId="a"
        viewerName="Ann"
        client={createTmdbClient('https://w.test', fetchFn)}      />
    </AppStoreContext.Provider>,
  )
  return { store }
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
      url.includes('/search')
        ? searchBody('Alien', 'Aliens')
        : url.endsWith('/tmdb/movie/1')
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
  expect(screen.getByText('Alien')).toBeInTheDocument()
  expect(screen.getByText('(1999)')).toBeInTheDocument()
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
      url.includes('/search')
        ? searchBody('Alien', 'Aliens')
        : url.endsWith('/tmdb/movie/1')
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

test('a film that has already won tonight cannot be nominated', async () => {
  const fetchFn = vi.fn((url: string) =>
    Promise.resolve(url.includes('/search') ? searchBody('Alien') : movieBody(1, 'Alien')),
  )
  const start = addViewer(initial(), 'Bo', 'b')
  const won = recordOutcome(start, { ...movieNomination(1) }, 'watch', true)
  const store = createAppStore(createMemoryPersistence(won))
  render(
    <AppStoreContext.Provider value={store}>
      <NominationSearch
        viewerId="a"
        viewerName="Ann"
        client={createTmdbClient('https://w.test', fetchFn as unknown as typeof fetch)}      />
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

// Drawing from a Letterboxd watchlist.
function lbClient(overrides: Partial<LetterboxdClient> = {}): LetterboxdClient {
  return {
    checkProfile: vi.fn(),
    watchlistPage: vi.fn(async () => ({ slugs: ['a', 'b'], hasNext: false })),
    filmTmdbId: vi.fn(async (slug: string) => (slug === 'a' ? 11 : 22)),
    ...overrides,
  }
}

function mountDrawing(options: { status?: LetterboxdLink['status']; lb?: LetterboxdClient; fetchFn?: typeof fetch; noLink?: boolean; start?: AppState } = {}) {
  const lb = options.lb ?? lbClient()
  const fetchFn =
    options.fetchFn ??
    (vi.fn(async (url: string) => {
      const id = Number(/\/movie\/(\d+)/.exec(url)?.[1])
      return movieBody(id, `Film ${id}`)
    }) as unknown as typeof fetch)
  const store = createAppStore(createMemoryPersistence(options.start ?? initial()))
  const letterboxd: LetterboxdLink | undefined = options.noLink ? undefined : { username: 'ann', status: options.status ?? 'found' }
  const ui = (
    <AppStoreContext.Provider value={store}>
      <NominationSearch
        viewerId="a"
        viewerName="Ann"
        client={createTmdbClient('https://w.test', fetchFn)}
        letterboxd={letterboxd}
        watchlist={{ client: lb, memory: createWatchlistMemory(), random: () => 0 }}
      />
    </AppStoreContext.Provider>
  )
  const view = render(ui)
  return { store, lb, fetchFn, view }
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(0))
const slot = () => screen.getByRole('button', { name: 'Random from watchlist' })

test('a found viewer with no film gets the slot, which draws and nominates at once', async () => {
  const { store } = mountDrawing()
  fireEvent.click(slot())
  expect(screen.getByRole('button', { name: 'Drawing…' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Search a film for Ann'), { target: { value: 'x' } })
  expect(screen.getByLabelText('Search a film for Ann')).toHaveValue('x')
  await flush()
  expect(store.getState().night.nominations.a.title).toBe('Film 11')
})

test.each([['pending'], ['missing']] as const)('a %s profile has no slot', (status) => {
  mountDrawing({ status })
  expect(screen.queryByRole('button', { name: 'Random from watchlist' })).toBeNull()
  expect(screen.getByLabelText('Search a film for Ann')).toBeInTheDocument()
})

test('an unlinked viewer has no slot', () => {
  mountDrawing({ noLink: true })
  expect(screen.queryByRole('button', { name: 'Random from watchlist' })).toBeNull()
})

test('Re-roll replaces the film once the new one is ready, whatever the first film came from', async () => {
  const start = nominate(initial(), 'a', movieNomination(11))
  const { store } = mountDrawing({ start })
  expect(screen.getByText('Alien')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Re-roll' }))
  expect(screen.getByRole('button', { name: 'Drawing…' })).toBeDisabled()
  expect(screen.getByText('Alien')).toBeInTheDocument()
  await flush()
  expect(store.getState().night.nominations.a.tmdbId).toBe(22)
  expect(screen.getByText('Film 22')).toBeInTheDocument()
})

test('pressing the poster removes the film, which brings back the slot', async () => {
  mountDrawing({ start: nominate(initial(), 'a', movieNomination(11)) })
  fireEvent.click(screen.getByRole('button', { name: /^Remove .* from Ann$/ }))
  expect(slot()).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Re-roll' })).toBeNull()
})

test('a draw skips films already in play and says so when none is left', async () => {
  const start = recordOutcome(nominate(addViewer(initial(), 'Bo', 'b'), 'b', movieNomination(11)), movieNomination(22), 'watch', true)
  mountDrawing({ start })
  fireEvent.click(slot())
  await flush()
  expect(screen.getByRole('status')).toHaveTextContent("Every film on Ann's watchlist is already in play tonight.")
  expect(screen.getByLabelText('Search a film for Ann')).toBeInTheDocument()
})

test.each([
  ['empty', { watchlistPage: vi.fn(async () => ({ slugs: [], hasNext: false })) }, "Ann's watchlist is empty."],
  ['private', { watchlistPage: vi.fn(async () => 'private' as const) }, "Ann's watchlist is private."],
  ['missing', { watchlistPage: vi.fn(async () => 'missing' as const) }, 'Letterboxd has no watchlist for ann.'],
  ['unavailable', { watchlistPage: vi.fn(async () => 'unavailable' as const) }, "Letterboxd can't be reached right now."],
])('an %s watchlist shows its message and leaves the search working', async (_, overrides, message) => {
  mountDrawing({ lb: lbClient(overrides) })
  fireEvent.click(slot())
  await flush()
  expect(screen.getByRole('status')).toHaveTextContent(message)
  expect(slot()).toBeEnabled()
  fireEvent.change(screen.getByLabelText('Search a film for Ann'), { target: { value: 'x' } })
  expect(screen.getByLabelText('Search a film for Ann')).toHaveValue('x')
})

test('the next press after an unavailable walk walks again', async () => {
  const watchlistPage = vi.fn().mockResolvedValueOnce('unavailable').mockResolvedValue({ slugs: ['a'], hasNext: false })
  const { store } = mountDrawing({ lb: lbClient({ watchlistPage }) })
  fireEvent.click(slot())
  await flush()
  fireEvent.click(slot())
  await flush()
  expect(watchlistPage).toHaveBeenCalledTimes(2)
  expect(store.getState().night.nominations.a.tmdbId).toBe(11)
})

test('a drawn film that fails to load shows a message, and a failed Re-roll keeps the film', async () => {
  const failing = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
  const { store } = mountDrawing({ fetchFn: failing })
  fireEvent.click(slot())
  await flush()
  expect(screen.getByRole('status')).toHaveTextContent("The drawn film couldn't be loaded. Try again.")
  expect(store.getState().night.nominations.a).toBeUndefined()
})

test('a failed Re-roll leaves the current film', async () => {
  const start = nominate(initial(), 'a', movieNomination(11))
  const { store } = mountDrawing({ start, lb: lbClient({ watchlistPage: vi.fn(async () => 'unavailable' as const) }) })
  fireEvent.click(screen.getByRole('button', { name: 'Re-roll' }))
  await flush()
  expect(store.getState().night.nominations.a.tmdbId).toBe(11)
  expect(screen.getByRole('status')).toHaveTextContent("Letterboxd can't be reached right now.")
})

test('closing the panel while the film loads nominates nothing', async () => {
  let resolve!: (r: Response) => void
  const slow = vi.fn(() => new Promise<Response>((r) => (resolve = r))) as unknown as typeof fetch
  const { store, view } = mountDrawing({ fetchFn: slow })
  fireEvent.click(slot())
  await flush()
  view.unmount()
  resolve(movieBody(11, 'Film 11'))
  await flush()
  expect(store.getState().night.nominations.a).toBeUndefined()
})
