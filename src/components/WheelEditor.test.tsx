import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import App from '../App.tsx'
import WheelEditor from './WheelEditor.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'
import { cards } from '../wildcards/cards.ts'
import { header } from '../test/cells.ts'

function film(id: number): Nomination {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    year: 2000,
    posterPath: null,
    overview: 'A film.',
    runtime: 112,
    genres: [],
  }
}

function setup(extra: { random?: () => number; spinMs?: number } = { spinMs: 20 }, fffUnlocked = false) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, fffUnlocked, wheel: defaultWheelSettings },
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
  render(<App store={store} fetchFn={vi.fn()} {...extra} />)
  return store
}

const wedgeKinds = () => screen.getAllByTestId('wedge').map((w) => w.getAttribute('data-kind'))
const gear = () => screen.getByRole('button', { name: 'Settings' })
const openEditor = () => {
  fireEvent.click(gear())
  fireEvent.click(screen.getByRole('button', { name: 'Wheel settings' }))
}
const spin = () => screen.getByRole('button', { name: 'Spin' })

test('Wheel settings opens from the gear menu, which closes with it, and reopens', () => {
  setup()
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit wheel' })).not.toBeInTheDocument()
  openEditor()
  const drawer = screen.getByRole('dialog', { name: 'Wheel settings' })
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  expect(screen.getAllByTestId('wedge')).toHaveLength(8)
  expect(within(drawer).getByLabelText('Wildcard weight')).toBeInTheDocument()
  expect(within(drawer).queryByLabelText(/^(Weight|Slices) for /)).toBeNull()
  expect(within(drawer).queryByRole('heading', { name: 'Viewers' })).toBeNull()
  expect(document.activeElement).toBe(drawer)
  expect(within(drawer).queryByRole('heading', { name: 'Wheel settings' })).toBeNull()
  for (const name of ['Done', 'Close']) {
    expect(within(drawer).queryByRole('button', { name })).toBeNull()
  }
  expect(screen.queryByRole('button', { name: 'Change TMDB token' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Wheel settings' })).toBeNull()
  act(() => (drawer as HTMLDialogElement).close())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.activeElement).toBe(gear())
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  openEditor()
  expect(screen.getByRole('dialog', { name: 'Wheel settings' })).toBeInTheDocument()
})

// The dialog's rectangle, since jsdom has no layout: left 100, top 100, right 400, bottom 500.
function stubRect(dialog: HTMLElement) {
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
    left: 100, top: 100, right: 400, bottom: 500, width: 300, height: 400, x: 100, y: 100,
    toJSON: () => ({}),
  })
}
const at = (x: number, y: number) => ({ clientX: x, clientY: y })

