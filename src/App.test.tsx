import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from './App.tsx'
import {
  defaultState,
  type Nomination,
} from './state/model.ts'
import { createMemoryPersistence } from './state/persistence.ts'
import { createAppStore } from './state/store.ts'
import { openCell } from './test/cells.ts'
import { defaultWheelSettings } from './wheel/edit.ts'

function setup(fetchFn: typeof fetch) {
  const persistence = createMemoryPersistence({
    ...defaultState,
    settings: { viewersHidden: false, wheel: defaultWheelSettings },
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

test('a banner with the logo sits above the screen', () => {
  setup(ok())
  const banner = screen.getByRole('banner')
  const main = screen.getByRole('main')
  expect(
    banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(main).not.toContainElement(banner)
})

test('a fresh browser opens straight into the app with no token prompt or TMDB footer', () => {
  setup(ok())
  expect(screen.queryByText('Connect to TMDB', { exact: false })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('TMDB Read Access Token')).not.toBeInTheDocument()
  expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  expect(screen.getByText('Viewers are needed to spin.')).toBeInTheDocument()
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  expect(screen.queryByRole('button', { name: 'Change TMDB token' })).toBeNull()
})

test('the banner also shows on a night screen', () => {
  setup(ok())
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
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
      roster: [{ id: 'a', name: 'Ann', color: '#e6194b' }],
      night: { ...defaultState.night, presentIds: ['a'], nominations: { a: film } },
    }),
  )
  render(<App store={store} fetchFn={ok()} />)
}

test('the viewer list is a card with a quiet + and Remove danger', () => {
  nightWithViewer()
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'More for Ann' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove from roster' }))
  expect(screen.getByText("Tonight's viewers").closest('section')).toHaveClass('card')
  expect(screen.getByRole('button', { name: 'Add a viewer' })).toHaveClass('quiet')
  expect(screen.getByRole('button', { name: 'Remove' })).toHaveClass('danger')
})

test('the Wheel settings popover is a card', () => {
  nightWithViewer()
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Wheel settings' }))
  expect(screen.getByRole('dialog', { name: 'Wheel settings' })).toHaveClass('card')
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
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
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

test('the banner has no Wheel settings button; the gear menu lists it first, disabled once the night has ended', () => {
  const store = bannerNight()
  expect(banner().queryByRole('button', { name: 'Wheel settings' })).toBeNull()
  fireEvent.click(banner().getByRole('button', { name: 'Settings' }))
  const items = () =>
    within(document.getElementById('settings-menu')!)
      .getAllByRole('button')
      .map((b) => b.textContent)
  expect(items()).toEqual(['Wheel settings', 'Credits'])
  expect(screen.getByRole('button', { name: 'Wheel settings' })).toBeEnabled()
  act(() => store.getState().endNight())
  expect(screen.getByRole('button', { name: 'Wheel settings' })).toBeDisabled()
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
  expect(document.querySelector('.wheel-reason-slot .night-over')).toBeNull()
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
  act(() => store.getState().recordOutcome(film, 'watch', true))
  act(() => store.getState().endNight())
  const summary = screen.getByRole('region', { name: 'Night over' })
  expect(within(summary).queryByRole('button', { name: 'New night' })).toBeNull()
  expect(within(summary).getByText('Alien (1979)')).toBeInTheDocument()
  expect(within(summary).getByText(/Watch next session:/)).toBeInTheDocument()
  expect(within(summary).getByRole('link', { name: /Heat/ })).toBeInTheDocument()
})

test('the banner controls are disabled during a spin and its reveal, even if the night ends', async () => {
  const store = bannerNight()
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  expect(banner().getByRole('button', { name: 'End night' })).toBeDisabled()
  // The gear stays usable, for the Sound card.
  expect(banner().getByRole('button', { name: 'Settings' })).toBeEnabled()
  fireEvent.click(banner().getByRole('button', { name: 'Settings' }))
  expect(banner().getByRole('button', { name: 'Wheel settings' })).toBeEnabled()
  act(() => store.getState().endNight())
  expect(banner().getByRole('button', { name: 'New night' })).toBeDisabled()
  expect(banner().getByRole('button', { name: 'Wheel settings' })).toBeDisabled()
  const dialog = await screen.findByRole('dialog')
  expect(banner().getByRole('button', { name: 'New night' })).toBeDisabled()
  expect(banner().getByRole('button', { name: 'Settings' })).toBeEnabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
  expect(banner().getByRole('button', { name: 'New night' })).toBeEnabled()
})

test('each banner control has its name and an aria-hidden icon', () => {
  const store = bannerNight()
  for (const name of ['End night', 'Settings']) {
    const button = banner().getByRole('button', { name })
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull()
  }
  act(() => store.getState().endNight())
  const button = banner().getByRole('button', { name: 'New night' })
  expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull()
})

test('choosing a color in the picker repaints the wheel at once', () => {
  nightWithViewer()
  const fills = () =>
    Array.from(document.querySelectorAll('[data-testid="frame"]')).map((p) => p.getAttribute('fill'))
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
    fireEvent.click(screen.getByRole('button', { name: 'Increase Slices for Ann' }))
    expect(
      screen.getAllByTestId('wedge').filter((w) => w.getAttribute('data-kind') === 'nomination'),
    ).toHaveLength(n)
  }
  fireEvent.change(screen.getByLabelText('Weight for Ann'), { target: { value: '7.5' } })
  expect(screen.getByLabelText('Weight for Ann')).toHaveValue('7.5')
})

test('with every fetch failing the night carries on: the wheel spins and the reveal opens', async () => {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
      roster: [{ id: 'a', name: 'Ann', color: '#e6194b' }],
      night: { ...defaultState.night, presentIds: ['a'], nominations: { a: film } },
    }),
  )
  const failing = vi.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch
  render(<App store={store} fetchFn={failing} random={() => 0.01} spinMs={20} />)
  const spin = screen.getByRole('button', { name: 'Spin' })
  expect(spin).toBeEnabled()
  fireEvent.click(spin)
  expect(await screen.findByRole('dialog')).toBeInTheDocument()
  expect(screen.queryByLabelText('TMDB Read Access Token')).toBeNull()
})

test("linking a Letterboxd username shows the pending icon, then the retry wording, then the profile link", async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    const replies = [
      new Response(JSON.stringify({ error: 'Letterboxd could not be checked' }), { status: 502 }),
      new Response(JSON.stringify({ username: 'jo' }), { status: 200 }),
    ]
    const fetchFn = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/lb/jo') ? replies.shift()! : new Response('{}', { status: 200 }),
    ) as unknown as typeof fetch
    const { store } = setup(fetchFn)
    act(() => store.getState().addViewer('Ann'))
    openCell('Ann')
    fireEvent.change(screen.getByLabelText('Letterboxd username for Ann'), { target: { value: 'jo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(screen.getByRole('link', { name: "Checking Ann's Letterboxd profile…" })).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(
      screen.getByRole('link', { name: "Can't reach Letterboxd for Ann, trying again soon" }),
    ).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(screen.getByRole('link', { name: 'Ann on Letterboxd' })).toHaveAttribute(
      'href',
      'https://letterboxd.com/jo/',
    )
  } finally {
    vi.useRealTimers()
  }
})
