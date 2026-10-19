import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import type { SoundEngine } from '../sound/engine.ts'
import { defaultWheelSettings, deriveSlices, effectiveSetting, wildcardTotal, type WheelSettings } from '../wheel/edit.ts'
import { drawSlice } from '../wheel/draw.ts'
import { dealCards } from '../wildcards/deal.ts'
import { catchTickShare } from './WheelPanel.tsx'

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
  vi.unstubAllGlobals()
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

const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))
const spinButton = () => screen.getByRole('button', { name: 'Spin' })
const wedgeKinds = () => screen.queryAllByTestId('wedge').map((w) => w.getAttribute('data-kind'))
const rotation = () => document.querySelector('svg.wheel > g')!.getAttribute('transform')
const dial = () => document.querySelector('.countdown')

const roster = [
  { id: 'a', name: 'Ann', color: '#e6194b' },
  { id: 'b', name: 'Bo', color: '#f58231' },
  { id: 'c', name: 'Cy', color: '#3cb44b' },
]

// A `random` that always lands on a wildcard of the main wheel (and on some card of the dealt one).
function wildcardRandom(wheel: WheelSettings): () => number {
  const slices = deriveSlices(['a', 'b', 'c'], wheel, {})
  const total = slices.reduce((sum, s) => sum + s.weight, 0)
  let before = 0
  for (const s of slices) {
    if (s.kind === 'wildcard') return () => (before + s.weight / 2) / total
    before += s.weight
  }
  throw new Error('no wildcard')
}

function recordingSound() {
  const log = {
    starts: 0,
    countdownStarts: 0,
    keepStarts: 0,
    musicStarts: 0,
    resumes: 0,
    landed: 0,
    landedClose: [] as boolean[],
    closed: 0,
    cues: 0,
    ticks: [] as number[],
    events: [] as string[],
  }
  const engine: SoundEngine = {
    attach: () => () => {},
    apply: () => {},
    spinStart: (countdown = false, keep = false) => {
      log.starts++
      if (countdown) log.countdownStarts++
      if (keep) log.keepStarts++
      log.events.push(keep ? 'start-keep' : 'start')
    },
    musicStart: () => {
      log.musicStarts++
      log.events.push('music')
    },
    musicResume: () => {
      log.resumes++
      log.events.push('resume')
    },
    beep: () => {},
    spinSpeed: () => {},
    pinTick: (share) => void log.ticks.push(share),
    spinEnd: () => {},
    closeCall: () => void log.cues++,
    closeCallBreak: () => {},
    landed: (_s, close = false) => {
      log.landed++
      log.landedClose.push(close)
      log.events.push('landed')
    },
    revealClosed: () => {
      log.closed++
      log.events.push('closed')
    },
  }
  return { engine, log }
}

function setup(
  options: {
    wheel?: Partial<WheelSettings>
    sound?: SoundEngine
    holdover?: Nomination | null
    random?: () => number
  } = {},
) {
  const wheel = { ...defaultWheelSettings, ...options.wheel }
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, wheel },
      roster,
      night: {
        ...defaultState.night,
        presentIds: ['a', 'b', 'c'],
        nominations: { a: film(1), b: film(2), c: film(3) },
      },
      holdover: options.holdover ?? null,
    }),
  )
  const random = options.random ?? wildcardRandom(wheel)
  render(<App store={store} fetchFn={vi.fn()} random={random} spinMs={20} sound={options.sound} />)
  return { store, random }
}

// The deal the panel makes with a constant `random`, to know which card the dialog shows.
function expectedDeal(store: ReturnType<typeof setup>['store'], random: () => number) {
  const { night, settings } = store.getState()
  return dealCards(
    {
      viewers: roster.map((v) => ({
        id: v.id,
        name: v.name,
        film: night.nominations[v.id]
          ? { tmdbId: night.nominations[v.id].tmdbId, title: night.nominations[v.id].title }
          : null,
        canReshuffle: false,
        ...effectiveSetting(settings.wheel, night.adjustments, v.id, night.cardEffects),
      })),
      wildcardCount: wildcardTotal(3, settings.wheel, night.cardEffects),
    },
    random,
  )
}