test('Escape closes the popover, and so does a press that starts outside it and its click', () => {
  setup()
  openEditor()
  // dialog.close() stands in for Escape, which closes a modal dialog natively.
  act(() => (screen.getByRole('dialog') as HTMLDialogElement).close())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  openEditor()
  const drawer = screen.getByRole('dialog')
  stubRect(drawer)
  fireEvent.pointerDown(drawer, at(10, 10))
  fireEvent.click(drawer)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a press on the popover padding, or a slider drag released outside it, leaves it open', () => {
  setup()
  openEditor()
  const drawer = screen.getByRole('dialog')
  stubRect(drawer)
  fireEvent.pointerDown(drawer, at(110, 110))
  fireEvent.click(drawer)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.pointerDown(screen.getByLabelText('Wildcard weight'), at(200, 200))
  fireEvent.click(drawer)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

test('an outside press that ends without a click leaves the popover open', () => {
  setup()
  openEditor()
  const drawer = screen.getByRole('dialog')
  stubRect(drawer)
  fireEvent.pointerDown(drawer, at(10, 10))
  fireEvent.pointerCancel(drawer)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  // A click without a press of its own does nothing.
  fireEvent.click(drawer)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

describe('closing when the pointer leaves', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const move = (x: number, y: number) => fireEvent.pointerMove(document, at(x, y))
  const open = () => {
    setup()
    openEditor()
    const drawer = screen.getByRole('dialog')
    stubRect(drawer)
    return drawer
  }
  const isOpen = () => screen.queryByRole('dialog', { name: 'Wheel settings' }) !== null

  test('a pointer that has not been inside never closes it', () => {
    open()
    move(10, 10)
    move(20, 20)
    act(() => vi.advanceTimersByTime(1000))
    expect(isOpen()).toBe(true)
  })

  test('leaving closes it 150 ms later unless the pointer comes back', () => {
    open()
    move(200, 200)
    move(10, 10)
    act(() => vi.advanceTimersByTime(149))
    expect(isOpen()).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(isOpen()).toBe(false)
  })

  test('coming back in time keeps it open', () => {
    open()
    move(200, 200)
    move(10, 10)
    act(() => vi.advanceTimersByTime(100))
    move(200, 200)
    act(() => vi.advanceTimersByTime(1000))
    expect(isOpen()).toBe(true)
  })

  test('a press outside cancels the timer, and its click closes it', () => {
    const drawer = open()
    move(200, 200)
    move(10, 10)
    fireEvent.pointerDown(drawer, at(10, 10))
    act(() => vi.advanceTimersByTime(1000))
    expect(isOpen()).toBe(true)
    fireEvent.click(drawer)
    expect(isOpen()).toBe(false)
  })

  test('an outside press without a click restarts the timer', () => {
    const drawer = open()
    move(200, 200)
    move(10, 10)
    fireEvent.pointerDown(drawer, at(10, 10))
    fireEvent.pointerCancel(drawer)
    act(() => vi.advanceTimersByTime(149))
    expect(isOpen()).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(isOpen()).toBe(false)
  })

  test('a drag that leaves the popover waits for its release, then closes it after the delay', () => {
    open()
    move(200, 200)
    fireEvent.pointerMove(document, { ...at(10, 10), buttons: 1 })
    act(() => vi.advanceTimersByTime(1000))
    expect(isOpen()).toBe(true)
    fireEvent.pointerUp(document, at(10, 10))
    act(() => vi.advanceTimersByTime(150))
    expect(isOpen()).toBe(false)
  })

  test('the pointer leaving the document counts as leaving', () => {
    open()
    move(200, 200)
    fireEvent.pointerLeave(document.documentElement)
    act(() => vi.advanceTimersByTime(150))
    expect(isOpen()).toBe(false)
  })

  test('a device that cannot hover never closes it by moving', () => {
    vi.unstubAllGlobals()
    open()
    move(200, 200)
    move(10, 10)
    fireEvent.pointerLeave(document.documentElement)
    act(() => vi.advanceTimersByTime(1000))
    expect(isOpen()).toBe(true)
  })

  test('the Restore confirmation suspends it, and the pointer must come back in afterwards', () => {
    const drawer = open()
    move(200, 200)
    fireEvent.change(screen.getByLabelText('Weight per viewer'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restore All Defaults' }))
    const confirm = screen.getByRole('dialog', { name: 'Restore all wheel settings?' })
    move(10, 10)
    fireEvent.pointerLeave(document.documentElement)
    fireEvent.pointerDown(confirm, at(10, 10))
    fireEvent.click(confirm)
    act(() => vi.advanceTimersByTime(1000))
    expect(drawer).toBeInTheDocument()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(drawer).toHaveFocus()
    move(10, 10)
    act(() => vi.advanceTimersByTime(1000))
    expect(isOpen()).toBe(true)
    move(200, 200)
    move(10, 10)
    act(() => vi.advanceTimersByTime(150))
    expect(isOpen()).toBe(false)
  })
})

describe('Restore All Defaults', () => {
  const restore = () => screen.getByRole('button', { name: 'Restore All Defaults' })
  const confirmation = () => screen.queryByRole('dialog', { name: 'Restore all wheel settings?' })

  test('it sits at the bottom of the popover, outside the cards, and is enabled only once a setting has changed', () => {
    setup()
    openEditor()
    expect(restore().closest('.inset-card')).toBeNull()
    expect(restore().closest('fieldset')!.lastElementChild).toBe(restore())
    expect(restore()).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Wildcard weight'), { target: { value: '4' } })
    expect(restore()).toBeEnabled()
  })

  test('Cancel and Escape change nothing and leave the popover open', () => {
    const store = setup()
    openEditor()
    fireEvent.change(screen.getByLabelText('Wildcard weight'), { target: { value: '4' } })
    fireEvent.click(restore())
    expect(confirmation()).toBeInTheDocument()
    fireEvent.click(within(confirmation()!).getByRole('button', { name: 'Cancel' }))
    expect(confirmation()).toBeNull()
    expect(store.getState().settings.wheel.wildcardWeight).toBe(4)
    expect(screen.getByRole('dialog', { name: 'Wheel settings' })).toHaveFocus()

    fireEvent.click(restore())
    act(() => (confirmation() as unknown as HTMLDialogElement).close())
    expect(confirmation()).toBeNull()
    expect(store.getState().settings.wheel.wildcardWeight).toBe(4)
    expect(screen.getByRole('dialog', { name: 'Wheel settings' })).toHaveFocus()
  })

  test('Restore puts every setting back, keeps adjustments and leaves the popover open', () => {
    const store = setup()
    act(() => {
      const s = store.getState()
      s.setViewerSlices('a', 5)
      s.setWildcardsPerViewer(false)
      s.setWildcardCount(4)
      s.setWildcardWeight(4)
      s.setDefaultSlices(2)
      s.setDefaultWeight(7)
      s.setSpinSeconds(10)
      s.setSpinTurnsPerSecond(1.5)
    })
    openEditor()
    fireEvent.click(restore())
    fireEvent.click(within(confirmation()!).getByRole('button', { name: 'Restore' }))
    expect(store.getState().settings.wheel).toEqual(defaultWheelSettings)
    expect(store.getState().night.adjustments).toEqual({ a: { slices: 5 } })
    expect(confirmation()).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Wheel settings' })).toHaveFocus()
    expect(restore()).toBeDisabled()
  })
})

test('the Wildcard weight slider has its range and shows its value', () => {
  setup()
  openEditor()
  const el = screen.getByLabelText('Wildcard weight')
  expect([el.getAttribute('type'), el.getAttribute('min'), el.getAttribute('max'), el.getAttribute('step')]).toEqual([
    'range',
    '0.5',
    '20',
    '0.5',
  ])
  expect(el.closest('.slider')).toHaveTextContent('Wildcard weight1')
  expect(screen.queryByText('Nobody is on the wheel.')).toBeNull()
})

test('with nobody on the wheel the note sits under Wildcards', () => {
  const store = setup()
  act(() => store.getState().setPresent('a', false))
  act(() => store.getState().setPresent('b', false))
  openEditor()
  const note = screen.getByText('Nobody is on the wheel.')
  expect(note.previousElementSibling).toHaveTextContent('Wildcards')
})

test('the popover shows Wildcards, Wildcard Cards, Spin, Viewer Defaults and Sound cards and nothing of the old list', () => {
  setup()
  openEditor()
  const drawer = screen.getByRole('dialog', { name: 'Wheel settings' })
  const cards = drawer.querySelectorAll('.inset-card')
  expect(cards).toHaveLength(5)
  expect(within(cards[0] as HTMLElement).getByRole('heading', { name: 'Wildcards' })).toBeInTheDocument()
  expect(within(cards[0] as HTMLElement).getByRole('switch', { name: 'One per viewer' })).toBeChecked()
  expect(within(cards[0] as HTMLElement).getByRole('group', { name: 'Wildcard count' })).toBeInTheDocument()
  expect(within(cards[0] as HTMLElement).getByLabelText('Wildcard weight')).toBeInTheDocument()
  expect(within(cards[1] as HTMLElement).getByRole('heading', { name: 'Wildcard Cards' })).toBeInTheDocument()
  expect(within(cards[2] as HTMLElement).getByRole('heading', { name: 'Spin' })).toBeInTheDocument()
  expect(within(cards[3] as HTMLElement).getByRole('heading', { name: 'Viewer Defaults' })).toBeInTheDocument()
  expect(within(cards[3] as HTMLElement).getByRole('group', { name: 'Slices per viewer' })).toBeInTheDocument()
  expect(within(cards[3] as HTMLElement).getByLabelText('Weight per viewer')).toBeInTheDocument()
  expect(within(cards[4] as HTMLElement).getByRole('heading', { name: 'Sound' })).toBeInTheDocument()
  expect(within(cards[4] as HTMLElement).getByLabelText('Music')).toHaveValue('70')
  expect(within(cards[4] as HTMLElement).getByLabelText('Effects')).toHaveValue('70')
  expect(within(cards[4] as HTMLElement).getByLabelText('Volume')).toBeInTheDocument()
  // Sound comes last among the cards, and Restore All Defaults after it.
  expect(cards[4].nextElementSibling).toBe(screen.getByRole('button', { name: 'Restore All Defaults' }))
  for (const gone of [/Add wildcard/, /Remove wildcard/, /^Move slice/, /^Drag slice/, /Spread evenly/, /Reset to default/]) {
    expect(screen.queryByRole('button', { name: gone })).toBeNull()
  }
  expect(drawer.querySelector('ol')).toBeNull()
})

test('while One per viewer is on the count shows the viewers and is inert; off makes it live', () => {
  const store = setup()
  openEditor()
  const count = screen.getByRole('group', { name: 'Wildcard count' })
  expect(count.querySelector('output')).toHaveTextContent('2')
  expect(screen.getByRole('button', { name: 'Increase Wildcard count' })).toBeDisabled()
  fireEvent.keyDown(count, { key: 'ArrowUp' })
  expect(store.getState().settings.wheel.wildcardCount).toBe(3)

  fireEvent.click(screen.getByRole('switch', { name: 'One per viewer' }))
  expect(store.getState().settings.wheel.wildcardsPerViewer).toBe(false)
  expect(store.getState().settings.wheel.wildcardCount).toBe(2)
  expect(count.querySelector('output')).toHaveTextContent('2')
  fireEvent.click(screen.getByRole('button', { name: 'Increase Wildcard count' }))
  expect(wedgeKinds().filter((k) => k === 'wildcard')).toHaveLength(3)
})

test('the controls apply as they change: weight, defaults, and adjusted viewers keep theirs', () => {
  const store = setup()
  act(() => store.getState().setViewerSlices('a', 5))
  openEditor()
  fireEvent.change(screen.getByLabelText('Wildcard weight'), { target: { value: '4' } })
  expect(store.getState().settings.wheel.wildcardWeight).toBe(4)
  fireEvent.click(screen.getByRole('button', { name: 'Increase Slices per viewer' }))
  expect(store.getState().settings.wheel.defaultSlices).toBe(4)
  // Ann keeps 5, Bo follows the default: 5 + 4 nominations and two wildcards.
  expect(wedgeKinds()).toHaveLength(11)
  fireEvent.change(screen.getByLabelText('Weight per viewer'), { target: { value: '8' } })
  expect(store.getState().settings.wheel.defaultWeight).toBe(8)
  act(() => (screen.getByRole('dialog') as HTMLDialogElement).close())
  expect(header('Bo')).toHaveTextContent('4 slices · weight 8')
})

test('the Spin card shows and saves the length and intensity', () => {
  const store = setup()
  openEditor()
  const length = screen.getByLabelText('Length')
  const intensity = screen.getByLabelText('Intensity')
  expect(length.closest('.slider')!.querySelector('output')).toHaveTextContent('6 s')
  expect(length).toHaveAttribute('aria-valuetext', '6 s')
  expect(intensity.closest('.slider')!.querySelector('output')).toHaveTextContent('0.8 turns/s')
  expect(intensity).toHaveAttribute('aria-valuetext', '0.8 turns/s')
  fireEvent.change(length, { target: { value: '10' } })
  fireEvent.change(intensity, { target: { value: '1.5' } })
  expect(store.getState().settings.wheel.spinSeconds).toBe(10)
  expect(store.getState().settings.wheel.spinTurnsPerSecond).toBe(1.5)
  expect(length.closest('.slider')!.querySelector('output')).toHaveTextContent('10 s')
  expect(intensity.closest('.slider')!.querySelector('output')).toHaveTextContent('1.5 turns/s')
})

test('the gear hangs the popover under it and looks pressed while it is open', () => {
  setup()
  const rect = { top: 10, bottom: 50, left: 600, right: 640, width: 40, height: 40, x: 600, y: 10, toJSON: () => ({}) }
  vi.spyOn(gear(), 'getBoundingClientRect').mockReturnValue(rect)
  expect(gear()).not.toHaveClass('active')
  openEditor()
  expect(screen.getByRole('dialog').style.top).toBe('58px')
  expect(gear()).toHaveClass('active')
  act(() => (screen.getByRole('dialog') as HTMLDialogElement).close())
  expect(gear()).not.toHaveClass('active')
})

test('the gear and Wheel settings stay available during a spin and its reveal', async () => {
  setup({ random: () => 0.5, spinMs: 20 })
  fireEvent.click(spin())
  expect(gear()).toBeEnabled()
  await screen.findByRole('dialog')
  expect(gear()).toBeEnabled()
  fireEvent.click(gear())
  expect(screen.getByRole('button', { name: 'Wheel settings' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(gear()).toBeEnabled()
})

test('the popover opened during a spin keeps the Sound card live and locks the rest', async () => {
  const store = setup({ random: () => 0.5, spinMs: 20 })
  fireEvent.click(spin())
  await screen.findByRole('dialog')
  fireEvent.click(gear())
  fireEvent.click(screen.getByRole('button', { name: 'Wheel settings' }))
  const drawer = screen.getByRole('dialog', { name: 'Wheel settings' })
  for (const label of ['Wildcard weight', 'Weight per viewer', 'Length', 'Intensity'])
    expect(within(drawer).getByLabelText(label)).toBeDisabled()
  expect(within(drawer).getByRole('button', { name: 'Restore All Defaults' })).toBeDisabled()
  const volume = within(drawer).getByLabelText('Volume')
  expect(volume).toBeEnabled()
  fireEvent.change(volume, { target: { value: '35' } })
  fireEvent.change(within(drawer).getByLabelText('Music'), { target: { value: '0' } })
  fireEvent.change(within(drawer).getByLabelText('Effects'), { target: { value: '30' } })
  const wheel = store.getState().settings.wheel
  expect(wheel.soundVolume).toBe(35)
  expect(wheel.soundMusic).toBe(0)
  expect(wheel.soundEffects).toBe(30)
  // Closing the popover leaves the reveal open and usable.
  act(() => (drawer as HTMLDialogElement).close())
  fireEvent.click(screen.getByRole('button', { name: 'Watch' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('Wheel settings is disabled once the night has ended', () => {
  const store = setup()
  act(() => store.getState().endNight())
  fireEvent.click(gear())
  expect(screen.getByRole('button', { name: 'Wheel settings' })).toBeDisabled()
})

test('the Sound card shows and saves music, effects and volume', () => {
  const store = setup()
  openEditor()
  const volume = screen.getByLabelText('Volume')
  expect(volume.closest('.slider')!.querySelector('output')).toHaveTextContent('70%')
  expect(volume).toHaveAttribute('aria-valuetext', '70%')
  expect(volume).toHaveAttribute('step', '5')
  fireEvent.change(volume, { target: { value: '35' } })
  fireEvent.change(screen.getByLabelText('Music'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Effects'), { target: { value: '30' } })
  const wheel = store.getState().settings.wheel
  expect(wheel.soundVolume).toBe(35)
  expect(wheel.soundMusic).toBe(0)
  expect(wheel.soundEffects).toBe(30)
  expect(volume.closest('.slider')!.querySelector('output')).toHaveTextContent('35%')
  expect(screen.getByLabelText('Music').closest('.slider')!.querySelector('output')).toHaveTextContent('0%')
})

test('Volume comes first with a mute button, and Music and Effects are nested under it', () => {
  const store = setup()
  openEditor()
  const card = screen.getByRole('heading', { name: 'Sound' }).closest('section')!
  const sliders = Array.from(card.querySelectorAll('input[type="range"]')).map((i) => i.id)
  const label = (id: string) => card.querySelector(`label[for="${id}"]`)!.textContent
  expect(sliders.map(label)).toEqual(['Volume', 'Music', 'Effects'])
  const subs = screen.getByRole('group', { name: 'Levels under the volume' })
  expect(within(subs).getByLabelText('Music')).toBeInTheDocument()
  expect(within(subs).getByLabelText('Effects')).toBeInTheDocument()
  expect(within(subs).queryByLabelText('Volume')).toBeNull()
  const mute = screen.getByRole('button', { name: 'Mute' })
  expect(mute).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(mute)
  expect(store.getState().settings.wheel.soundMuted).toBe(true)
  expect(mute).toHaveAttribute('aria-pressed', 'true')
  // The levels are kept, and all three sliders grey out while muted.
  expect(store.getState().settings.wheel.soundVolume).toBe(70)
  for (const name of ['Volume', 'Music', 'Effects']) expect(screen.getByLabelText(name)).toBeDisabled()
  fireEvent.click(mute)
  expect(store.getState().settings.wheel.soundMuted).toBe(false)
  for (const name of ['Volume', 'Music', 'Effects']) expect(screen.getByLabelText(name)).toBeEnabled()
})

test('Music and Effects cannot be set above Volume, and come back when it rises', () => {
  const store = setup()
  openEditor()
  const music = screen.getByLabelText('Music')
  expect(music).toHaveAttribute('max', '70')
  fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '40' } })
  expect(music).toHaveAttribute('max', '40')
  expect(music).toHaveValue('40')
  // The stored level is kept, and shows again when Volume rises.
  expect(store.getState().settings.wheel.soundMusic).toBe(100)
  fireEvent.change(screen.getByLabelText('Volume'), { target: { value: '90' } })
  expect(screen.getByLabelText('Music')).toHaveValue('90')
})

test('Restore All Defaults is enabled by a sound setting alone, and resets it', () => {
  const store = setup()
  openEditor()
  const restore = screen.getByRole('button', { name: 'Restore All Defaults' })
  expect(restore).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Music'), { target: { value: '0' } })
  expect(restore).toBeEnabled()
  fireEvent.click(restore)
  expect(screen.getByText(/sound setting/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
  expect(store.getState().settings.wheel.soundMusic).toBe(100)
  expect(restore).toBeDisabled()
})

test('the Show labels switch hides every viewer label but keeps the wedges and the wildcard word', () => {
  const store = setup()
  openEditor()
  const card = screen.getByRole('heading', { name: 'Viewer Defaults' }).closest('fieldset')!
  const toggle = within(card as HTMLElement).getByRole('switch', { name: 'Show labels' })
  expect(toggle).toBeChecked()
  const wedgeCount = screen.getAllByTestId('wedge').length
  expect(screen.getAllByTestId('label-tag').length).toBeGreaterThan(0)
  fireEvent.click(toggle)
  expect(store.getState().settings.wheel.showLabels).toBe(false)
  expect(screen.queryAllByTestId('label-tag')).toHaveLength(0)
  expect(document.querySelectorAll('svg.wheel text.wheel-label:not(.wheel-label-word)')).toHaveLength(0)
  expect(screen.getAllByTestId('wedge')).toHaveLength(wedgeCount)
  expect(screen.getAllByTestId('wildcard-word').length).toBeGreaterThan(0)
  expect(screen.getAllByTestId('watermark').length).toBeGreaterThan(0)
  fireEvent.click(toggle)
  expect(screen.getAllByTestId('label-tag').length).toBeGreaterThan(0)
})

test('a locked drawer disables every control but the Sound card, tick clicks included', () => {
  const store = setup()
  cleanup()
  const onClosed = vi.fn()
  render(
    <AppStoreContext.Provider value={store}>
      <WheelEditor locked onClosed={onClosed} />
    </AppStoreContext.Provider>,
  )
  const before = store.getState().settings.wheel
  expect(screen.getByRole('switch', { name: 'One per viewer' })).toBeDisabled()
  expect(screen.getByLabelText('Wildcard weight')).toBeDisabled()
  expect(screen.getByRole('switch', { name: 'Show labels' })).toBeDisabled()
  expect(screen.getByRole('switch', { name: 'Wildcard wheel' })).toBeDisabled()
  expect(screen.getByLabelText('Weight per viewer')).toBeDisabled()
  expect(screen.getByLabelText('Length')).toBeDisabled()
  expect(screen.getByLabelText('Intensity')).toBeDisabled()
  expect(screen.getByLabelText('Music')).toBeEnabled()
  expect(screen.getByLabelText('Effects')).toBeEnabled()
  expect(screen.getByLabelText('Volume')).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Restore All Defaults' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Increase Slices per viewer' })).toBeDisabled()
  const slices = screen.getByRole('group', { name: 'Slices per viewer' })
  fireEvent.click(slices.querySelectorAll('.stepper-tick')[8])
  fireEvent.keyDown(slices, { key: 'ArrowUp' })
  expect(store.getState().settings.wheel).toEqual(before)
})

describe('the gear menu', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  const menu = () => document.getElementById('settings-menu')!
  const isShown = () => menu().dataset.popoverOpen === 'true'

  test('closes 150 ms after the pointer leaves it, but only once it has been inside', () => {
    setup()
    fireEvent.click(gear())
    expect(isShown()).toBe(true)
    fireEvent.pointerLeave(menu())
    act(() => vi.advanceTimersByTime(1000))
    expect(isShown()).toBe(true)

    fireEvent.pointerEnter(menu())
    fireEvent.pointerLeave(menu())
    act(() => vi.advanceTimersByTime(149))
    expect(isShown()).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(isShown()).toBe(false)
  })

  test('coming back in time keeps it open', () => {
    setup()
    fireEvent.click(gear())
    fireEvent.pointerEnter(menu())
    fireEvent.pointerLeave(menu())
    act(() => vi.advanceTimersByTime(100))
    fireEvent.pointerEnter(menu())
    act(() => vi.advanceTimersByTime(1000))
    expect(isShown()).toBe(true)
  })
})

test('with labels off and the viewer pane hidden, a dimmed key lists the viewers and their colors', () => {
  const store = setup()
  const key = () => screen.queryByRole('list', { name: "Tonight's viewers" })
  expect(key()).toBeNull()
  act(() => {
    store.getState().setShowLabels(false)
  })
  expect(key()).toBeNull()
  act(() => {
    store.getState().setViewersHidden(true)
  })
  const items = within(key()!).getAllByRole('listitem')
  expect(items).toHaveLength(store.getState().night.presentIds.length)
  const first = store.getState().roster.find((v) => v.id === store.getState().night.presentIds[0])!
  expect(items[0]).toHaveTextContent(first.name)
  expect((items[0].querySelector('.viewer-key-dot') as HTMLElement).style.background).not.toBe('')
  // A viewer's film shows under their name, and a winner drops off the key.
  const [firstId, secondId] = store.getState().night.presentIds
  act(() => store.getState().nominate(firstId, film(1)))
  expect(items[0]).toHaveTextContent('Film 1')
  act(() => store.getState().nominate(secondId, film(2)))
  act(() => store.getState().recordOutcome(film(1), 'watch', true))
  expect(within(key()!).getAllByRole('listitem')).toHaveLength(items.length - 1)
  act(() => {
    store.getState().setShowLabels(true)
  })
  expect(key()).toBeNull()
})

test('the Wildcard Cards card holds the Wildcard wheel switch, on by default', () => {
  const store = setup()
  openEditor()
  const card = screen.getByRole('heading', { name: 'Wildcard Cards' }).closest('fieldset')!
  const toggle = within(card as HTMLElement).getByRole('switch', { name: 'Wildcard wheel' })
  expect(toggle).toBeChecked()
  expect(toggle).toBeEnabled()
  fireEvent.click(toggle)
  expect(store.getState().settings.wheel.wildcardWheel).toBe(false)
  expect(toggle).not.toBeChecked()
  fireEvent.click(toggle)
  expect(store.getState().settings.wheel.wildcardWheel).toBe(true)
})

describe('choosing cards', () => {
  const choose = () => screen.getByRole('button', { name: 'Choose cards' })
  const overlay = () => screen.queryByRole('dialog', { name: 'Choose cards' })
  const listed = cards.filter((c) => !c.fff)

  test('the button shows how many listed cards are on, and an unknown id lowers nothing', () => {
    const store = setup()
    openEditor()
    expect(screen.getByText(`${listed.length} of ${listed.length} on`)).toBeInTheDocument()
    act(() => store.getState().setCardEnabled('gone-card', false))
    expect(screen.getByText(`${listed.length} of ${listed.length} on`)).toBeInTheDocument()
    act(() => store.getState().setCardEnabled('blind-spin', false))
    expect(screen.getByText(`${listed.length - 1} of ${listed.length} on`)).toBeInTheDocument()
  })

  test('the spins card has a switch among the wheel cards, and the counts include it', () => {
    setup()
    openEditor()
    expect(screen.getByText('21 of 21 on')).toBeInTheDocument()
    fireEvent.click(choose())
    expect(within(overlay()!).getByRole('switch', { name: 'Wildcard spins' })).toBeChecked()
  })

  test('the button is disabled while locked and while the Wildcard wheel switch is off', () => {
    const store = setup()
    openEditor()
    expect(choose()).toBeEnabled()
    fireEvent.click(screen.getByRole('switch', { name: 'Wildcard wheel' }))
    expect(choose()).toBeDisabled()
    cleanup()
    render(
      <AppStoreContext.Provider value={store}>
        <WheelEditor locked onClosed={vi.fn()} />
      </AppStoreContext.Provider>,
    )
    act(() => store.getState().setWildcardWheel(true))
    expect(choose()).toBeDisabled()
  })

  test('it lists a switch per card under Wheel cards and Movie cards, each with its description, and toggling applies at once', () => {
    const store = setup()
    openEditor()
    fireEvent.click(choose())
    const box = within(overlay()!)
    expect(box.getByRole('heading', { name: 'Wheel cards' })).toBeInTheDocument()
    expect(box.getByRole('heading', { name: 'Movie cards' })).toBeInTheDocument()
    expect(box.getAllByRole('switch')).toHaveLength(listed.length + 2)
    for (const card of listed) {
      expect(box.getByRole('switch', { name: card.name })).toHaveAccessibleDescription(card.description)
    }
    const blind = box.getByRole('switch', { name: 'Blind spin' })
    expect(blind).toBeChecked()
    fireEvent.click(blind)
    expect(store.getState().settings.wheel.disabledCards).toEqual(['blind-spin'])
    expect(blind).not.toBeChecked()
    expect(screen.getByText(`${listed.length - 1} of ${listed.length} on`)).toBeInTheDocument()
    fireEvent.click(blind)
    expect(store.getState().settings.wheel.disabledCards).toEqual([])
  })

  test('each group has a switch that turns all its cards on or off, and shows a dash when mixed', () => {
    const store = setup()
    openEditor()
    fireEvent.click(choose())
    const box = within(overlay()!)
    const wheelIds = listed.filter((c) => c.type === 'wheel').map((c) => c.id)
    const movieIds = listed.filter((c) => c.type === 'movie').map((c) => c.id)
    const wheelAll = box.getByRole('switch', { name: 'All wheel cards' }) as HTMLInputElement
    const movieAll = box.getByRole('switch', { name: 'All movie cards' }) as HTMLInputElement
    expect(wheelAll).toBeChecked()
    fireEvent.click(wheelAll)
    expect(store.getState().settings.wheel.disabledCards).toEqual(wheelIds)
    expect(wheelAll).not.toBeChecked()
    expect(movieAll).toBeChecked()
    expect(box.getByText(`0 of ${wheelIds.length} on`)).toBeInTheDocument()
    fireEvent.click(box.getByRole('switch', { name: 'Blind spin' }))
    expect(wheelAll.indeterminate).toBe(true)
    fireEvent.click(wheelAll)
    expect(store.getState().settings.wheel.disabledCards).toEqual([])
    fireEvent.click(movieAll)
    expect(store.getState().settings.wheel.disabledCards).toEqual(movieIds)
    expect(screen.getByText(`${wheelIds.length} of ${listed.length} on`)).toBeInTheDocument()
  })

  test('locked, there are two groups and no FFF cards; unlocked, a third group switches both FFF cards and the count covers them', () => {
    setup()
    openEditor()
    fireEvent.click(choose())
    expect(within(overlay()!).queryByRole('heading', { name: 'FFF cards' })).toBeNull()
    expect(within(overlay()!).queryByRole('switch', { name: 'Play Rento' })).toBeNull()
    expect(screen.getByText(`${listed.length} of ${listed.length} on`)).toBeInTheDocument()
    cleanup()

    const store = setup({ spinMs: 20 }, true)
    openEditor()
    const total = cards.length
    expect(screen.getByText(`${total} of ${total} on`)).toBeInTheDocument()
    fireEvent.click(choose())
    const box = within(overlay()!)
    expect(box.getByRole('heading', { name: 'FFF cards' })).toBeInTheDocument()
    const fffIds = cards.filter((c) => c.fff).map((c) => c.id)
    for (const card of cards.filter((c) => c.fff)) {
      expect(box.getByRole('switch', { name: card.name })).toHaveAccessibleDescription(card.description)
    }
    const all = box.getByRole('switch', { name: 'All FFF cards' })
    expect(all).toBeChecked()
    fireEvent.click(all)
    expect(store.getState().settings.wheel.disabledCards).toEqual(fffIds)
    expect(box.getByText(`0 of ${fffIds.length} on`)).toBeInTheDocument()
    expect(screen.getByText(`${total - fffIds.length} of ${total} on`)).toBeInTheDocument()
    fireEvent.click(all)
    expect(store.getState().settings.wheel.disabledCards).toEqual([])
  })

  test('Done, Escape and a press outside close it, focus returns to the button, and a press inside does not', () => {
    setup()
    openEditor()
    fireEvent.click(choose())
    fireEvent.click(within(overlay()!).getByRole('button', { name: 'Done' }))
    expect(overlay()).toBeNull()
    expect(choose()).toHaveFocus()

    fireEvent.click(choose())
    act(() => (overlay() as unknown as HTMLDialogElement).close())
    expect(overlay()).toBeNull()
    expect(choose()).toHaveFocus()

    fireEvent.click(choose())
    const box = overlay()!
    stubRect(box)
    fireEvent.pointerDown(box, at(200, 200))
    fireEvent.click(box)
    expect(overlay()).not.toBeNull()
    fireEvent.pointerDown(box, at(10, 10))
    fireEvent.click(box)
    expect(overlay()).toBeNull()
    expect(choose()).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Wheel settings' })).toBeInTheDocument()
  })

  test('with the overlay open the popover stays open when the pointer leaves it or a press lands outside', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: true, media: query }))
    try {
      setup()
      openEditor()
      const drawer = screen.getByRole('dialog', { name: 'Wheel settings' })
      stubRect(drawer)
      fireEvent.pointerMove(document, at(200, 200))
      fireEvent.click(choose())
      fireEvent.pointerMove(document, at(10, 10))
      fireEvent.pointerLeave(document.documentElement)
      act(() => vi.advanceTimersByTime(1000))
      expect(screen.queryByRole('dialog', { name: 'Wheel settings' })).not.toBeNull()
      const box = overlay()!
      stubRect(box)
      fireEvent.pointerDown(box, at(10, 10))
      fireEvent.click(box)
      expect(overlay()).toBeNull()
      expect(screen.queryByRole('dialog', { name: 'Wheel settings' })).not.toBeNull()
      // Back in the popover, the pointer must come in again before leaving counts.
      fireEvent.pointerMove(document, at(10, 10))
      act(() => vi.advanceTimersByTime(1000))
      expect(screen.queryByRole('dialog', { name: 'Wheel settings' })).not.toBeNull()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  test('Restore All Defaults stays disabled until a card is off, and its confirmation names the cards', () => {
    const store = setup()
    openEditor()
    const restore = () => screen.getByRole('button', { name: 'Restore All Defaults' })
    expect(restore()).toBeDisabled()
    act(() => store.getState().setCardEnabled('blind-spin', false))
    expect(restore()).toBeEnabled()
    act(() => store.getState().setCardEnabled('blind-spin', true))
    expect(restore()).toBeDisabled()
    act(() => store.getState().setCardEnabled('blind-spin', false))
    fireEvent.click(restore())
    const confirm = screen.getByRole('dialog', { name: 'Restore all wheel settings?' })
    expect(confirm).toHaveTextContent(/card switch/)
    fireEvent.click(within(confirm).getByRole('button', { name: 'Restore' }))
    expect(store.getState().settings.wheel.disabledCards).toEqual([])
  })
})
