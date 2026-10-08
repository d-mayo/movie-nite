import {
  act,
  cleanup,
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
import { openCell } from './test/cells.ts'

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
const clickChange = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Change TMDB token' }))
}

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

test('the banner picks the dark logo by color scheme', () => {
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
      roster: [{ id: 'a', name: 'Ann', color: '#e6194b' }],
      night: { ...defaultState.night, presentIds: ['a'], nominations: { a: film } },
    }),
  )
  render(<App store={store} fetchFn={ok()} />)
}

test('the token prompt is a card with Save primary and Cancel quiet', () => {
  nightWithViewer()
  clickChange()
  const form = screen.getByLabelText('TMDB Read Access Token').closest('form')!
  expect(form).toHaveClass('card')
  expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('primary')
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('quiet')
})

test('the viewer list is a card with Add primary and Remove danger', () => {
  nightWithViewer()
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'More for Ann' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove from roster' }))
  expect(screen.getByText("Tonight's viewers").closest('section')).toHaveClass('card')
  expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('primary')
  expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('danger')
})

test('the Wheel settings drawer is a card with Done primary, Remove danger and Move quiet', () => {
  nightWithViewer()
  fireEvent.click(screen.getByRole('button', { name: 'Wheel settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add wildcard' }))
  expect(screen.getByRole('dialog', { name: 'Wheel settings' })).toHaveClass('card')
  expect(screen.getByRole('button', { name: 'Done' })).toHaveClass('primary')
  expect(screen.getByRole('button', { name: 'Remove wildcard 1' })).toHaveClass('danger')
  expect(screen.getByRole('button', { name: 'Move slice 1 up' })).toHaveClass('quiet')
})

// The banner toolbar.
const banner = () => within(screen.getByRole('banner'))

function bannerNight(
  night: Partial<typeof defaultState.night> = {},
  holdover: Nomination | null = null,
) {
  const film2 = { ...film, tmdbId: 2, title: 'Blade Runner' }
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok' },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
      ],
      night: {
        ...defaultState.night,
        presentIds: ['a', 'b'],
        nominations: { a: film, b: film2 },
        ...night,
      },
      holdover,
    }),
  )
  render(<App store={store} fetchFn={ok()} random={() => 0.01} spinMs={20} />)
  return store
}

test('the banner shows Wheel settings before End night, disabled once the night has ended', () => {
  const store = bannerNight()
  const names = banner()
    .getAllByRole('button')
    .map((b) => b.textContent)
  expect(names.indexOf('◐Wheel settings')).toBeGreaterThanOrEqual(0)
  expect(names.indexOf('◐Wheel settings')).toBeLessThan(names.indexOf('☾End night'))
  expect(banner().getByRole('button', { name: 'Wheel settings' })).toBeEnabled()
  act(() => store.getState().endNight())
  expect(banner().getByRole('button', { name: 'Wheel settings' })).toBeDisabled()
})

test('the banner shows End night and Settings, then New night once the night has ended', () => {
  const store = bannerNight()
  expect(banner().getByRole('button', { name: 'End night' })).toBeEnabled()
  expect(banner().getByRole('button', { name: 'Settings' })).toBeEnabled()
  act(() => store.getState().endNight())
  expect(banner().getByRole('button', { name: 'New night' })).toBeEnabled()
  expect(banner().queryByRole('button', { name: 'End night' })).toBeNull()
})

test('the banner shows New night once the last viewer has won', async () => {
  bannerNight({ presentIds: ['a'], nominations: { a: film } })
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Watch' }))
  expect(banner().getByRole('button', { name: 'New night' })).toBeEnabled()
})

