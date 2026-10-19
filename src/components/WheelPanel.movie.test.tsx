import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, viewersOnWheel, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import type { SoundEngine } from '../sound/engine.ts'
import { defaultWheelSettings, deriveSlices } from '../wheel/edit.ts'
import { cards } from '../wildcards/cards.ts'
import { dealCards } from '../wildcards/deal.ts'

// The deal is the real one unless a test forces a card with `forceCard`.
vi.mock('../wildcards/deal.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../wildcards/deal.ts')>()
  return { ...actual, dealCards: vi.fn(actual.dealCards) }
})

afterEach(async () => {
  const actual = await vi.importActual<typeof import('../wildcards/deal.ts')>('../wildcards/deal.ts')
  vi.mocked(dealCards).mockImplementation(actual.dealCards)
  cleanup()
})

const film = (id: number): Nomination => ({
  tmdbId: id,
  title: `Film ${id}`,
  year: 2000,
  posterPath: null,
  overview: 'A film.',
  runtime: 112,
  genres: [],
})

const spinButton = () => screen.getByRole('button', { name: 'Spin' })
const wedgeKinds = () => screen.queryAllByTestId('wedge').map((w) => w.getAttribute('data-kind'))

const roster = [
  { id: 'a', name: 'Ann', color: '#e6194b' },
  { id: 'b', name: 'Bo', color: '#f58231' },
  { id: 'c', name: 'Cy', color: '#3cb44b' },
]

// A `random` that always lands on a wildcard of the main wheel.
function wildcardRandom(ids: string[]): () => number {
  const slices = deriveSlices(ids, defaultWheelSettings, {})
  const total = slices.reduce((sum, s) => sum + s.weight, 0)
  let before = 0
  for (const s of slices) {
    if (s.kind === 'wildcard') return () => (before + s.weight / 2) / total
    before += s.weight
  }
  throw new Error('no wildcard')
}

function recordingSound() {
  const log = { closed: 0, ticks: 0, rolls: [] as number[], breaks: 0 }
  const engine: SoundEngine = {
    attach: () => () => {},
    apply: () => {},
    spinStart: () => {},
    musicStart: () => {},
    musicResume: () => {},
    beep: () => {},
    spinSpeed: () => {},
    pinTick: () => void log.ticks++,
    spinEnd: () => {},
    closeCall: () => {},
    closeCallBreak: () => {},
    drumroll: (seconds) => void log.rolls.push(seconds),
    drumrollBreak: () => void log.breaks++,
    landed: () => {},
    revealClosed: () => void log.closed++,
  }
  return { engine, log }
}

function setup(options: { present?: string[]; nominations?: Record<string, Nomination>; fetchFn: typeof fetch }) {
  const present = options.present ?? ['a', 'b', 'c']
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
      roster,
      night: {
        ...defaultState.night,
        presentIds: present,
        nominations: options.nominations ?? { a: film(1), b: film(2), c: film(3) },
      },
      holdover: null,
    }),
  )
  const sound = recordingSound()
  render(
    <App
      store={store}
      fetchFn={options.fetchFn}
      random={wildcardRandom(present)}
      spinMs={20}
      sound={sound.engine}
    />,
  )
  return { store, sound }
}

function forceCard(id: string) {
  vi.mocked(dealCards).mockImplementation((context) =>
    Array.from({ length: 8 }, () => ({ ...cards.find((c) => c.id === id)!.roll(context, () => 0), weight: 1 })),
  )
}

async function openCard() {
  fireEvent.click(spinButton())
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')))
  fireEvent.click(spinButton())
  return screen.findByRole('dialog')
}

// A Worker that answers TMDB's discover with the given film ids (or a status) and each film's details.
function tmdbFetch(options: { ids?: number[]; status?: number; hold?: boolean; noDetails?: boolean } = {}) {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/tmdb/discover')) {
      if (options.hold) await held
      if (options.status) return json({}, options.status)
      return json({
        page: 1,
        total_pages: 1,
        results: (options.ids ?? []).map((id) => ({
          id,
          title: `Found ${id}`,
          release_date: '1999-01-01',
          poster_path: '/p.jpg',
        })),
      })
    }
    if (url.includes('/tmdb/movie/')) {
      if (options.noDetails) return json({}, 500)
      const id = Number(url.split('/').pop())
      return json({
        id,
        title: `Found ${id}`,
        release_date: '1999-01-01',
        poster_path: '/p.jpg',
        overview: 'Synopsis.',
        runtime: 95,
        genres: [],
      })
    }
    return json({}, 404)
  }) as unknown as typeof fetch
  return { fetchFn, release }
}

const backButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Back to the main wheel' })

// Plays three cans to a film: picks the first can and takes the sealed one.
async function takeSealed(dialog: HTMLElement) {
  const cans = await within(dialog).findAllByRole('button', { name: /^Pick can/ })
  fireEvent.click(cans[0])
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Take the sealed can' }))
  return screen.findByRole('heading', { name: /^Found/ })
}

test('a movie card finds films while Back is held, shows three cans, and the taken film opens the reveal', async () => {
  forceCard('genre-night')
  const { fetchFn, release } = tmdbFetch({ ids: [11, 12, 13], hold: true })
  const { store } = setup({ fetchFn })
  const dialog = await openCard()
  expect(within(dialog).getByRole('heading')).toHaveTextContent('Genre Night: Action')
  expect(within(dialog).getByText('Finding films…')).toBeInTheDocument()
  expect(backButton(dialog)).toBeDisabled()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  release()
  const picks = await within(dialog).findAllByRole('button', { name: /^Pick can/ })
  expect(picks).toHaveLength(3)
  expect(backButton(dialog)).toBeDisabled()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(store.getState().night.cardEffects).toEqual([])
  fireEvent.click(picks[1])
  // The picked can opens, the arrow ticks between the other two, and exactly one of them opens too.
  await waitFor(() => expect(within(dialog).getAllByRole('button', { name: /^Take Found/ })).toHaveLength(2))
  expect(within(dialog).getAllByRole('tooltip')).toHaveLength(2)
  expect(backButton(dialog)).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Take the sealed can' }))
  const reveal = await screen.findByRole('heading', { name: /^Found/ })
  const frame = reveal.closest('[role="dialog"]') as HTMLElement
  expect(within(frame).getByText('Genre Night: Action')).toBeInTheDocument()
  expect(within(frame).getByText('Now showing')).toBeInTheDocument()
  expect(store.getState().night.cardEffects).toEqual([
    { cardId: 'genre-night', label: 'Action night', change: { kind: 'movie' } },
  ])
})

