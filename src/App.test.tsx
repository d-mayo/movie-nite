import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from './App.tsx'
import {
  addViewer,
  defaultState,
  editLayout,
  nominate,
  setPresent,
  setToken,
  type Nomination,
} from './state/model.ts'
import { createMemoryPersistence } from './state/persistence.ts'
import { createAppStore } from './state/store.ts'

const attribution =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.'

function expectNoFooter() {
  expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
}

function expectFooter() {
  const footer = screen.getByRole('contentinfo')
  expect(within(footer).getByText(attribution)).toBeInTheDocument()
  expect(within(footer).getByRole('img', { name: 'TMDB' })).toBeInTheDocument()
}

function setup(fetchFn: typeof fetch, token: string | null = null) {
  const persistence = createMemoryPersistence({
    ...defaultState,
    settings: { tmdbToken: token },
  })
  const store = createAppStore(persistence)
  render(<App store={store} fetchFn={fetchFn} />)
  return { store, persistence }
}

const film: Nomination = {
  tmdbId: 1,
  title: 'Alien',
  year: 1979,
  posterPath: null,
  overview: '',
  runtime: 117,
  genres: [],
}

const ok = () => vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

test('with no token only the prompt and the footer show', () => {
  setup(ok())
  expect(screen.getByLabelText('TMDB Read Access Token')).toBeInTheDocument()
  expect(screen.queryByText("Tonight's viewers")).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  expectFooter()
})