test('Change TMDB token is only reachable once Settings is opened', () => {
  bannerNight()
  expect(screen.queryByRole('button', { name: 'Change TMDB token' })).toBeNull()
  fireEvent.click(banner().getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Change TMDB token' }))
  expect(tokenField()).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
})

test('End night asks first; Cancel changes nothing and confirming shows the summary', () => {
  const store = bannerNight()
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
  fireEvent.click(banner().getByRole('button', { name: 'End night' }))
  expect(showModal).toHaveBeenCalled()
  let dialog = screen.getByRole('dialog', { name: 'End the night?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(store.getState().night.ended).toBe(false)
  expect(screen.queryByRole('dialog')).toBeNull()

  fireEvent.click(banner().getByRole('button', { name: 'End night' }))
  dialog = screen.getByRole('dialog', { name: 'End the night?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'End night' }))
  expect(store.getState().night.ended).toBe(true)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('region', { name: 'Night over' })).toBeInTheDocument()
  showModal.mockRestore()
})

test('Escape closes the confirmation and it can be opened again', () => {
  const store = bannerNight()
  fireEvent.click(banner().getByRole('button', { name: 'End night' }))
  const dialog = screen.getByRole('dialog', { name: 'End the night?' }) as HTMLDialogElement
  act(() => dialog.close())
  expect(store.getState().night.ended).toBe(false)
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(banner().getByRole('button', { name: 'End night' }))
  expect(screen.getByRole('dialog', { name: 'End the night?' })).toBeInTheDocument()
})

test('New night starts at once and keeps nominations whose film did not win', () => {
  const store = bannerNight()
  act(() => store.getState().recordOutcome(film, 'watch', true))
  act(() => store.getState().endNight())
  fireEvent.click(banner().getByRole('button', { name: 'New night' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('region', { name: 'Night over' })).toBeNull()
  expect(store.getState().night.ended).toBe(false)
  expect(store.getState().night.wonFilms).toEqual([])
  expect(Object.keys(store.getState().night.nominations)).toEqual(['b'])
  expect(banner().getByRole('button', { name: 'End night' })).toBeInTheDocument()
})

test('the moved buttons are gone from the setup, the spin panel and Night over', () => {
  const store = bannerNight({}, { ...film, tmdbId: 5, title: 'Heat' })
  const main = within(screen.getByRole('main'))
  expect(main.queryByRole('button', { name: 'New night' })).toBeNull()
  expect(main.queryByRole('button', { name: 'End night' })).toBeNull()
  expect(main.queryByRole('button', { name: 'Change TMDB token' })).toBeNull()
  act(() => store.getState().recordOutcome(film, 'watch', true))
  act(() => store.getState().endNight())
  const summary = screen.getByRole('region', { name: 'Night over' })
  expect(within(summary).queryByRole('button', { name: 'New night' })).toBeNull()
  expect(within(summary).getByText('Alien (1979)')).toBeInTheDocument()
  expect(within(summary).getByText(/Watch next session: Heat/)).toBeInTheDocument()
})

test('the banner controls are disabled during a spin and its reveal, even if the night ends', async () => {
  const store = bannerNight()
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  expect(banner().getByRole('button', { name: 'End night' })).toBeDisabled()
  expect(banner().getByRole('button', { name: 'Settings' })).toBeDisabled()
  expect(banner().getByRole('button', { name: 'Wheel settings' })).toBeDisabled()
  act(() => store.getState().endNight())
  expect(banner().getByRole('button', { name: 'New night' })).toBeDisabled()
  const dialog = await screen.findByRole('dialog')
  expect(banner().getByRole('button', { name: 'New night' })).toBeDisabled()
  expect(banner().getByRole('button', { name: 'Settings' })).toBeDisabled()
  expect(banner().getByRole('button', { name: 'Wheel settings' })).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(banner().getByRole('button', { name: 'New night' })).toBeEnabled()
  expect(banner().getByRole('button', { name: 'Settings' })).toBeEnabled()
  expect(banner().getByRole('button', { name: 'Wheel settings' })).toBeDisabled() // the night has ended
})

test('each banner control has its name and an aria-hidden icon', () => {
  const store = bannerNight()
  for (const name of ['Wheel settings', 'End night', 'Settings']) {
    const button = banner().getByRole('button', { name })
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull()
  }
  act(() => store.getState().endNight())
  const button = banner().getByRole('button', { name: 'New night' })
  expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull()
})

test('the token prompt banner has the logo only', () => {
  const noControls = () => {
    expect(banner().getByRole('img', { name: 'Movie Nite' })).toBeInTheDocument()
    for (const name of ['Wheel settings', 'End night', 'New night', 'Settings'])
      expect(banner().queryByRole('button', { name })).toBeNull()
  }
  setup(ok())
  noControls()
  cleanup()
  setup(ok(), 'tok')
  clickChange()
  noControls()
})

test('choosing a color in the picker repaints the wheel at once', () => {
  nightWithViewer()
  const fills = () =>
    Array.from(document.querySelectorAll('[data-kind="nomination"] > path:not([clip-path])'))
      .map((p) => p.getAttribute('fill'))
  expect(fills()).toContain('#e6194b')
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: "Ann's color" }))
  fireEvent.click(screen.getByRole('button', { name: 'Blue' }))
  expect(fills()).toContain('#4363d8')
  expect(fills()).not.toContain('#e6194b')
})

test('each Slices change in a cell redraws the wheel at once, and a weight is kept', () => {
  nightWithViewer()
  openCell('Ann')
  for (const n of [4, 5, 6]) {
    fireEvent.change(screen.getByLabelText('Slices for Ann'), { target: { value: String(n) } })
    expect(
      screen.getAllByTestId('wedge').filter((w) => w.getAttribute('data-kind') === 'nomination'),
    ).toHaveLength(n)
  }
  fireEvent.change(screen.getByLabelText('Weight for Ann'), { target: { value: '7.5' } })
  expect(screen.getByLabelText('Weight for Ann')).toHaveValue('7.5')
})
