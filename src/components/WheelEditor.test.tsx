import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import WheelEditor from './WheelEditor.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'
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

function setup(extra: { random?: () => number; spinMs?: number } = { spinMs: 20 }) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok', viewersHidden: false, wheel: defaultWheelSettings },
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

test('Escape and a backdrop click close the drawer, but a slider drag released over it does not', () => {
  setup()
  openEditor()
  // dialog.close() stands in for Escape, which closes a modal dialog natively.
  act(() => (screen.getByRole('dialog') as HTMLDialogElement).close())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  openEditor()
  const drawer = screen.getByRole('dialog')
  fireEvent.click(screen.getByLabelText('Wildcard weight'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.pointerDown(screen.getByLabelText('Wildcard weight'))
  fireEvent.click(drawer)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.pointerDown(drawer)
  fireEvent.click(drawer)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

test('the popover shows Wildcards, Spin and Defaults cards and nothing of the old list', () => {
  setup()
  openEditor()
  const drawer = screen.getByRole('dialog', { name: 'Wheel settings' })
  const cards = drawer.querySelectorAll('.inset-card')
  expect(cards).toHaveLength(3)
  expect(within(cards[0] as HTMLElement).getByRole('heading', { name: 'Wildcards' })).toBeInTheDocument()
  expect(within(cards[0] as HTMLElement).getByRole('switch', { name: 'One per viewer' })).toBeChecked()
  expect(within(cards[0] as HTMLElement).getByRole('group', { name: 'Wildcard count' })).toBeInTheDocument()
  expect(within(cards[0] as HTMLElement).getByLabelText('Wildcard weight')).toBeInTheDocument()
  expect(within(cards[1] as HTMLElement).getByRole('heading', { name: 'Spin' })).toBeInTheDocument()
  expect(within(cards[2] as HTMLElement).getByRole('heading', { name: 'Defaults' })).toBeInTheDocument()
  expect(within(cards[2] as HTMLElement).getByRole('group', { name: 'Slices per viewer' })).toBeInTheDocument()
  expect(within(cards[2] as HTMLElement).getByLabelText('Weight per viewer')).toBeInTheDocument()
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

test('the gear is unavailable during a spin and its reveal', async () => {
  setup({ random: () => 0.5, spinMs: 20 })
  fireEvent.click(spin())
  expect(gear()).toBeDisabled()
  await screen.findByRole('dialog')
  expect(gear()).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(gear()).toBeEnabled()
})

test('a locked drawer disables every control, tick clicks included', () => {
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
  expect(screen.getByLabelText('Weight per viewer')).toBeDisabled()
  expect(screen.getByLabelText('Length')).toBeDisabled()
  expect(screen.getByLabelText('Intensity')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Increase Slices per viewer' })).toBeDisabled()
  const slices = screen.getByRole('group', { name: 'Slices per viewer' })
  fireEvent.click(slices.querySelectorAll('.stepper-tick')[8])
  fireEvent.keyDown(slices, { key: 'ArrowUp' })
  expect(store.getState().settings.wheel).toEqual(before)
})