test('a wildcard landing swaps in the wildcard wheel, which drifts until pressed; its spin opens the card; Back applies it', async () => {
  const { store, random } = setup({ holdover: film(7) })
  const deal = expectedDeal(store, random)
  fireEvent.click(spinButton())
  // The main press clears the held film and locks the night.
  expect(store.getState().holdover).toBeNull()
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeDisabled()
  // It waits for its press, drifting.
  expect(spinButton()).toBeEnabled()
  const before = rotation()
  await sleep(200)
  expect(rotation()).not.toBe(before)
  // The wildcard wheel's spin leaves the held film alone.
  store.setState({ holdover: film(9) })
  fireEvent.click(spinButton())
  const dialog = await screen.findByRole('dialog')
  expect(store.getState().holdover?.tmdbId).toBe(9)
  // The drawn card is the slice drawn by weight with the same random.
  const drawn = drawSlice(
    deal.map((c, index) => ({ kind: 'card' as const, index, weight: c.weight })),
    random,
  )
  expect(within(dialog).getByRole('heading')).toHaveTextContent(deal[drawn].title)
  expect(within(dialog).getByText(deal[drawn].text)).toBeInTheDocument()
  expect(within(dialog).getByText('Wheel card')).toBeInTheDocument()
  const back = within(dialog).getByRole('button', { name: 'Back to the main wheel' })
  expect(back).toHaveFocus()
  expect(screen.getByTestId('card-turn')).toHaveClass('card-flip')
  expect(store.getState().night.cardEffects).toEqual([])
  fireEvent.click(back)
  expect(store.getState().night.cardEffects).toEqual([deal[drawn].effect])
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeEnabled()
})

test('Escape takes the card like Back to the main wheel, and the wheel is derived with its effect', async () => {
  const { store } = setup()
  fireEvent.click(spinButton())
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')))
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(store.getState().night.cardEffects).toHaveLength(1)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(wedgeKinds()).not.toContain('card'))
  const { night, settings } = store.getState()
  const slices = deriveSlices(['a', 'b', 'c'], settings.wheel, night.adjustments, night.cardEffects)
  expect(screen.getAllByTestId('wedge')).toHaveLength(slices.length)
})

test('with the Wildcard wheel switch off a wildcard landing opens the wildcard search', async () => {
  const { store } = setup({ wheel: { wildcardWheel: false } })
  fireEvent.click(spinButton())
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByRole('heading')).toHaveTextContent('Wildcard!')
  expect(wedgeKinds()).not.toContain('card')
  expect(store.getState().night.cardEffects).toEqual([])
})

test('the card opens face up with no flip under reduced motion, and the wheel still crossfades', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  setup()
  fireEvent.click(spinButton())
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')), { timeout: 3000 })
  fireEvent.click(spinButton())
  await screen.findByRole('dialog', undefined, { timeout: 3000 })
  expect(screen.getByTestId('card-turn')).not.toHaveClass('card-flip')
  expect(screen.queryByTestId('flicker')).toBeNull()
}, 9000)

test('the music plays on through the wildcard wheel: no landing sounds at the wildcard, keep-music spin, landing at the card, fade at Back', async () => {
  const { engine, log } = recordingSound()
  setup({ sound: engine })
  fireEvent.click(spinButton())
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')))
  expect(log.landed).toBe(0)
  expect(log.closed).toBe(0)
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(log.events).toEqual(['start', 'start-keep', 'landed'])
  expect(log.keepStarts).toBe(1)
  expect(log.musicStarts).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Back to the main wheel' }))
  expect(log.closed).toBe(1)
})

function withDebug() {
  window.history.pushState({}, '', '/?debug')
}

test('without the debug flag there is no Force wildcards checkbox', () => {
  setup()
  expect(screen.queryByLabelText('Force wildcards')).toBeNull()
})

test('Force wildcards makes an ordinary random land on a wildcard, and locks during a spin', async () => {
  withDebug()
  const { store } = setup({ random: () => 0.01 })
  const box = screen.getByLabelText('Force wildcards')
  expect(box).not.toBeChecked()
  fireEvent.click(spinButton())
  // Unchecked, 0.01 draws a viewer's film.
  await screen.findByRole('dialog')
  expect(wedgeKinds()).not.toContain('card')
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.click(box)
  fireEvent.click(spinButton())
  expect(box).toBeDisabled()
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')))
  expect(store.getState().night.cardEffects).toEqual([])
})

