import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { Profiler } from 'react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { angleUnderPointer, drawSlice, edgeMargins } from '../wheel/draw.ts'
import { closeCallKind, isCloseCall } from '../wheel/closeCall.ts'
import { sliceArcs } from '../wheel/layout.ts'
import { header, markAway, markHere } from '../test/cells.ts'
import { defaultWheelSettings, deriveSlices } from '../wheel/edit.ts'
import type { SoundEngine, SoundSettings } from '../sound/engine.ts'
import { catchZone, isCatch } from '../wheel/catch.ts'
import { catchTickShare } from './WheelPanel.tsx'
import { useWheelMotion } from './useWheelMotion.ts'

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
  extra: { random?: () => number; spinMs?: number; sound?: SoundEngine } = { spinMs: 20 },
  wheel = defaultWheelSettings,
) {
  const roster = [
    { id: 'a', name: 'Ann', color: '#e6194b' },
    { id: 'b', name: 'Bo', color: '#f58231' },
  ]
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, wheel },
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

const wheelRotation = () => {
  const transform = document.querySelector('svg.wheel > g')!.getAttribute('transform')!
  return Number(/rotate\(([^)]+)\)/.exec(transform)![1])
}

const flapperTransform = () => screen.getByTestId('flapper').getAttribute('transform')!
// The flapper's bend in degrees about its pivot: negative swings the tip toward +x.
const flapperAngle = () => Number(/rotate\(([^ )]+)/.exec(flapperTransform())![1])

// Samples the flapper's angle about every 10 ms for `ms`.
async function sampleFlapper(ms: number): Promise<number[]> {
  const samples: number[] = []
  for (let t = 0; t < ms; t += 10) {
    await sleep(10)
    samples.push(flapperAngle())
  }
  return samples
}

// Three viewers at 12 slices each, no wildcards: 36 slices of 10°.
function setupCrowd(
  extra: { random?: () => number; spinMs?: number; sound?: SoundEngine },
  spinSeconds = 2,
) {
  const roster = [
    { id: 'a', name: 'Ann', color: '#e6194b' },
    { id: 'b', name: 'Bo', color: '#f58231' },
    { id: 'c', name: 'Cy', color: '#3cb44b' },
  ]
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: {        viewersHidden: false,
        wheel: {
          ...defaultWheelSettings,
          wildcardsPerViewer: false,
          wildcardCount: 0,
          defaultSlices: 12,
          spinSeconds,
        },
      },
      roster,
      night: {
        ...defaultState.night,
        presentIds: ['a', 'b', 'c'],
        nominations: { a: film(1), b: film(2), c: film(3) },
      },
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} {...extra} />)
}

const spinButton = () => screen.getByRole('button', { name: 'Spin' })
const hrefs = () =>
  Array.from(document.querySelectorAll('image')).map((i) => i.getAttribute('href'))

test('there is no Spin button with no viewers, and the empty-wheel text shows', () => {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
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
  const pressedAt = wheelRotation()
  fireEvent.click(spinButton())

  expect(spinButton()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add a viewer' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled()
  expect(header('Ann')).toBeDisabled()

  const before = hrefs()
  act(() => store.getState().nominate('a', film(7, '/other.jpg')))
  expect(hrefs()).toEqual(before)

  await screen.findByRole('dialog')
  expect(spinButton()).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeDisabled()

  const slices = deriveSlices(['a', 'b'], defaultWheelSettings, {})
  const arcs = sliceArcs(slices)
  // random() = 0.5 draws the slice holding half the total weight and rests at its middle.
  const total = slices.reduce((s, x) => s + x.weight, 0)
  let cumulative = 0
  const index = slices.findIndex((s) => (cumulative += s.weight) > total / 2)
  const rotation = wheelRotation()
  const angle = angleUnderPointer(rotation)
  expect(angle).toBeGreaterThan(arcs[index].start)
  expect(angle).toBeLessThan(arcs[index].end)
  expect(rotation - pressedAt).toBeGreaterThanOrEqual(5 * 360)
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
  expect(screen.getByRole('region', { name: 'Night over' })).toBeInTheDocument()
  expect(screen.queryByText('The night is over.')).toBeNull()
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
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
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

test('the turns come from the spin settings', async () => {
  setup(['a', 'b'], { random: () => 0.5, spinMs: 20 }, {
    ...defaultWheelSettings,
    spinSeconds: 6,
    spinTurnsPerSecond: 2,
  })
  const pressedAt = wheelRotation()
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(wheelRotation() - pressedAt).toBeGreaterThanOrEqual(12 * 360)
  expect(wheelRotation() - pressedAt).toBeLessThan(13 * 360)
})

test('reduced motion makes one turn whatever the settings', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  try {
    setup(['a', 'b'], { random: () => 0.5, spinMs: 20 }, {
      ...defaultWheelSettings,
      spinSeconds: 6,
      spinTurnsPerSecond: 2,
    })
    const pressedAt = wheelRotation()
    fireEvent.click(spinButton())
    await screen.findByRole('dialog')
    expect(wheelRotation() - pressedAt).toBeGreaterThanOrEqual(360)
    expect(wheelRotation() - pressedAt).toBeLessThan(2 * 360)
  } finally {
    vi.unstubAllGlobals()
  }
})

test('the spin lasts the length set plus the wind-up', async () => {
  setup(['a', 'b'], { random: () => 0.5 }, { ...defaultWheelSettings, spinSeconds: 2 })
  fireEvent.click(spinButton())
  await new Promise((r) => setTimeout(r, 2000))
  expect(screen.queryByRole('dialog')).toBeNull()
  await screen.findByRole('dialog', undefined, { timeout: 4500 })
}, 9000)

const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

test('the wheel drifts while Spin is disabled and while the settings popover is open', async () => {
  setup([])
  expect(spinButton()).toBeDisabled()
  const first = wheelRotation()
  await sleep(300)
  const second = wheelRotation()
  expect(second).toBeGreaterThan(first)
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Wheel settings' }))
  await sleep(200)
  const third = wheelRotation()
  await sleep(300)
  expect(wheelRotation()).toBeGreaterThan(third)
})

test('the wheel holds the rest point under the reveal, drifts after Close, and stops when the night ends', async () => {
  const store = setup(['a', 'b'], { random: () => 0.5, spinMs: 20 })
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  const held = wheelRotation()
  await sleep(300)
  expect(wheelRotation()).toBe(held)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await sleep(400)
  expect(wheelRotation()).toBeGreaterThan(held)
  act(() => store.getState().endNight())
  await sleep(2500)
  const ended = wheelRotation()
  await sleep(300)
  expect(wheelRotation()).toBe(ended)
}, 9000)

test('React commits nothing while the wheel drifts, and a spin costs a fixed few', async () => {
  let commits = 0
  const onRender = () => {
    commits++
  }
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
        nominations: { a: film(1), b: film(2) },
      },
    }),
  )
  const view = (spinMs: number) => (
    <Profiler id="app" onRender={onRender}>
      <App store={store} fetchFn={vi.fn()} random={() => 0.5} spinMs={spinMs} />
    </Profiler>
  )
  const { rerender } = render(view(20))
  await sleep(50)
  // The labels, titles and wildcard art are on the wheel being watched.
  expect(document.querySelectorAll('svg.wheel .wheel-label-title').length).toBeGreaterThan(0)
  expect(document.querySelectorAll('svg.wheel .wheel-label-word').length).toBeGreaterThan(0)
  const idleStart = commits
  const before = wheelRotation()
  const flapperBefore = flapperTransform()
  await sleep(300)
  expect(wheelRotation()).toBeGreaterThan(before)
  expect(flapperTransform()).not.toBe(flapperBefore)
  expect(commits).toBe(idleStart)

  const spinCommits = async (ms: number) => {
    rerender(view(ms))
    await sleep(50)
    const start = commits
    fireEvent.click(spinButton())
    await screen.findByRole('dialog', undefined, { timeout: 2000 })
    const used = commits - start
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    return used
  }
  const short = await spinCommits(20)
  const long = await spinCommits(400)
  expect(long).toBe(short)
  expect(short).toBeLessThan(8)
})