test('a passing check saves the token and shows setup', async () => {
  const fetchFn = ok()
  const { store } = setup(fetchFn)
  fireEvent.change(screen.getByLabelText('TMDB Read Access Token'), {
    target: { value: ' tok ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(store.getState().settings.tmdbToken).toBe('tok'))
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  expect(fetchFn).toHaveBeenCalledTimes(1)
  expectNoFooter()
})

test.each([
  ['a 401 response', () => vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))],
  ['a network error', () => vi.fn().mockRejectedValue(new TypeError('offline'))],
])('%s shows an error and saves nothing', async (_name, makeFetch) => {
  const { store } = setup(makeFetch())
  fireEvent.change(screen.getByLabelText('TMDB Read Access Token'), {
    target: { value: 'bad' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(store.getState().settings.tmdbToken).toBeNull()
  expect(screen.getByLabelText('TMDB Read Access Token')).toBeInTheDocument()
  expectFooter()
})

const tokenField = () => screen.getByLabelText('TMDB Read Access Token')
const clickChange = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Change TMDB token' }))

test('Change TMDB token opens the prompt with Cancel and keeps the old token', () => {
  const { store, persistence } = setup(ok(), 'tok')
  clickChange()
  expect(tokenField()).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  expectFooter()
  expect(screen.queryByText("Tonight's viewers")).not.toBeInTheDocument()
  expect(store.getState().settings.tmdbToken).toBe('tok')
  expect(persistence.load()?.settings.tmdbToken).toBe('tok')
})

test('Cancel returns to the night with its saved state untouched', () => {
  const fetchFn = ok()
  const persistence = createMemoryPersistence(
    setToken(
      nominate(
        setPresent(
          addViewer(addViewer(defaultState, 'Ann', 'a'), 'Bob', 'b'),
          'a',
          true,
        ),
        'a',
        film,
      ),
      'tok',
    ),
  )
  const store = createAppStore(persistence)
  store.setState(editLayout(store.getState(), (l) => ({ ...l, wildcardWeight: 3 })))
  const before = store.getState()
  render(<App store={store} fetchFn={fetchFn} />)
  clickChange()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  const after = store.getState()
  expect(after.roster).toEqual(before.roster)
  expect(after.night.presentIds).toEqual(before.night.presentIds)
  expect(after.night.nominations).toEqual(before.night.nominations)
  expect(after.night.layout).toEqual(before.night.layout)
  expect(after.settings.tmdbToken).toBe('tok')
  expect(fetchFn).not.toHaveBeenCalled()
})

test('a new token that passes replaces the old one and returns to the night', async () => {
  const fetchFn = ok()
  const { store } = setup(fetchFn, 'old')
  clickChange()
  fireEvent.change(tokenField(), { target: { value: 'new' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(store.getState().settings.tmdbToken).toBe('new'))
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  const init = fetchFn.mock.calls[0][1] as RequestInit
  expect(init.headers).toMatchObject({ Authorization: 'Bearer new' })
})

test.each([
  ['a 401 response', () => vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))],
  ['a network error', () => vi.fn().mockRejectedValue(new TypeError('offline'))],
])('%s while changing keeps the prompt, Cancel and the old token', async (_name, makeFetch) => {
  const { store } = setup(makeFetch(), 'old')
  clickChange()
  fireEvent.change(tokenField(), { target: { value: 'bad' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  expect(store.getState().settings.tmdbToken).toBe('old')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

type Settle = 'ok' | 'rejected' | 'offline'

// A fetch whose response the test settles by hand.
function heldFetch() {
  let settle: (how: Settle) => void = () => {}
  const fetchFn = vi.fn(
    () =>
      new Promise<Response>((resolve, reject) => {
        settle = (how) => {
          if (how === 'offline') reject(new TypeError('offline'))
          else resolve(new Response('{}', { status: how === 'ok' ? 200 : 401 }))
        }
      }),
  )
  return { fetchFn: fetchFn as unknown as typeof fetch, settle: (h: Settle) => settle(h) }
}

async function saveThenCancel(held: ReturnType<typeof heldFetch>) {
  const view = setup(held.fetchFn, 'old')
  clickChange()
  fireEvent.change(tokenField(), { target: { value: 'new' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  expect(cancel).toBeEnabled()
  fireEvent.click(cancel)
  return view
}

const flush = () => act(async () => {})

test.each<Settle>(['ok', 'rejected', 'offline'])(
  'cancelling a check that then settles (%s) leaves the night and the old token',
  async (how) => {
    const held = heldFetch()
    const { store, persistence } = await saveThenCancel(held)
    expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
    held.settle(how)
    await flush()
    expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(store.getState().settings.tmdbToken).toBe('old')
    expect(persistence.load()?.settings.tmdbToken).toBe('old')
  },
)

test.each<Settle>(['ok', 'rejected'])(
  'a cancelled check (%s) has no effect on a reopened prompt',
  async (how) => {
    const held = heldFetch()
    const { store, persistence } = await saveThenCancel(held)
    clickChange()
    held.settle(how)
    await flush()
    expect(tokenField()).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(store.getState().settings.tmdbToken).toBe('old')
    expect(persistence.load()?.settings.tmdbToken).toBe('old')
  },
)

test('a banner with the logo sits above the screen', () => {
  setup(ok())
  const banner = screen.getByRole('banner')
  const main = screen.getByRole('main')
  expect(
    banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(main).not.toContainElement(banner)
})

test('the TMDB footer does not show on the night screen', () => {
  setup(ok(), 'tok')
  expectNoFooter()
})

test('the banner also shows on a night screen', () => {
  setup(ok(), 'tok')
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  expect(screen.getByRole('banner')).toBeInTheDocument()
})

test('the one h1 is the logo named Movie Nite', () => {
  setup(ok())
  const headings = screen.getAllByRole('heading', { level: 1 })
  expect(headings).toHaveLength(1)
  expect(headings[0]).toHaveAccessibleName('Movie Nite')
  expect(
    within(headings[0]).getByRole('img', { name: 'Movie Nite' }),
  ).toBeInTheDocument()
})

test('the banner picks the dark logo by colour scheme', () => {
  setup(ok())
  const picture = screen.getByRole('banner').querySelector('picture')!
  const source = picture.querySelector('source')!
  expect(source.getAttribute('media')).toBe('(prefers-color-scheme: dark)')
  expect(source.getAttribute('srcset')).toContain('logo-dark-transparent')
  expect(picture.querySelector('img')!.getAttribute('src')).toContain(
    'logo-light-transparent',
  )
})

function nightWithViewer() {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok' },
      roster: [{ id: 'a', name: 'Ann' }],
      night: { ...defaultState.night, presentIds: ['a'], nominations: { a: film } },
    }),
  )
  render(<App store={store} fetchFn={ok()} />)
}

test('the token prompt is a card with Save primary and Cancel quiet', () => {
  nightWithViewer()
  fireEvent.click(screen.getByRole('button', { name: 'Change TMDB token' }))
  const form = screen.getByLabelText('TMDB Read Access Token').closest('form')!
  expect(form).toHaveClass('card')
  expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('primary')
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('quiet')
})

test('the viewer list is a card with Add primary and Remove danger', () => {
  nightWithViewer()
  expect(screen.getByText("Tonight's viewers").closest('section')).toHaveClass('card')
  expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('primary')
  expect(screen.getByRole('button', { name: 'Remove Ann' })).toHaveClass('danger')
})

test('the wheel editor is a card with Done primary, Remove danger and Move quiet', () => {
  nightWithViewer()
  fireEvent.click(screen.getByRole('button', { name: 'Edit wheel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add wildcard' }))
  expect(screen.getByText('Edit wheel', { selector: 'h2' }).closest('section')).toHaveClass('card')
  expect(screen.getByRole('button', { name: 'Done' })).toHaveClass('primary')
  expect(screen.getByRole('button', { name: 'Remove wildcard 1' })).toHaveClass('danger')
  expect(screen.getByRole('button', { name: 'Move slice 1 up' })).toHaveClass('quiet')
})
