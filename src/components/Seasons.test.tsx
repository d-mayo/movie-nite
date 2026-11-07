import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { debugControl, openDebug, closeDebug } from '../test/debug.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'
import { silentSound, type SoundEngine } from '../sound/engine.ts'

function film(id: number): Nomination {
  return { tmdbId: id, title: `Film ${id}`, year: 2000, posterPath: null, overview: 'A film.', runtime: 112, genres: [] }
}

function setup(today?: Date, wheel = {}, sound?: SoundEngine) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, debugEnabled: true, wheel: { ...defaultWheelSettings, ...wheel } },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
      ],
      night: { ...defaultState.night, presentIds: ['a', 'b'], nominations: { a: film(1), b: film(2) } },
    }),
  )
  render(<App store={store} fetchFn={vi.fn()} random={() => 0.5} spinMs={20} today={today} sound={sound} />)
  return store
}

const gear = () => screen.getByRole('button', { name: 'Settings' })
const openEditor = () => {
  fireEvent.click(gear())
  fireEvent.click(screen.getByRole('button', { name: 'Wheel settings' }))
  return screen.getByRole('dialog', { name: 'Wheel settings' })
}
const seasonsCard = () => screen.getByRole('heading', { name: 'Seasons', level: 3 }).closest('fieldset') as HTMLElement
const dec10 = new Date(2026, 11, 10)
const nov7 = new Date(2026, 10, 7)

beforeEach(() => window.history.pushState({}, '', '/'))
afterEach(() => {
  vi.useRealTimers()
  window.history.pushState({}, '', '/')
})

test('the Seasons card names the season of the load date, with the switch on or off', () => {
  setup(dec10)
  openEditor()
  const card = within(seasonsCard())
  expect(card.getByRole('switch', { name: 'Seasonal themes' })).toBeChecked()
  expect(card.getByText('Now: Christmas')).toBeInTheDocument()
  fireEvent.click(card.getByRole('switch', { name: 'Seasonal themes' }))
  expect(card.getByText('Now: Christmas')).toBeInTheDocument()
})

test('outside every window the line reads None right now', () => {
  setup(nov7)
  openEditor()
  expect(within(seasonsCard()).getByText('None right now')).toBeInTheDocument()
})

test('the Seasons fieldset is disabled during a spin and enabled once the lock ends', async () => {
  setup(dec10)
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  openEditor()
  expect(seasonsCard()).toBeDisabled()
  cleanup()
  setup(dec10)
  openEditor()
  expect(seasonsCard()).toBeEnabled()
})

test('the date is read once, when the app mounts', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(dec10)
  const store = setup()
  vi.setSystemTime(nov7)
  openEditor()
  act(() => store.getState().setShowLabels(false))
  expect(within(seasonsCard()).getByText('Now: Christmas')).toBeInTheDocument()
})

test('Force season lists its options, starts at By date and locks during a spin', () => {
  window.history.pushState({}, '', '/?debug')
  setup(nov7)
  const select = within(openDebug()).getByLabelText('Force season') as HTMLSelectElement
  expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
    'By date',
    'None',
    'Halloween',
    'Christmas',
    "Valentine's Day",
  ])
  expect(select.value).toBe('')
  closeDebug()
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  expect(within(openDebug()).getByLabelText('Force season')).toBeDisabled()
})

test('Force season overrides the date and the switch in the Now line, and a remount starts at By date', () => {
  window.history.pushState({}, '', '/?debug')
  setup(nov7)
  fireEvent.change(debugControl('Force season'), { target: { value: 'christmas' } })
  closeDebug()
  openEditor()
  expect(within(seasonsCard()).getByText('Now: Christmas')).toBeInTheDocument()
  fireEvent.click(within(seasonsCard()).getByRole('switch', { name: 'Seasonal themes' }))
  expect(within(seasonsCard()).getByText('Now: Christmas')).toBeInTheDocument()
  cleanup()
  setup(dec10)
  fireEvent.change(debugControl('Force season'), { target: { value: 'none' } })
  closeDebug()
  openEditor()
  expect(within(seasonsCard()).getByText('None right now')).toBeInTheDocument()
  cleanup()
  setup(nov7)
  expect((debugControl('Force season') as HTMLSelectElement).value).toBe('')
})

const banner = () => {
  const header = screen.getByRole('banner')
  return {
    img: within(header).getByAltText('Movie Nite') as HTMLImageElement,
    source: header.querySelector('source') as HTMLSourceElement,
  }
}
const isChristmas = (b: ReturnType<typeof banner>) =>
  /christmas-light/.test(b.img.getAttribute('src')!) && /christmas-dark/.test(b.source.getAttribute('srcset')!)
const isPlain = (b: ReturnType<typeof banner>) =>
  /logo-light-transparent/.test(b.img.getAttribute('src')!) &&
  /logo-dark-transparent/.test(b.source.getAttribute('srcset')!) &&
  !/christmas/.test(b.img.getAttribute('src')! + b.source.getAttribute('srcset')!)

test('the banner shows the Christmas pair when Christmas is active, by date or by force', () => {
  setup(dec10)
  expect(isChristmas(banner())).toBe(true)
  cleanup()
  window.history.pushState({}, '', '/?debug')
  setup(nov7)
  expect(isPlain(banner())).toBe(true)
  fireEvent.change(debugControl('Force season'), { target: { value: 'christmas' } })
  closeDebug()
  expect(isChristmas(banner())).toBe(true)
  expect(banner().img.alt).toBe('Movie Nite')
})

test('the banner shows the plain pair with no theme, forced None, Halloween or Valentine\'s Day', () => {
  window.history.pushState({}, '', '/?debug')
  setup(dec10)
  for (const value of ['none', 'halloween', 'valentines']) {
    fireEvent.change(debugControl('Force season'), { target: { value } })
    closeDebug()
    expect(isPlain(banner()), value).toBe(true)
  }
  cleanup()
  setup(nov7)
  expect(isPlain(banner())).toBe(true)
})

test('turning Seasonal themes off brings back the plain logo, and on brings Christmas back', () => {
  setup(dec10)
  openEditor()
  const toggle = within(seasonsCard()).getByRole('switch', { name: 'Seasonal themes' })
  fireEvent.click(toggle)
  expect(isPlain(banner())).toBe(true)
  fireEvent.click(toggle)
  expect(isChristmas(banner())).toBe(true)
})

// A recording sound engine: the seasons it was told, in order.
function recordingSound() {
  const seasons: (string | null)[] = []
  const sound: SoundEngine = { ...silentSound, setSeason: (season) => void seasons.push(season) }
  return { sound, seasons }
}

test('the sound engine is told the active theme: Christmas by date, none when the switch is off, and a forced season', () => {
  const { sound, seasons } = recordingSound()
  setup(dec10, {}, sound)
  expect(seasons.at(-1)).toBe('christmas')
  openEditor()
  fireEvent.click(within(seasonsCard()).getByRole('switch', { name: 'Seasonal themes' }))
  expect(seasons.at(-1)).toBeNull()
  cleanup()
  window.history.pushState({}, '', '/?debug')
  const forced = recordingSound()
  setup(nov7, {}, forced.sound)
  expect(forced.seasons.at(-1)).toBeNull()
  fireEvent.change(debugControl('Force season'), { target: { value: 'christmas' } })
  expect(forced.seasons.at(-1)).toBe('christmas')
})