test('the wheel measures nothing in the DOM while it drifts, spins and reveals', async () => {
  const measured = vi.fn()
  const proto = SVGElement.prototype as unknown as Record<string, unknown>
  proto.getBBox = measured
  proto.getComputedTextLength = measured
  const canvas = HTMLCanvasElement.prototype as unknown as Record<string, unknown>
  const getContext = canvas.getContext
  canvas.getContext = () => ({ measureText: measured })
  try {
    setup(['a', 'b'], { random: () => 0.5, spinMs: 20 })
    await sleep(100)
    fireEvent.click(spinButton())
    await screen.findByRole('dialog', undefined, { timeout: 2000 })
    expect(measured).not.toHaveBeenCalled()
  } finally {
    delete proto.getBBox
    delete proto.getComputedTextLength
    canvas.getContext = getContext
  }
})

test('a wheel that mounts again shows the current angle at once', async () => {
  const store = setup(['a', 'b'])
  await sleep(200)
  markAway('Ann')
  markAway('Bo')
  expect(document.querySelector('svg.wheel')).toBeNull()
  markHere('Ann')
  expect(document.querySelector('svg.wheel > g')!.getAttribute('transform')).toMatch(
    /^rotate\(/,
  )
  expect(store.getState().night.presentIds).toContain('a')
})

test('reduced motion: no drift, before or after a spin', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  try {
    setup(['a', 'b'], { random: () => 0.5, spinMs: 20 })
    const idle = wheelRotation()
    await sleep(300)
    expect(wheelRotation()).toBe(idle)
    fireEvent.click(spinButton())
    await screen.findByRole('dialog')
    const held = wheelRotation()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await sleep(300)
    expect(wheelRotation()).toBe(held)
  } finally {
    vi.unstubAllGlobals()
  }
})

const hubRotation = () => {
  const transform = screen.getByTestId('hub-disc').getAttribute('transform')!
  return Number(/rotate\(([^)]+)\)/.exec(transform)![1])
}

test('the Spin button is a hub: its disc turns with the wheel and the label stays upright', async () => {
  setup(['a', 'b'], { random: () => 0.5, spinMs: 20 })
  const hubSvg = spinButton().querySelector('svg')!
  expect(hubSvg).toHaveAttribute('aria-hidden', 'true')
  const label = within(spinButton()).getByText('Spin')
  expect(hubSvg.contains(label)).toBe(false)
  expect(screen.getByTestId('hub-disc').closest('[data-testid="hub-disc"]')!.contains(label)).toBe(false)

  const first = hubRotation()
  await sleep(300)
  expect(hubRotation()).toBeGreaterThan(first)
  expect(hubRotation()).toBeCloseTo(wheelRotation(), 0)

  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(hubRotation()).toBe(wheelRotation())
})

test('on landing the flicker plays and the reveal opens 0.65 s later, Spin staying disabled', async () => {
  setup(['a', 'b'], { random: () => 0.5 }, { ...defaultWheelSettings, spinSeconds: 2 })
  fireEvent.click(spinButton())
  await screen.findByTestId('flicker', undefined, { timeout: 4500 })
  const landedAt = Date.now()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(spinButton()).toBeDisabled()
  await screen.findByRole('dialog', undefined, { timeout: 2000 })
  expect(Date.now() - landedAt).toBeGreaterThanOrEqual(550)
  expect(spinButton()).toBeDisabled()
}, 9000)

