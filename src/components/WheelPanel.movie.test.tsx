import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, viewersOnWheel, watchedFilms, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import type { SoundEngine } from '../sound/engine.ts'
import { defaultWheelSettings, deriveSlices } from '../wheel/edit.ts'
import { cards } from '../wildcards/cards.ts'
import { dealCards } from '../wildcards/deal.ts'
import { recordStage } from '../test/phases.ts'

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
  const log = { closed: 0, ticks: 0, rolls: [] as number[], breaks: 0, events: [] as string[] }
  const engine: SoundEngine = {
    attach: () => () => {},
    apply: () => {},
    spinStart: () => {},
    musicStart: () => {},
    musicResume: () => {},
    beep: () => {},
    wildcardLanded: () => void log.events.push('wildcard-landed'),
    reelCut: () => void log.events.push('cut'),
    cueBeep: () => void log.events.push('cue-beep'),
    reelChange: () => void log.events.push('reel-change'),
    landedQuiet: (close = false) => void log.events.push(close ? 'landed-quiet-close' : 'landed-quiet'),
    fanfare: () => void log.events.push('fanfare'),
    knock: () => void log.events.push('knock'),
    slam: () => void log.events.push('slam'),
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

function setup(options: {
  present?: string[]
  nominations?: Record<string, Nomination>
  people?: typeof roster
  holdover?: Nomination | null
  wonFilms?: number[]
  watched?: Nomination[]
  fetchFn: typeof fetch
}) {
  const present = options.present ?? ['a', 'b', 'c']
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
      roster: options.people ?? roster,
      night: {
        ...defaultState.night,
        presentIds: present,
        wonFilms: options.wonFilms ?? [],
        watched: options.watched ?? [],
        nominations: options.nominations ?? { a: film(1), b: film(2), c: film(3) },
      },
      holdover: options.holdover ?? null,
    }),
  )
  const sound = recordingSound()
  render(
    <App
      store={store}
      fetchFn={options.fetchFn}
      random={wildcardRandom(present.filter((id) => !(options.wonFilms ?? []).includes(Number(options.nominations?.[id]?.tmdbId ?? { a: 1, b: 2, c: 3 }[id]))))}
      spinMs={20}
      sound={sound.engine}
    />,
  )
  return { store, sound }
}

function forceCard(id: string) {
  vi.mocked(dealCards).mockImplementation((context) =>
    Array.from({ length: 8 }, () => ({
      // A forced Letterboxd card rolls whatever the fake memory holds.
      ...cards.find((c) => c.id === id)!.roll(
        { ...context, viewers: context.viewers.map((v) => ({ ...v, canBacklog: true })) },
        () => 0,
      ),
      weight: 1,
    })),
  )
}