test('on the wildcard wheel, Force close calls makes a close call and Force catches a catch', async () => {
  withDebug()
  const close = recordingSound()
  setup({ sound: close.engine, wheel: { spinSeconds: 6 } })
  fireEvent.click(screen.getByLabelText('Force close calls'))
  fireEvent.click(spinButton())
  // The main spin is a close call too: the march comes back up when it lands on the wildcard.
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')))
  expect(close.log.cues).toBe(1)
  expect(close.log.resumes).toBe(1)
  expect(close.log.landed).toBe(0)
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(close.log.cues).toBe(2)
  expect(close.log.landedClose).toEqual([true])
  expect(screen.getByText('Close call')).toBeInTheDocument()
  cleanup()

  const caught = recordingSound()
  setup({ sound: caught.engine })
  fireEvent.click(screen.getByLabelText('Force catches'))
  fireEvent.click(spinButton())
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')))
  const afterMain = caught.log.ticks.filter((t) => t === catchTickShare).length
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(caught.log.ticks.filter((t) => t === catchTickShare).length).toBe(afterMain + 1)
})

test('on the wildcard wheel, Force countdowns shows the dial and starts no music', async () => {
  withDebug()
  const { engine, log } = recordingSound()
  setup({ sound: engine })
  fireEvent.click(screen.getByLabelText('Force countdowns'))
  fireEvent.click(spinButton())
  expect(dial()).not.toBeNull()
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')), { timeout: 4000 })
  expect(log.musicStarts).toBe(1)
  fireEvent.click(spinButton())
  expect(dial()).not.toBeNull()
  expect(log.countdownStarts).toBe(2)
  expect(log.keepStarts).toBe(1)
  await screen.findByRole('dialog', undefined, { timeout: 4000 })
  expect(dial()).toBeNull()
  expect(log.musicStarts).toBe(1)
}, 15000)

const weightEffect = (label: string, ...viewerIds: string[]) => ({
  cardId: 'x-weight',
  label,
  change: { kind: 'weight' as const, amount: 2, viewerIds },
})
const chips = () => screen.queryByRole('list', { name: "Tonight's cards" })
const chipTexts = () => within(chips()!).getAllByRole('listitem').map((li) => li.textContent)

test("Tonight's cards list one chip per landed card, in order, repeats included", () => {
  const { store } = setup()
  expect(chips()).toBeNull()
  act(() =>
    store.setState({
      night: {
        ...store.getState().night,
        cardEffects: [
          weightEffect('Ann +2 weight', 'a'),
          { cardId: 'wc', label: '+1 wildcard', change: { kind: 'wildcards', amount: 1 } },
          weightEffect('Ann +2 weight', 'a'),
        ],
      },
    }),
  )
  expect(chipTexts()).toEqual(['Ann +2 weight', '+1 wildcard', 'Ann +2 weight'])
  // After the wheel stage, before the debug checkboxes.
  const stage = document.querySelector('.wheel-stage')!
  expect(stage.compareDocumentPosition(chips()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('a chip stays for an away or won viewer, and leaves with its removed viewers', () => {
  const { store } = setup()
  act(() =>
    store.setState({
      night: {
        ...store.getState().night,
        presentIds: ['a', 'c'],
        wonFilms: [3],
        cardEffects: [
          weightEffect('Bo +2 weight', 'b'),
          weightEffect('Cy +2 weight', 'c'),
          { cardId: 'wc', label: '+1 wildcard', change: { kind: 'wildcards', amount: 1 } },
        ],
      },
    }),
  )
  expect(chipTexts()).toEqual(['Bo +2 weight', 'Cy +2 weight', '+1 wildcard'])
  act(() => store.getState().removeViewer('b'))
  expect(chipTexts()).toEqual(['Cy +2 weight', '+1 wildcard'])
  act(() => store.getState().removeViewer('c'))
  expect(chipTexts()).toEqual(['+1 wildcard'])
})

test("with only removed viewers' cards, or once the night has ended, there is no list", () => {
  const { store } = setup()
  act(() =>
    store.setState({
      night: { ...store.getState().night, cardEffects: [weightEffect('Bo +2 weight', 'b')] },
    }),
  )
  expect(chips()).not.toBeNull()
  act(() => store.setState({ night: { ...store.getState().night, ended: true } }))
  expect(chips()).toBeNull()
  act(() => store.setState({ night: { ...store.getState().night, ended: false } }))
  act(() => store.getState().removeViewer('b'))
  expect(chips()).toBeNull()
})

test("the wildcard wheel's Back adds the new card's chip", async () => {
  setup()
  fireEvent.click(spinButton())
  await waitFor(() => expect(wedgeKinds()).toEqual(Array(8).fill('card')))
  fireEvent.click(spinButton())
  const dialog = await screen.findByRole('dialog')
  expect(chips()).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Back to the main wheel' }))
  await waitFor(() => expect(chips()).not.toBeNull())
  expect(chipTexts()).toHaveLength(1)
})