test('with reduced motion there is no flicker and the reveal opens on landing', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  try {
    setup(['a', 'b'], { random: () => 0.5 })
    fireEvent.click(spinButton())
    await screen.findByRole('dialog', undefined, { timeout: 2500 })
    expect(screen.queryByTestId('flicker')).toBeNull()
  } finally {
    vi.unstubAllGlobals()
  }
}, 6000)

test('a test-length spin still shows the flicker while the reveal opens at once', async () => {
  setup(['a', 'b'], { random: () => 0.5, spinMs: 20 })
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(screen.getByTestId('flicker')).toBeInTheDocument()
})

test('the flapper starts bent against the first pin and springs free as the drift moves the wheel', async () => {
  setup(['a', 'b'])
  const samples = await sampleFlapper(2500)
  expect(Math.min(...samples)).toBeLessThan(-20)
  expect(Math.max(...samples)).toBeGreaterThan(0)
  await sleep(1200)
  expect(Math.abs(flapperAngle())).toBeLessThan(1)
}, 12000)

test('the wind-up bends the flapper the other way and the glide bends it forward', async () => {
  setupCrowd({ random: () => 0.5 })
  await sleep(50)
  fireEvent.click(spinButton())
  const windUp = await sampleFlapper(480)
  expect(Math.max(...windUp)).toBeGreaterThan(5)
  const glide = await sampleFlapper(1000)
  expect(Math.min(...glide)).toBeLessThan(-5)
}, 9000)

test('reduced motion: the flapper still catches pins in the 1 s spin and settles after it', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  try {
    setupCrowd({ random: () => 0.5 })
    await sleep(50)
    // The wheel does not drift, so the flapper rests bent against the first pin.
    expect(flapperAngle()).toBeLessThan(-8)
    fireEvent.click(spinButton())
    const during = await sampleFlapper(900)
    expect(new Set(during).size).toBeGreaterThan(3)
    expect(Math.min(...during)).toBeLessThan(-5)
    await screen.findByRole('dialog')
    await sleep(1200)
    const rest = flapperAngle()
    await sleep(100)
    expect(flapperAngle()).toBe(rest)
    expect(rest).toBeLessThanOrEqual(0)
  } finally {
    vi.unstubAllGlobals()
  }
}, 9000)

// An engine that records what the wheel asks of it.
function recordingSound() {
  const log = {
    starts: 0,
    // The presses that waited for a leader countdown (counted in starts too), the beeps, and the music starts after one.
    countdownStarts: 0,
    beeps: 0,
    musicStarts: 0,
    ends: 0,
    landed: [] as number[],
    // The close-call flag each landing was told, and the seconds each cue was told.
    landedClose: [] as boolean[],
    cues: [] as number[],
    // Where the close call's release came: before the landing (a slip) or at it (a bend).
    events: [] as string[],
    breaks: 0,
    closed: 0,
    attached: 0,
    detached: 0,
    shares: [] as number[],
    ticks: [] as number[],
    applied: [] as SoundSettings[],
  }
  const engine: SoundEngine = {
    attach: () => {
      log.attached++
      return () => log.detached++
    },
    apply: (settings) => void log.applied.push(settings),
    spinStart: (countdown = false) => {
      log.starts++
      if (countdown) log.countdownStarts++
    },
    musicStart: () => void log.musicStarts++,
    beep: () => void log.beeps++,
    spinSpeed: (share) => void log.shares.push(share),
    pinTick: (share) => void log.ticks.push(share),
    spinEnd: () => {
      log.ends++
      log.events.push('end')
    },
    closeCall: (seconds) => void log.cues.push(seconds),
    closeCallBreak: () => {
      log.breaks++
      log.events.push('break')
    },
    landed: (seconds, closeCall = false) => {
      log.events.push('landed')
      log.landed.push(seconds)
      log.landedClose.push(closeCall)
    },
    revealClosed: () => void log.closed++,
  }
  return { engine, log }
}

async function spinSounds() {
  const { engine, log } = recordingSound()
  setupCrowd({ random: () => 0.5, sound: engine })
  await sleep(300)
  // The idle drift makes no sound.
  expect(log.ticks).toEqual([])
  expect(log.shares).toEqual([])
  expect(log.starts).toBe(0)
  fireEvent.click(spinButton())
  expect(log.starts).toBe(1)
  expect(log.ends).toBe(0)
  await screen.findByRole('dialog', undefined, { timeout: 5000 })
  expect(log.starts).toBe(1)
  expect(log.ends).toBe(1)
  // The landing cue fired once, and the music plays on while the reveal is open.
  expect(log.landed).toHaveLength(1)
  expect(log.closed).toBe(0)
  expect(log.ticks.length).toBeGreaterThan(0)
  expect(log.shares.length).toBeGreaterThan(5)
  expect(Math.max(...log.shares)).toBeLessThanOrEqual(1)
  expect(Math.max(...log.shares)).toBeGreaterThan(0.9)
  expect(log.shares[log.shares.length - 1]).toBeLessThan(0.15)
  // After the spin it is quiet again.
  const ticks = log.ticks.length
  const shares = log.shares.length
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await sleep(300)
  expect(log.ticks.length).toBe(ticks)
  expect(log.shares.length).toBe(shares)
  expect(log.starts).toBe(1)
  expect(log.closed).toBe(1)
}

test('a spin plays the projector, speed shares falling to the stop and pin ticks, and nothing else does', async () => {
  await spinSounds()
}, 9000)

test('reduced motion: the 1 s spin makes the same sounds', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  try {
    await spinSounds()
  } finally {
    vi.unstubAllGlobals()
  }
}, 9000)