test('Watch records the film as a wildcard pick does and returns to the unlocked main wheel', async () => {
  forceCard('genre-night')
  const { fetchFn } = tmdbFetch({ ids: [11, 12, 13] })
  const { store, sound } = setup({ fetchFn })
  const dialog = await openCard()
  const reveal = await takeSealed(dialog)
  const title = reveal.textContent!
  const frame = reveal.closest('[role="dialog"]') as HTMLElement
  const before = store.getState().night
  fireEvent.click(within(frame).getByRole('button', { name: 'Watch' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  const { night } = store.getState()
  expect(night.watched.map((f) => f.title)).toEqual([title])
  expect(night.wonFilms).toEqual([])
  expect(night.nominations).toEqual(before.nominations)
  expect(sound.log.closed).toBe(1)
  await waitFor(() => expect(spinButton()).toBeEnabled())
  expect(wedgeKinds().filter((k) => k === 'wildcard')).toHaveLength(
    deriveSlices(['a', 'b', 'c'], defaultWheelSettings, {}).filter((s) => s.kind === 'wildcard').length,
  )
})

test('Save for Next Week holds the film and records no win, and × records nothing', async () => {
  forceCard('genre-night')
  const { fetchFn } = tmdbFetch({ ids: [11, 12, 13, 14, 15, 16] })
  const { store } = setup({ fetchFn })
  let dialog = await openCard()
  let frame = (await takeSealed(dialog)).closest('[role="dialog"]') as HTMLElement
  fireEvent.click(within(frame).getByRole('button', { name: 'Save for Next Week' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  expect(store.getState().holdover?.title).toMatch(/^Found/)
  expect(store.getState().night.wonFilms).toEqual([])
  expect(store.getState().night.watched).toEqual([])

  // A second card: closing its reveal records no outcome.
  dialog = await openCard()
  frame = (await takeSealed(dialog)).closest('[role="dialog"]') as HTMLElement
  fireEvent.click(within(frame).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  expect(store.getState().night.watched).toEqual([])
  expect(store.getState().night.cardEffects).toHaveLength(2)
  await waitFor(() => expect(spinButton()).toBeEnabled())
})

test('two films give two cans, and the pick is the film', async () => {
  forceCard('genre-night')
  const { fetchFn } = tmdbFetch({ ids: [11, 12] })
  const { store } = setup({ fetchFn })
  const dialog = await openCard()
  const picks = await within(dialog).findAllByRole('button', { name: /^Pick can/ })
  expect(picks).toHaveLength(2)
  fireEvent.click(picks[0])
  await screen.findByRole('heading', { name: /^Found/ })
  expect(store.getState().night.cardEffects).toHaveLength(1)
})

test('one film shows no cans, only a focused Show the film button that Escape leaves alone', async () => {
  forceCard('genre-night')
  const { fetchFn } = tmdbFetch({ ids: [11] })
  const { store } = setup({ fetchFn })
  const dialog = await openCard()
  const show = await within(dialog).findByRole('button', { name: 'Show the film' })
  expect(within(dialog).queryByRole('button', { name: /^Pick can/ })).toBeNull()
  expect(show).toHaveFocus()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(store.getState().night.cardEffects).toEqual([])
  fireEvent.click(show)
  expect(await screen.findByRole('heading', { name: 'Found 11' })).toBeInTheDocument()
})

test.each([
  ['a failed discover', { status: 500 }, 'Film search is unavailable right now.'],
  ['an empty discover', { ids: [] }, 'No films turned up for this card.'],
  ['every details call failing', { ids: [11, 12], noDetails: true }, 'Film search is unavailable right now.'],
])('%s shows a message, Back returns to the main wheel, and nothing lands', async (_name, responses, message) => {
  forceCard('genre-night')
  const { fetchFn } = tmdbFetch(responses)
  const { store } = setup({ fetchFn })
  const dialog = await openCard()
  expect(await within(dialog).findByText(message)).toBeInTheDocument()
  expect(backButton(dialog)).toBeEnabled()
  fireEvent.click(backButton(dialog))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  expect(store.getState().night.cardEffects).toEqual([])
  expect(store.getState().night.watched).toEqual([])
})

test('the Night over summary lists the movie card among the cards, once its film was taken', async () => {
  forceCard('genre-night')
  const { fetchFn } = tmdbFetch({ ids: [11, 12, 13] })
  const { store } = setup({ fetchFn })
  const dialog = await openCard()
  const frame = (await takeSealed(dialog)).closest('[role="dialog"]') as HTMLElement
  fireEvent.click(within(frame).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(spinButton()).toBeEnabled())
  expect(screen.queryByRole('list', { name: "Tonight's cards" })).toBeNull()
  act(() => store.getState().endNight())
  const items = within(await screen.findByRole('list', { name: 'Cards tonight' })).getAllByRole('listitem')
  expect(items.map((li) => li.textContent)).toEqual(['Action night'])
})

test('Shortest on the Board names the film and its runtime, takes it on a press, and the film wins as a main-wheel win', async () => {
  forceCard('shortest-on-the-board')
  const { store } = setup({ fetchFn: tmdbFetch().fetchFn })
  const dialog = await openCard()
  expect(within(dialog).getByRole('heading')).toHaveTextContent('Shortest on the Board')
  expect(within(dialog).getByText("Film 1 (1h 52m), Ann's film, is the shortest on the board and wins.")).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: /^Pick can/ })).toBeNull()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Show the film' }))
  const reveal = await screen.findByRole('heading', { name: 'Film 1' })
  const frame = reveal.closest('[role="dialog"]') as HTMLElement
  expect(within(frame).getByText('Nominated by Ann · Shortest on the Board')).toBeInTheDocument()
  expect(frame.querySelector<HTMLElement>('.reveal-dot')?.style.getPropertyValue('--dot')).toBe('#e6194b')
  expect(store.getState().night.cardEffects).toEqual([
    { cardId: 'shortest-on-the-board', label: 'Shortest on the board', change: { kind: 'movie' } },
  ])
  fireEvent.click(within(frame).getByRole('button', { name: 'Watch' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  const { night } = store.getState()
  expect(night.wonFilms).toEqual([1])
  expect(viewersOnWheel(night)).toEqual(['b', 'c'])
  expect(night.ended).toBe(false)
  // One per viewer: the wheel has one wildcard fewer.
  expect(wedgeKinds().filter((k) => k === 'wildcard')).toHaveLength(2)
})

test("Shortest on the Board's win ends the night when its viewer was the last on the wheel", async () => {
  forceCard('shortest-on-the-board')
  const { store } = setup({
    fetchFn: tmdbFetch().fetchFn,
    present: ['a'],
    nominations: { a: film(1) },
  })
  const dialog = await openCard()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Show the film' }))
  const frame = (await screen.findByRole('heading', { name: 'Film 1' })).closest('[role="dialog"]') as HTMLElement
  fireEvent.click(within(frame).getByRole('button', { name: 'Watch' }))
  await waitFor(() => expect(store.getState().night.ended).toBe(true))
})

test('closing the reveal of Shortest on the Board with × leaves the nomination on the wheel', async () => {
  forceCard('shortest-on-the-board')
  const { store } = setup({ fetchFn: tmdbFetch().fetchFn })
  const dialog = await openCard()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Show the film' }))
  const frame = (await screen.findByRole('heading', { name: 'Film 1' })).closest('[role="dialog"]') as HTMLElement
  fireEvent.click(within(frame).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  expect(store.getState().night.wonFilms).toEqual([])
  expect(viewersOnWheel(store.getState().night)).toEqual(['a', 'b', 'c'])
  expect(store.getState().night.nominations.a.tmdbId).toBe(1)
})

test('after the pick an arrow ticks between the other two cans and lands on the one that opens', async () => {
  forceCard('genre-night')
  const { fetchFn } = tmdbFetch({ ids: [11, 12, 13] })
  const { sound } = setup({ fetchFn })
  const dialog = await openCard()
  const picks = await within(dialog).findAllByRole('button', { name: /^Pick can/ })
  // The wheels' own pin ticks come first; the arrow's are counted from the pick.
  const before = sound.log.ticks
  fireEvent.click(picks[0])
  expect(within(dialog).getByText('Which one opens next…')).toBeInTheDocument()
  // The room can't take a film while the arrow ticks.
  for (const can of within(dialog).getAllByRole('button', { name: /^(Take|Pick)/ })) expect(can).toBeDisabled()
  await waitFor(() => expect(within(dialog).getAllByRole('button', { name: /^Take Found/ })).toHaveLength(2))
  expect(sound.log.ticks - before).toBeGreaterThanOrEqual(7)
  expect(dialog.querySelectorAll('.can-open')).toHaveLength(2)
  expect(dialog.querySelector('.can-arrow[data-on="true"]')).toBeNull()
})

test('taking the sealed can plays a drumroll that ends as it opens, and an open one plays none', async () => {
  forceCard('genre-night')
  const { fetchFn } = tmdbFetch({ ids: [11, 12, 13, 14, 15, 16] })
  const { sound } = setup({ fetchFn })
  let dialog = await openCard()
  let picks = await within(dialog).findAllByRole('button', { name: /^Pick can/ })
  fireEvent.click(picks[0])
  const open = await waitFor(() => {
    const buttons = within(dialog).getAllByRole('button', { name: /^Take Found/ })
    expect(buttons).toHaveLength(2)
    return buttons[1]
  })
  fireEvent.click(open)
  const frame = (await screen.findByRole('heading', { name: /^Found/ })).closest('[role="dialog"]') as HTMLElement
  expect(sound.log.rolls).toEqual([])
  expect(sound.log.breaks).toBe(0)
  fireEvent.click(within(frame).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(spinButton()).toBeEnabled())

  dialog = await openCard()
  picks = await within(dialog).findAllByRole('button', { name: /^Pick can/ })
  fireEvent.click(picks[0])
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Take the sealed can' }))
  await screen.findByRole('heading', { name: /^Found/ })
  expect(sound.log.rolls).toHaveLength(1)
  expect(sound.log.rolls[0]).toBeGreaterThan(0)
  expect(sound.log.breaks).toBe(1)
})

test('an open can has a tooltip with its runtime and a short description', async () => {
  forceCard('genre-night')
  const { fetchFn } = tmdbFetch({ ids: [11, 12, 13] })
  setup({ fetchFn })
  const dialog = await openCard()
  fireEvent.click((await within(dialog).findAllByRole('button', { name: /^Pick can/ }))[0])
  await waitFor(() => expect(within(dialog).getAllByRole('tooltip')).toHaveLength(2))
  for (const tip of within(dialog).getAllByRole('tooltip')) {
    expect(tip).toHaveTextContent('1h 35m')
    expect(tip).toHaveTextContent('Synopsis.')
  }
  const described = within(dialog).getAllByRole('button', { name: /^Take Found/ })
  for (const can of described) expect(can).toHaveAccessibleDescription(/1h 35m/)
})