async function openCard() {
  // After an earlier card the clapper may still be opening, and the Spin waits for it.
  await waitFor(() => expect(spinButton()).toBeEnabled())
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
  expect(watchedFilms(night).map((f) => f.title)).toEqual([title])
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
  // The other can is unveiled, with both open, before the chosen film is taken.
  await waitFor(() => expect(dialog.querySelectorAll('.can-open')).toHaveLength(2))
  expect(store.getState().night.cardEffects).toEqual([])
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

test('a movie card has the movie face', async () => {
  forceCard('shortest-on-the-board')
  setup({ fetchFn: tmdbFetch().fetchFn })
  const dialog = await openCard()
  expect(dialog.querySelector('.card-face')).toHaveClass('card-face-movie')
  expect(dialog.querySelector('.card-face')).not.toHaveClass('card-face-wheel')
})

test("Watch on a movie card's film slams the clapperboard, and the lock ends when it has opened", async () => {
  forceCard('shortest-on-the-board')
  setup({ fetchFn: tmdbFetch().fetchFn })
  const dialog = await openCard()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Show the film' }))
  const frame = (await screen.findByRole('heading', { name: 'Film 1' })).closest('[role="dialog"]') as HTMLElement
  const stage = recordStage()
  fireEvent.click(within(frame).getByRole('button', { name: 'Watch' }))
  await waitFor(() => expect(document.querySelector('.wheel-stage')).not.toHaveAttribute('data-transition'))
  stage.stop()
  expect(stage.phases()).toEqual(['slam', 'open'])
  expect(stage.records.filter((r) => r.phase === 'open').every((r) => r.clapper && r.locked && !r.cards)).toBe(true)
  expect(stage.records[stage.records.length - 1]).toMatchObject({ phase: null, clapper: false, locked: false })
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

// A Worker whose watchlists and film ids are given: each username's slugs, each slug's TMDB id, and the TMDB details.
function lbFetch(options: {
  lists: Record<string, string[]>
  ids: Record<string, number | null>
  noDetails?: boolean
  private?: boolean
  filmFails?: boolean
  // The FFF movie night list: its pages, or the status of its failure.
  listPages?: Record<number, { slugs: string[]; hasNext: boolean; lastPage: number }>
  listError?: { status: number; error?: string }
}) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/lb/loreno/list/fff-movie-night-1')) {
      if (options.listError) return json({ error: options.listError.error }, options.listError.status)
      const page = Number(/page=(\d+)/.exec(url)?.[1] ?? 1)
      return json(options.listPages?.[page] ?? { slugs: [], hasNext: false, lastPage: 1 })
    }
    const list = /\/lb\/([a-z]+)\/watchlist/.exec(url)
    if (list && options.private) return json({ error: 'Watchlist is private' }, 404)
    if (list) return json({ slugs: options.lists[list[1]] ?? [], hasNext: false })
    if (url.includes('/lb/film/')) {
      if (options.filmFails) return json({}, 500)
      const slug = url.split('/').pop()!
      return json({ slug, tmdbId: options.ids[slug] ?? null })
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
  return fetchFn
}

const linked = [
  { ...roster[0], letterboxd: { username: 'ann', status: 'found' as const } },
  { ...roster[1], letterboxd: { username: 'bo', status: 'found' as const } },
  roster[2],
]

// Waits until the background walks of both linked viewers have settled.
async function walksSettled(fetchFn: typeof fetch) {
  await waitFor(() =>
    expect(vi.mocked(fetchFn).mock.calls.filter((c) => String(c[0]).includes('/watchlist'))).toHaveLength(2),
  )
  await act(async () => {})
}

test("X's Backlog draws three films from Ann's watchlist, plays the cans and opens the reveal under its own title", async () => {
  forceCard('backlog')
  const fetchFn = lbFetch({ lists: { ann: ['x', 'y', 'z'], bo: ['x'] }, ids: { x: 101, y: 102, z: 103 } })
  const { store } = setup({ fetchFn, people: linked })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  expect(within(dialog).getByRole('heading')).toHaveTextContent("Ann's Backlog")
  expect(within(dialog).getByText("Drawing from Ann's watchlist…")).toBeInTheDocument()
  expect(backButton(dialog)).toBeDisabled()
  const picks = await within(dialog).findAllByRole('button', { name: /^Pick can/ })
  expect(picks).toHaveLength(3)
  fireEvent.click(picks[0])
  await waitFor(() => expect(within(dialog).getAllByRole('tooltip')).toHaveLength(2))
  for (const tip of within(dialog).getAllByRole('tooltip')) expect(tip).not.toHaveTextContent('watchlist')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Take the sealed can' }))
  const reveal = await screen.findByRole('heading', { name: /^Found/ })
  const frame = reveal.closest('[role="dialog"]') as HTMLElement
  expect(within(frame).getByText("Ann's Backlog")).toBeInTheDocument()
  expect(store.getState().night.cardEffects).toEqual([
    { cardId: 'backlog', label: "Ann's backlog", change: { kind: 'movie' } },
  ])
  expect(screen.queryByRole('list', { name: "Tonight's cards" })).toBeNull()
  fireEvent.click(within(frame).getByRole('button', { name: 'Watch' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  const { night } = store.getState()
  expect(night.watched).toHaveLength(1)
  expect(night.wonFilms).toEqual([])
  expect(Object.keys(night.nominations)).toEqual(['a', 'b', 'c'])
  await waitFor(() => expect(spinButton()).toBeEnabled())
  act(() => store.getState().endNight())
  const items = within(await screen.findByRole('list', { name: 'Cards tonight' })).getAllByRole('listitem')
  expect(items.map((li) => li.textContent)).toEqual(["Ann's backlog"])
})

test("X's Backlog skips the board's films, and one usable film gives the Show the film button; × records nothing", async () => {
  forceCard('backlog')
  // Slug w is Ann's own nominated film 1, so it can't come up.
  const fetchFn = lbFetch({ lists: { ann: ['w', 'x'], bo: [] }, ids: { w: 1, x: 101 } })
  const { store } = setup({ fetchFn, people: linked })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Show the film' }))
  expect(within(dialog).queryByRole('button', { name: /^Pick can/ })).toBeNull()
  const frame = (await screen.findByRole('heading', { name: 'Found 101' })).closest('[role="dialog"]') as HTMLElement
  fireEvent.click(within(frame).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  expect(store.getState().night.watched).toEqual([])
  expect(store.getState().night.wonFilms).toEqual([])
})

test('a Backlog whose films all fail to load shows a message and lands nothing', async () => {
  forceCard('backlog')
  const fetchFn = lbFetch({ lists: { ann: ['x'], bo: [] }, ids: { x: 101 }, noDetails: true })
  const { store } = setup({ fetchFn, people: linked })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  await waitFor(() => expect(backButton(dialog)).toBeEnabled())
  expect(within(dialog).getByText("The drawn film couldn't be loaded.")).toBeInTheDocument()
  fireEvent.click(backButton(dialog))
  expect(store.getState().night.cardEffects).toEqual([])
})

test('Common Ground compares the settled watchlists, offers two cans of shared films with the holders in the tooltip, and opens the reveal', async () => {
  forceCard('common-ground')
  const fetchFn = lbFetch({ lists: { ann: ['x', 'y', 'z'], bo: ['x', 'y', 'q'] }, ids: { x: 101, y: 102, z: 103, q: 104 } })
  const { store } = setup({ fetchFn, people: linked })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  expect(within(dialog).getByText('Comparing watchlists…')).toBeInTheDocument()
  const picks = await within(dialog).findAllByRole('button', { name: /^Pick can/ })
  expect(picks).toHaveLength(2)
  expect(within(dialog).getByText(/^Two films/)).toBeInTheDocument()
  fireEvent.click(picks[0])
  await waitFor(() => expect(within(dialog).getAllByRole('tooltip').length).toBeGreaterThan(0))
  for (const tip of within(dialog).getAllByRole('tooltip')) {
    expect(tip.textContent).toMatch(/^On Ann's and Bo's watchlists1h 35m/)
  }
  const asked = vi
    .mocked(fetchFn)
    .mock.calls.map((c) => String(c[0]))
    .filter((u) => u.includes('/lb/film/'))
  expect(asked.every((u) => u.endsWith('/x') || u.endsWith('/y'))).toBe(true)
  const frame = (await screen.findByRole('heading', { name: /^Found/ })).closest('[role="dialog"]') as HTMLElement
  expect(within(frame).getByText('Common Ground')).toBeInTheDocument()
  expect(store.getState().night.cardEffects).toEqual([
    { cardId: 'common-ground', label: 'Common ground', change: { kind: 'movie' } },
  ])
  fireEvent.click(within(frame).getByRole('button', { name: 'Watch' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  expect(store.getState().night.watched).toHaveLength(1)
  expect(store.getState().night.wonFilms).toEqual([])
})

test('Common Ground with only excluded shared films shows a message and lands nothing', async () => {
  forceCard('common-ground')
  // The one shared film is Cy's nomination.
  const fetchFn = lbFetch({ lists: { ann: ['x'], bo: ['x'] }, ids: { x: 3 } })
  const { store } = setup({ fetchFn, people: linked })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  await waitFor(() => expect(backButton(dialog)).toBeEnabled())
  expect(within(dialog).getByText('No film on the shared watchlists can be used.')).toBeInTheDocument()
  fireEvent.click(backButton(dialog))
  expect(store.getState().night.cardEffects).toEqual([])
})

test("X's Backlog skips the won and watched films", async () => {
  forceCard('backlog')
  const fetchFn = lbFetch({
    lists: { ann: ['w', 'x', 'z'], bo: [] },
    ids: { w: 201, x: 202, z: 204 },
  })
  setup({ fetchFn, people: linked, wonFilms: [201], watched: [film(202)] })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Show the film' }))
  await screen.findByRole('heading', { name: 'Found 204' })
})

test("a two-film Backlog gives two cans and text reading 'Two'", async () => {
  forceCard('backlog')
  const fetchFn = lbFetch({ lists: { ann: ['x', 'y'], bo: [] }, ids: { x: 101, y: 102 } })
  setup({ fetchFn, people: linked })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  expect(await within(dialog).findAllByRole('button', { name: /^Pick can/ })).toHaveLength(2)
  expect(within(dialog).getByText("Two films from Ann's watchlist in the cans.")).toBeInTheDocument()
})

test('a Backlog with a private watchlist shows the message and Back lands nothing', async () => {
  forceCard('backlog')
  const fetchFn = lbFetch({ lists: {}, ids: {}, private: true })
  const { store } = setup({ fetchFn, people: linked })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  await waitFor(() => expect(backButton(dialog)).toBeEnabled())
  expect(within(dialog).getByText("Ann's watchlist is private.")).toBeInTheDocument()
  fireEvent.click(backButton(dialog))
  expect(store.getState().night.cardEffects).toEqual([])
})

test('Common Ground shows a message when Letterboxd fails while mapping the shared films', async () => {
  forceCard('common-ground')
  const fetchFn = lbFetch({ lists: { ann: ['x'], bo: ['x'] }, ids: { x: 101 }, filmFails: true })
  const { store } = setup({ fetchFn, people: linked })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  await waitFor(() => expect(backButton(dialog)).toBeEnabled())
  expect(within(dialog).getByText("Letterboxd can't be reached right now.")).toBeInTheDocument()
  fireEvent.click(backButton(dialog))
  expect(store.getState().night.cardEffects).toEqual([])
})

test("an away viewer's watchlist is left out of Common Ground's group", async () => {
  forceCard('common-ground')
  const fetchFn = lbFetch({ lists: { ann: ['x'], bo: ['x'] }, ids: { x: 101 } })
  setup({ fetchFn, people: linked, present: ['a', 'c'] })
  await waitFor(() => expect(vi.mocked(fetchFn).mock.calls.some((c) => String(c[0]).includes('/lb/ann/watchlist'))).toBe(true))
  await act(async () => {})
  const dialog = await openCard()
  await waitFor(() => expect(backButton(dialog)).toBeEnabled())
  expect(within(dialog).getByText('No film on the shared watchlists can be used.')).toBeInTheDocument()
})

test("a won-tonight viewer's watchlist still counts toward Common Ground's group", async () => {
  forceCard('common-ground')
  const fetchFn = lbFetch({ lists: { ann: ['x'], bo: ['x'] }, ids: { x: 101 } })
  // Bo's film (2) has won, so Bo is off the wheel but still present.
  setup({ fetchFn, people: linked, wonFilms: [2] })
  await walksSettled(fetchFn)
  const dialog = await openCard()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Show the film' }))
  await screen.findByRole('heading', { name: 'Found 101' })
})

test('Movie Night Rewind draws from the FFF list, plays the cans and opens the reveal under its name', async () => {
  forceCard('movie-night-rewind')
  const fetchFn = lbFetch({
    lists: {},
    ids: { x: 101, y: 102, z: 103 },
    listPages: { 1: { slugs: ['x', 'y', 'z'], hasNext: false, lastPage: 1 } },
  })
  const { store } = setup({ fetchFn, people: linked })
  const dialog = await openCard()
  expect(within(dialog).getByRole('heading')).toHaveTextContent('Movie Night Rewind')
  expect(within(dialog).getByText('Rewinding the FFF movie night list…')).toBeInTheDocument()
  expect(backButton(dialog)).toBeDisabled()
  const picks = await within(dialog).findAllByRole('button', { name: /^Pick can/ })
  expect(picks).toHaveLength(3)
  fireEvent.click(picks[0])
  await waitFor(() => expect(within(dialog).getAllByRole('tooltip')).toHaveLength(2))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Take the sealed can' }))
  const reveal = await screen.findByRole('heading', { name: /^Found/ })
  const frame = reveal.closest('[role="dialog"]') as HTMLElement
  expect(within(frame).getByText('Movie Night Rewind')).toBeInTheDocument()
  expect(store.getState().night.cardEffects).toEqual([
    { cardId: 'movie-night-rewind', label: 'Movie Night Rewind', change: { kind: 'movie' } },
  ])
  fireEvent.click(within(frame).getByRole('button', { name: 'Watch' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  const { night } = store.getState()
  expect(watchedFilms(night)).toHaveLength(1)
  expect(night.wonFilms).toEqual([])
})

test('Movie Night Rewind still offers the held film when it is the only one not on the board', async () => {
  forceCard('movie-night-rewind')
  const fetchFn = lbFetch({
    lists: {},
    ids: { p: 1, q: 2, r: 101 },
    listPages: { 1: { slugs: ['p', 'q', 'r'], hasNext: false, lastPage: 1 } },
  })
  setup({ fetchFn, holdover: film(101) })
  const dialog = await openCard()
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Show the film' }))
  expect(await screen.findByRole('heading', { name: 'Found 101' })).toBeInTheDocument()
})

test.each([
  ['a private list', { status: 404, error: 'List is private' }, 'The FFF movie night list is private.'],
  ['a missing list', { status: 404, error: 'No such list' }, "Letterboxd can't find the FFF movie night list."],
  ['an unreachable Letterboxd', { status: 500 }, "Letterboxd can't be reached right now."],
])('Movie Night Rewind with %s shows a message, and Back lands nothing', async (_name, listError, message) => {
  forceCard('movie-night-rewind')
  const { store } = setup({ fetchFn: lbFetch({ lists: {}, ids: {}, listError }) })
  const dialog = await openCard()
  expect(await within(dialog).findByText(message)).toBeInTheDocument()
  fireEvent.click(backButton(dialog))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  expect(store.getState().night.cardEffects).toEqual([])
  expect(store.getState().night.watched).toEqual([])
})

test('Movie Night Rewind with no usable film on the list says so', async () => {
  forceCard('movie-night-rewind')
  const fetchFn = lbFetch({ lists: {}, ids: { p: 1 }, listPages: { 1: { slugs: ['p'], hasNext: false, lastPage: 1 } } })
  setup({ fetchFn })
  const dialog = await openCard()
  expect(await within(dialog).findByText('No film on the FFF movie night list can be used.')).toBeInTheDocument()
})

test('Play Rento holds its card, then shows the game reveal; Play lands the card and saves the game', async () => {
  forceCard('play-rento')
  const { store } = setup({ fetchFn: tmdbFetch().fetchFn })
  const dialog = await openCard()
  expect(within(dialog).getByRole('heading')).toHaveTextContent('Play Rento')
  expect(backButton(dialog)).toBeDisabled()
  expect(screen.queryByText('Now playing')).toBeNull()
  const play = await screen.findByRole('button', { name: 'Play' })
  const frame = play.closest('[role="dialog"]') as HTMLElement
  expect(within(frame).getByText('Now playing')).toBeInTheDocument()
  expect(within(frame).getByRole('heading', { name: 'Rento' })).toBeInTheDocument()
  expect(within(frame).getByText('Play Rento')).toBeInTheDocument()
  const link = within(frame).getByRole('link', { name: 'Open Rento' })
  expect(link).toHaveAttribute('href', 'https://rento.com/')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link.getAttribute('rel')).toContain('noopener')
  expect(within(frame).queryByRole('button', { name: 'Save for Next Week' })).toBeNull()
  expect(frame.querySelector('.reveal-meta, .reveal-synopsis')).toBeNull()
  expect(store.getState().night.cardEffects).toEqual([])
  fireEvent.click(play)
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  const { night } = store.getState()
  expect(night.cardEffects).toEqual([{ cardId: 'play-rento', label: 'Play Rento', change: { kind: 'movie' } }])
  expect(night.watched).toEqual([{ kind: 'game', name: 'Rento', url: 'https://rento.com/' }])
  expect(night.wonFilms).toEqual([])
  expect(night.ended).toBe(false)
})

test('× on the game reveal saves nothing and lands no card', async () => {
  forceCard('play-rento')
  const { store } = setup({ fetchFn: tmdbFetch().fetchFn })
  await openCard()
  const play = await screen.findByRole('button', { name: 'Play' })
  fireEvent.click(within(play.closest('[role="dialog"]') as HTMLElement).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  expect(store.getState().night.cardEffects).toEqual([])
  expect(store.getState().night.watched).toEqual([])
})

test('a wedge for Play Rento draws the pawn glyph', async () => {
  forceCard('play-rento')
  setup({ fetchFn: tmdbFetch().fetchFn })
  fireEvent.click(spinButton())
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')))
  expect(screen.getAllByTestId('card-glyph')[0]).toHaveAttribute('data-glyph', 'pawn')
})