test('the sound settings reach the engine without a spin, and the engine is attached once', async () => {
  const { engine, log } = recordingSound()
  const store = setup(['a', 'b'], { spinMs: 20, sound: engine })
  expect(log.attached).toBe(1)
  expect(log.applied.at(-1)).toEqual({ music: 100, effects: 100, volume: 70, muted: false })
  act(() => store.getState().setSoundVolume(35))
  expect(log.applied.at(-1)).toEqual({ music: 100, effects: 100, volume: 35, muted: false })
  act(() => store.getState().setSoundEffects(0))
  expect(log.applied.at(-1)).toEqual({ music: 100, effects: 0, volume: 35, muted: false })
  act(() => store.getState().setSoundMusic(0))
  expect(log.applied.at(-1)).toEqual({ music: 0, effects: 0, volume: 35, muted: false })
  expect(log.starts).toBe(0)
  cleanup()
  expect(log.detached).toBe(log.attached)
})

// A spin with the reveal open, on a recording engine, then `dismiss`.
async function dismissed(dismiss: () => void) {
  const { engine, log } = recordingSound()
  setup(['a', 'b'], { random: () => 0.5, spinMs: 20, sound: engine })
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(log.starts).toBe(1)
  expect(log.landed).toHaveLength(1)
  expect(log.closed).toBe(0)
  dismiss()
  expect(log.closed).toBe(1)
  expect(log.starts).toBe(1)
  cleanup()
  // Unmounting after the reveal closed does not fade again.
  expect(log.closed).toBe(1)
}

test('Watch fades the music', async () => {
  await dismissed(() => fireEvent.click(screen.getByRole('button', { name: 'Watch' })))
})

test('Save for Next Week fades the music', async () => {
  await dismissed(() =>
    fireEvent.click(screen.getByRole('button', { name: 'Save for Next Week' })),
  )
})

test('Close fades the music', async () => {
  await dismissed(() => fireEvent.click(screen.getByRole('button', { name: 'Close' })))
})

test('a wildcard landing cues the same way, and Back to the wheel fades the music', async () => {
  const { engine, log } = recordingSound()
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
      roster: [{ id: 'a', name: 'Ann', color: '#e6194b' }],
      night: { ...defaultState.night, presentIds: ['a'], nominations: { a: film(1) } },
    }),
  )
  const slices = deriveSlices(['a'], defaultWheelSettings, {})
  const total = slices.reduce((sum, s) => sum + s.weight, 0)
  const at = slices.findIndex((s) => s.kind === 'wildcard')
  const before = slices.slice(0, at).reduce((sum, s) => sum + s.weight, 0)
  const random = () => (before + slices[at].weight / 2) / total
  render(<App store={store} fetchFn={vi.fn()} random={random} spinMs={20} sound={engine} />)
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(log.landed).toHaveLength(1)
  expect(log.closed).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Back to the wheel' }))
  expect(log.closed).toBe(1)
})

test('unmounting with the reveal open fades the music', async () => {
  const { engine, log } = recordingSound()
  setup(['a', 'b'], { random: () => 0.5, spinMs: 20, sound: engine })
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(log.closed).toBe(0)
  cleanup()
  expect(log.closed).toBe(1)
})

test('a real spin lands with the reveal 0.65 s away', async () => {
  const { engine, log } = recordingSound()
  setupCrowd({ random: () => 0.5, sound: engine }, 1)
  fireEvent.click(spinButton())
  await waitFor(() => expect(log.landed).toEqual([0.65]), { timeout: 8000 })
}, 12000)

test('play() fires its cue once, on a frame at or after its time and before done', async () => {
  const { result } = renderHook(() => useWheelMotion(false, []))
  const events: string[] = []
  const path = { durationMs: 300, rotationAt: (ms: number) => ms / 10 }
  act(() => {
    result.current.play(path, () => events.push('done'), [{ atMs: 100, fire: () => events.push('cue') }])
  })
  await waitFor(() => expect(events).toContain('done'))
  expect(events).toEqual(['cue', 'done'])
})

test('play() fires a cue at 0 on the first frame, and with no cue calls nothing extra', async () => {
  const { result } = renderHook(() => useWheelMotion(false, []))
  const events: string[] = []
  const path = { durationMs: 100, rotationAt: (ms: number) => ms / 10 }
  act(() => {
    result.current.play(path, () => events.push('done'), [{ atMs: 0, fire: () => events.push('cue') }])
  })
  await waitFor(() => expect(events).toContain('done'))
  expect(events).toEqual(['cue', 'done'])
  events.length = 0
  act(() => {
    result.current.play(path, () => events.push('done'))
  })
  await waitFor(() => expect(events).toEqual(['done']))
})

const stage = () => document.querySelector<HTMLElement>('.wheel-stage')!
// 0.01 draws the first slice and rests just past its pinned edge, across from another viewer's film.
const closeCallRandom = () => 0.01

test('a close-call spin cues once before the landing, zooms from the cue and clears the zoom as the reveal opens', async () => {
  const { engine, log } = recordingSound()
  let commits = 0
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: {        viewersHidden: false,
        wheel: { ...defaultWheelSettings, wildcardsPerViewer: false, wildcardCount: 0, defaultSlices: 12 },
      },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
      ],
      night: {
        ...defaultState.night,
        presentIds: ['a', 'b'],
        nominations: { a: film(1), b: film(2) },
      },
    }),
  )
  render(
    <Profiler id="app" onRender={() => void commits++}>
      <App store={store} fetchFn={vi.fn()} random={closeCallRandom} spinMs={400} sound={engine} />
    </Profiler>,
  )
  await sleep(50)
  const before = commits
  expect(stage().dataset.zoom).toBeUndefined()
  fireEvent.click(spinButton())
  await waitFor(() => expect(log.cues).toHaveLength(1))
  expect(log.landed).toHaveLength(0)
  await waitFor(() => expect(stage().dataset.zoom).toBe('in'))
  await screen.findByRole('dialog')
  expect(log.cues).toHaveLength(1)
  expect(log.landedClose).toEqual([true])
  expect(log.landed).toEqual([0])
  expect(stage().dataset.zoom).toBeUndefined()
  expect(screen.getByText('Close call')).toBeInTheDocument()
  expect(commits - before).toBeLessThan(10)
})

test('a spin that rests mid-slice makes no cue, no zoom and an ordinary landing', async () => {
  const { engine, log } = recordingSound()
  setupCrowd({ random: () => 0.5, spinMs: 200, sound: engine })
  fireEvent.click(spinButton())
  await sleep(100)
  expect(stage().dataset.zoom).toBeUndefined()
  await screen.findByRole('dialog')
  expect(log.cues).toEqual([])
  expect(log.landedClose).toEqual([false])
  expect(stage().dataset.zoom).toBeUndefined()
  expect(screen.queryByText('Close call')).toBeNull()
})

test('the winner is the drawn slice, close call or not: a bend rests the pointer just past the pin, in the neighbor, with the flapper still on the drawn film', async () => {
  setupCrowd({ random: closeCallRandom, spinMs: 30 }, 6)
  fireEvent.click(spinButton())
  const dialog = await screen.findByRole('dialog')
  const settings = { ...defaultWheelSettings, wildcardsPerViewer: false, wildcardCount: 0, defaultSlices: 12 }
  const slices = deriveSlices(['a', 'b', 'c'], settings, {})
  const arcs = sliceArcs(slices)
  const drawn = drawSlice(slices, closeCallRandom)
  expect(drawn).toBe(0)
  const rest = angleUnderPointer(wheelRotation())
  expect(closeCallKind(slices, arcs, drawn, rest)).toBe('bend')
  expect(rest).toBeGreaterThan(350)
  // The reveal is the drawn slice's film, not the neighbor the pointer's line is in.
  expect(within(dialog).getByText('Nominated by Ann')).toBeInTheDocument()
})

test('without spinMs a close call holds its zoom after the landing and opens the reveal 2 s later', async () => {
  const { engine, log } = recordingSound()
  setupCrowd({ random: closeCallRandom, sound: engine }, 5)
  fireEvent.click(spinButton())
  await screen.findByTestId('flicker', undefined, { timeout: 14000 })
  const landedAt = Date.now()
  expect(log.cues).toHaveLength(1)
  expect(log.landed).toEqual([2])
  expect(log.landedClose).toEqual([true])
  expect(stage().dataset.zoom).toBe('in')
  await sleep(1300)
  expect(stage().dataset.zoom).toBe('out')
  expect(screen.queryByRole('dialog')).toBeNull()
  await screen.findByRole('dialog', undefined, { timeout: 2000 })
  expect(Date.now() - landedAt).toBeGreaterThanOrEqual(1900)
  expect(stage().dataset.zoom).toBeUndefined()
}, 25000)

test('reduced motion: a close call keeps its sounds, has no stretch or zoom, and lands in about a second', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: closeCallRandom, sound: engine }, 6)
    const pressedAt = Date.now()
    fireEvent.click(spinButton())
    await waitFor(() => expect(log.cues).toHaveLength(1))
    expect(stage().dataset.zoom).toBeUndefined()
    await screen.findByRole('dialog', undefined, { timeout: 2500 })
    expect(Date.now() - pressedAt).toBeLessThan(1800)
    expect(log.landed).toEqual([0])
    expect(log.landedClose).toEqual([true])
    expect(stage().dataset.zoom).toBeUndefined()
    expect(screen.getByText('Close call')).toBeInTheDocument()
  } finally {
    vi.unstubAllGlobals()
  }
}, 8000)

function withQuery(query: string) {
  window.history.pushState({}, '', `/${query}`)
  return () => window.history.pushState({}, '', '/')
}

test('without the debug flag there is no Force close calls checkbox', () => {
  setupCrowd({ random: () => 0.5, spinMs: 20 })
  expect(screen.queryByLabelText('Force close calls')).toBeNull()
})

test('with the debug flag the checkbox shows, starts unchecked and locks during a spin and its reveal', async () => {
  const restore = withQuery('?debug')
  try {
    setupCrowd({ random: () => 0.5, spinMs: 20 }, 6)
    const box = screen.getByLabelText('Force close calls')
    expect(box).not.toBeChecked()
    expect(box).toBeEnabled()
    fireEvent.click(spinButton())
    expect(box).toBeDisabled()
    await screen.findByRole('dialog')
    expect(box).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(box).toBeEnabled()
  } finally {
    restore()
  }
})

test('checked, a mid-slice random still lands on the drawn slice but is a close call; unchecked it is ordinary', async () => {
  const restore = withQuery('?debug')
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: () => 0.5, spinMs: 30, sound: engine }, 6)
    const slices = deriveSlices(['a', 'b', 'c'], { ...defaultWheelSettings, wildcardsPerViewer: false, wildcardCount: 0, defaultSlices: 12 }, {})
    const arcs = sliceArcs(slices)
    // The same slice that drawSlice picks for 0.5, whichever way the rest point is chosen.
    const drawn = drawSlice(slices, () => 0.5)
    fireEvent.click(screen.getByLabelText('Force close calls'))
    fireEvent.click(spinButton())
    await screen.findByRole('dialog')
    expect(log.cues).toHaveLength(1)
    expect(log.landedClose).toEqual([true])
    const rest = angleUnderPointer(wheelRotation())
    expect(rest).toBeGreaterThanOrEqual(arcs[drawn].start)
    expect(rest).toBeLessThan(arcs[drawn].end)
    expect(isCloseCall(slices, arcs, drawn, rest)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByLabelText('Force close calls'))
    fireEvent.click(spinButton())
    await screen.findByRole('dialog')
    expect(log.cues).toHaveLength(1)
    expect(log.landedClose).toEqual([true, false])
  } finally {
    restore()
  }
})

test('a share of ordinary spins are steered into a close call, keeping the winner; the rest are not', async () => {
  const sequence = (...values: number[]) => {
    let i = 0
    return () => values[Math.min(i++, values.length - 1)]
  }
  const { engine, log } = recordingSound()
  // The draw and the rest point are mid-slice; then the chance roll comes up under the share, and the zone and the point in it follow.
  setupCrowd({ random: sequence(0.5, 0.5, 0.1, 0.5, 0.5), spinMs: 40, sound: engine }, 6)
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(log.cues).toHaveLength(1)
  expect(log.landedClose).toEqual([true])
  const slices = deriveSlices(['a', 'b', 'c'], { ...defaultWheelSettings, wildcardsPerViewer: false, wildcardCount: 0, defaultSlices: 12 }, {})
  const arcs = sliceArcs(slices)
  const drawn = drawSlice(slices, () => 0.5)
  const rest = angleUnderPointer(wheelRotation())
  expect(rest).toBeGreaterThanOrEqual(arcs[drawn].start)
  expect(rest).toBeLessThan(arcs[drawn].end)
  cleanup()
  const quiet = recordingSound()
  setupCrowd({ random: sequence(0.5, 0.5, 0.9, 0.5, 0.5), spinMs: 40, sound: quiet.engine })
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(quiet.log.cues).toEqual([])
  expect(quiet.log.landedClose).toEqual([false])
})

test('close calls are off at a spin Length under 5 s, even with the debug box, which is then disabled', async () => {
  const restore = withQuery('?debug')
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: closeCallRandom, spinMs: 30, sound: engine }, 4)
    expect(screen.getByLabelText(/Force close calls/)).toBeDisabled()
    fireEvent.click(spinButton())
    await screen.findByRole('dialog')
    expect(log.cues).toEqual([])
    expect(log.landedClose).toEqual([false])
    expect(screen.queryByText('Close call')).toBeNull()
  } finally {
    restore()
  }
})

test('a slip releases the tension (drumroll off, cymbal) before the landing; a bend releases it at the landing', async () => {
  // 0.01 rests 1.3° past the start pin (a bend); 0.99 draws the last slice but rests mid-slice, so steer into a slip.
  const settings = { ...defaultWheelSettings, wildcardsPerViewer: false, wildcardCount: 0, defaultSlices: 12 }
  const slices = deriveSlices(['a', 'b', 'c'], settings, {})
  const arcs = sliceArcs(slices)
  const bend = recordingSound()
  setupCrowd({ random: closeCallRandom, spinMs: 80, sound: bend.engine }, 6)
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(bend.log.events).toEqual(['end', 'break', 'landed'])
  expect(closeCallKind(slices, arcs, 0, angleUnderPointer(wheelRotation()))).toBe('bend')
  cleanup()
  const slip = recordingSound()
  // Draw slice 17, rest mid-slice, then the chance roll under the share, the zone (second of two) and its start.
  const rolls = [17.5 / 36, 0.5, 0.1, 0.9, 0.5]
  let i = 0
  setupCrowd({ random: () => rolls[Math.min(i++, rolls.length - 1)], spinMs: 80, sound: slip.engine }, 6)
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(slip.log.cues).toHaveLength(1)
  expect(slip.log.events).toEqual(['break', 'end', 'landed'])
  expect(slip.log.breaks).toBe(1)
  expect(closeCallKind(slices, arcs, 17, angleUnderPointer(wheelRotation()))).toBe('slip')
})

test('a slip starts the flash and the fanfare right after the cymbal, while the wheel is still creeping', async () => {
  const { engine, log } = recordingSound()
  // Draw slice 17, rest mid-slice, then the chance roll under the share and the slip zone with its start.
  const rolls = [17.5 / 36, 0.5, 0.1, 0.9, 0.5]
  let i = 0
  setupCrowd({ random: () => rolls[Math.min(i++, rolls.length - 1)], sound: engine }, 5)
  fireEvent.click(spinButton())
  await screen.findByTestId('flicker', undefined, { timeout: 20000 })
  // The landing came behind the cymbal and before the wheel stopped.
  expect(log.events).toEqual(['break', 'landed'])
  expect(log.ends).toBe(0)
  expect(log.landed[0]).toBeGreaterThanOrEqual(2)
  expect(screen.queryByRole('dialog')).toBeNull()
  await screen.findByRole('dialog', undefined, { timeout: 8000 })
  expect(log.events).toEqual(['break', 'landed', 'end'])
  expect(log.landed).toHaveLength(1)
}, 40000)

// A catch: the drawn slice (0.5 draws slice 18 of 36), a mid-slice natural rest, then the chance roll,
// the point in the catch zone and the peak bend.
const crowd = deriveSlices(['a', 'b', 'c'], { ...defaultWheelSettings, wildcardsPerViewer: false, wildcardCount: 0, defaultSlices: 12 }, {})
const crowdArcs = sliceArcs(crowd)
const crowdDrawn = drawSlice(crowd, () => 0.5)
const sequenceOf = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}
const tickCount = (ticks: number[]) => ticks.filter((share) => share === catchTickShare).length

test("a roll under a third steers an ordinary spin into the drawn slice's catch zone, at a 2 s Length too", async () => {
  const { engine, log } = recordingSound()
  setupCrowd({ random: sequenceOf(0.5, 0.5, 0.1, 0.5, 0.5), spinMs: 40, sound: engine }, 2)
  expect(catchZone(crowd, crowdArcs, crowdDrawn)).not.toBeNull()
  fireEvent.click(spinButton())
  const dialog = await screen.findByRole('dialog')
  const rest = angleUnderPointer(wheelRotation())
  expect(rest).toBeGreaterThanOrEqual(crowdArcs[crowdDrawn].start)
  expect(rest).toBeLessThan(crowdArcs[crowdDrawn].end)
  expect(isCatch(crowd, crowdArcs, crowdDrawn, rest)).toBe(true)
  expect(log.cues).toEqual([])
  expect(within(dialog).getByText(/Nominated by/)).toBeInTheDocument()
})

test('a roll at or above a third rests where the ordinary rest puts it', async () => {
  const { engine, log } = recordingSound()
  setupCrowd({ random: sequenceOf(0.5, 0.5, 0.9, 0.5, 0.5), spinMs: 40, sound: engine }, 2)
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  const rest = angleUnderPointer(wheelRotation())
  expect(isCatch(crowd, crowdArcs, crowdDrawn, rest)).toBe(false)
  expect(rest).toBeCloseTo((crowdArcs[crowdDrawn].start + edgeMargins(crowdArcs[crowdDrawn]).start + crowdArcs[crowdDrawn].end - edgeMargins(crowdArcs[crowdDrawn]).end) / 2, 6)
  expect(tickCount(log.ticks)).toBe(0)
})

test('a close call is never a catch', async () => {
  const { engine, log } = recordingSound()
  setupCrowd({ random: closeCallRandom, spinMs: 40, sound: engine }, 6)
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(log.cues).toHaveLength(1)
  expect(isCatch(crowd, crowdArcs, 0, angleUnderPointer(wheelRotation()))).toBe(false)
  expect(tickCount(log.ticks)).toBe(0)
})

test('a caught spin ticks once as the pin meets the tongue, before the stop; the landing follows the rock', async () => {
  const { engine, log } = recordingSound()
  setupCrowd({ random: sequenceOf(0.5, 0.5, 0.1, 0.5, 0.5), spinMs: 200, sound: engine }, 2)
  fireEvent.click(spinButton())
  await screen.findByRole('dialog')
  expect(tickCount(log.ticks)).toBe(1)
  expect(log.ends).toBe(1)
  expect(log.landed).toEqual([0])
})

test('reduced motion steers nothing into a catch, and nothing rocks or ticks for one', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: sequenceOf(0.5, 0.5, 0.1, 0.5, 0.5), sound: engine }, 2)
    fireEvent.click(spinButton())
    let last = wheelRotation()
    for (let i = 0; i < 60 && !screen.queryByRole('dialog'); i++) {
      await sleep(25)
      const now = wheelRotation()
      expect(now).toBeGreaterThanOrEqual(last - 1e-9)
      last = now
    }
    await screen.findByRole('dialog', undefined, { timeout: 3000 })
    const rest = angleUnderPointer(wheelRotation())
    expect(isCatch(crowd, crowdArcs, crowdDrawn, rest)).toBe(false)
    expect(rest).toBeCloseTo((crowdArcs[crowdDrawn].start + edgeMargins(crowdArcs[crowdDrawn]).start + crowdArcs[crowdDrawn].end - edgeMargins(crowdArcs[crowdDrawn]).end) / 2, 6)
    expect(tickCount(log.ticks)).toBe(0)
  } finally {
    vi.unstubAllGlobals()
  }
}, 8000)

test('without the debug flag there is no Force catches checkbox', () => {
  setupCrowd({ random: () => 0.5, spinMs: 20 })
  expect(screen.queryByLabelText('Force catches')).toBeNull()
})

test('with the debug flag Force catches shows, starts unchecked, locks during a spin and its reveal, and steers a mid-slice random into a catch', async () => {
  const restore = withQuery('?debug')
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: () => 0.5, spinMs: 40, sound: engine }, 2)
    const box = screen.getByLabelText('Force catches')
    expect(box).not.toBeChecked()
    expect(box).toBeEnabled()
    fireEvent.click(box)
    fireEvent.click(spinButton())
    expect(box).toBeDisabled()
    await screen.findByRole('dialog')
    expect(box).toBeDisabled()
    expect(isCatch(crowd, crowdArcs, crowdDrawn, angleUnderPointer(wheelRotation()))).toBe(true)
    expect(tickCount(log.ticks)).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(box).toBeEnabled()
  } finally {
    restore()
  }
})

test('with both boxes checked, a slice with a close-call zone gets a close call', async () => {
  const restore = withQuery('?debug')
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: () => 0.5, spinMs: 40, sound: engine }, 6)
    fireEvent.click(screen.getByLabelText('Force close calls'))
    fireEvent.click(screen.getByLabelText('Force catches'))
    fireEvent.click(spinButton())
    await screen.findByRole('dialog')
    expect(log.cues).toHaveLength(1)
    expect(isCatch(crowd, crowdArcs, crowdDrawn, angleUnderPointer(wheelRotation()))).toBe(false)
    expect(tickCount(log.ticks)).toBe(0)
  } finally {
    restore()
  }
})

// The leader countdown.
const dial = () => screen.queryByTestId('countdown')

test('without the debug flag there is no Force countdowns checkbox', () => {
  setupCrowd({ random: () => 0.5, spinMs: 20 })
  expect(screen.queryByLabelText('Force countdowns')).toBeNull()
})

test('with the debug flag Force countdowns shows beside the others, starts unchecked and locks during a spin and its reveal', async () => {
  const restore = withQuery('?debug')
  try {
    setupCrowd({ random: () => 0.5, spinMs: 20 }, 6)
    const boxes = screen.getAllByRole('checkbox').map((b) => b.parentElement!.textContent!.trim())
    expect(boxes.slice(-3).map((t) => t.replace(/ \(.*/, ''))).toEqual(['Force close calls', 'Force catches', 'Force countdowns'])
    const box = screen.getByLabelText('Force countdowns')
    expect(box).not.toBeChecked()
    expect(box).toBeEnabled()
    fireEvent.click(spinButton())
    expect(box).toBeDisabled()
    await screen.findByRole('dialog')
    expect(box).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(box).toBeEnabled()
  } finally {
    restore()
  }
})

test('a forced countdown runs 3, 2, 1 over the drifting wheel, switches the projector on once, then starts the music and spins', async () => {
  const restore = withQuery('?debug')
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: () => 0.5, spinMs: 20, sound: engine })
    fireEvent.click(screen.getByLabelText('Force countdowns'))
    await sleep(300)
    fireEvent.click(spinButton())
    expect(spinButton()).toBeDisabled()
    expect(log.starts).toBe(1)
    expect(log.countdownStarts).toBe(1)
    expect(log.musicStarts).toBe(0)
    expect(log.beeps).toBe(1)
    expect(dial()).toHaveTextContent('3')
    // The dial layers over the Spin hub, in the zoom wrapper, and the rotating group stays the wheel's own.
    expect(spinButton().compareDocumentPosition(dial()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(dial()!.parentElement).toBe(spinButton().parentElement)
    expect(document.querySelector('svg.wheel > g')!.contains(dial())).toBe(false)
    // The wheel keeps drifting under it, with no pin ticks.
    const before = wheelRotation()
    await sleep(200)
    expect(wheelRotation()).not.toBe(before)
    expect(log.ticks).toEqual([])
    await waitFor(() => expect(dial()).toHaveTextContent('2'), { timeout: 1000 })
    expect(log.beeps).toBe(2)
    await waitFor(() => expect(dial()).toHaveTextContent('1'), { timeout: 1000 })
    expect(log.beeps).toBe(3)
    expect(log.musicStarts).toBe(0)
    await screen.findByRole('dialog', undefined, { timeout: 3000 })
    expect(dial()).toBeNull()
    expect(log.beeps).toBe(3)
    expect(log.musicStarts).toBe(1)
    expect(log.starts).toBe(1)
    expect(log.ends).toBe(1)
    expect(log.landed).toHaveLength(1)
  } finally {
    restore()
  }
}, 9000)

test('a countdown spin that is a close call still cues, zooms and lands', async () => {
  const restore = withQuery('?debug')
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: () => 0.5, spinMs: 40, sound: engine }, 6)
    fireEvent.click(screen.getByLabelText('Force close calls'))
    fireEvent.click(screen.getByLabelText('Force countdowns'))
    fireEvent.click(spinButton())
    expect(dial()).not.toBeNull()
    await screen.findByRole('dialog', undefined, { timeout: 4000 })
    expect(log.musicStarts).toBe(1)
    expect(log.cues).toHaveLength(1)
    expect(log.landedClose).toEqual([true])
    expect(screen.getByText('Close call')).toBeInTheDocument()
  } finally {
    restore()
  }
}, 9000)

test('leaving mid-countdown starts no spin and plays no later beep', async () => {
  const restore = withQuery('?debug')
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: () => 0.5, spinMs: 20, sound: engine })
    fireEvent.click(screen.getByLabelText('Force countdowns'))
    fireEvent.click(spinButton())
    expect(dial()).not.toBeNull()
    cleanup()
    await sleep(1800)
    expect(log.beeps).toBe(1)
    expect(log.musicStarts).toBe(0)
    expect(log.ends).toBe(0)
    expect(log.landed).toEqual([])
  } finally {
    restore()
  }
})

test('with reduced motion there is no countdown even when forced', async () => {
  const restore = withQuery('?debug')
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  try {
    const { engine, log } = recordingSound()
    setupCrowd({ random: () => 0.99, sound: engine })
    fireEvent.click(screen.getByLabelText('Force countdowns'))
    fireEvent.click(spinButton())
    expect(dial()).toBeNull()
    await screen.findByRole('dialog', undefined, { timeout: 4000 })
    expect(log.beeps).toBe(0)
    expect(log.countdownStarts).toBe(0)
    expect(log.musicStarts).toBe(0)
  } finally {
    restore()
    vi.unstubAllGlobals()
  }
}, 9000)

test('a test-length spin rolls no countdown, however high the roll', () => {
  setupCrowd({ random: () => 0.9167, spinMs: 20 })
  fireEvent.click(spinButton())
  expect(dial()).toBeNull()
})

test('a roll in the top tenth shows the dial and changes nothing else about the spin', async () => {
  // Count the draws of a spin that rolls no countdown, then repeat it with its last draw (the roll) high.
  let calls = 0
  setupCrowd({ random: () => (calls++, 0.5) })
  fireEvent.click(spinButton())
  expect(dial()).toBeNull()
  await screen.findByRole('dialog', undefined, { timeout: 8000 })
  const plainRest = angleUnderPointer(wheelRotation())
  const plainTitle = within(screen.getByRole('dialog')).getByRole('heading', { level: 2 }).textContent
  cleanup()

  let i = 0
  setupCrowd({ random: () => (++i === calls ? 0.95 : 0.5) })
  fireEvent.click(spinButton())
  expect(dial()).not.toBeNull()
  expect(i).toBe(calls)
  await screen.findByRole('dialog', undefined, { timeout: 12000 })
  expect(angleUnderPointer(wheelRotation())).toBeCloseTo(plainRest, 6)
  expect(within(screen.getByRole('dialog')).getByRole('heading', { level: 2 }).textContent).toBe(plainTitle)
}, 30000)
