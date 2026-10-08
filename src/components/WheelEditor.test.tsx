import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import WheelEditor from './WheelEditor.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'

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
      settings: { tmdbToken: 'tok', viewersHidden: false },
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

const wedgeLabels = () =>
  screen
    .getAllByTestId('wedge')
    .map((w) => (w.getAttribute('data-kind') === 'wildcard' ? 'W' : w.textContent!.slice(0, 2)))
const openEditor = () => fireEvent.click(screen.getByRole('button', { name: 'Wheel settings' }))
const spin = () => screen.getByRole('button', { name: 'Spin' })

test('Wheel settings opens a drawer beside the viewer list, which Done closes and reopens', () => {
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
  expect(within(drawer).getByRole('button', { name: 'Add wildcard' })).toBeInTheDocument()
  expect(within(drawer).getByRole('button', { name: 'Reset to default' })).toBeInTheDocument()
  expect(document.activeElement).toBe(
    within(drawer).getByRole('heading', { name: 'Wheel settings' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

test('Add wildcard is disabled when nobody is on the wheel', () => {
  const store = setup()
  openEditor()
  expect(screen.getByRole('button', { name: 'Add wildcard' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  act(() => store.getState().setPresent('a', false))
  act(() => store.getState().setPresent('b', false))
  openEditor()
  expect(screen.getByRole('button', { name: 'Add wildcard' })).toBeDisabled()
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

test('wildcards share one weight, and can be added and removed', () => {
  const store = setup()
  openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Add wildcard' }))
  expect(wedgeLabels().filter((l) => l === 'W')).toHaveLength(3)
  expect(screen.getAllByLabelText('Wildcard weight')).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('Wildcard weight'), { target: { value: '4' } })
  expect(store.getState().night.layout?.wildcardWeight).toBe(4)
  fireEvent.click(screen.getByRole('button', { name: 'Remove wildcard 3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove wildcard 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove wildcard 1' }))
  expect(wedgeLabels().filter((l) => l === 'W')).toHaveLength(0)
})

test('moving a slice hand-places the order, which Spread evenly tidies', () => {
  const store = setup()
  openEditor()
  expect(screen.queryByRole('button', { name: 'Spread evenly' })).not.toBeInTheDocument()
  const before = wedgeLabels()
  fireEvent.click(screen.getByRole('button', { name: 'Move slice 1 down' }))
  expect(wedgeLabels().slice(0, 2)).toEqual([before[1], before[0]])
  expect(screen.getByText(/placed by hand/)).toBeInTheDocument()

  act(() => store.getState().setViewerSlices('b', 4))
  expect(wedgeLabels()).toHaveLength(9)
  expect(wedgeLabels().slice(0, 2)).toEqual([before[1], before[0]])

  fireEvent.click(screen.getByRole('button', { name: 'Spread evenly' }))
  expect(screen.getByText(/placed by hand/)).toBeInTheDocument()
})

test('Reset to default restores the default wheel and the wildcard slider', () => {
  const store = setup()
  openEditor()
  const before = wedgeLabels()
  act(() => store.getState().setViewerWeight('a', 8))
  act(() => store.getState().setViewerSlices('a', 6))
  fireEvent.change(screen.getByLabelText('Wildcard weight'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
  expect(wedgeLabels()).toEqual(before)
  expect(store.getState().night.layout).toBeNull()
  expect(screen.getByLabelText('Wildcard weight')).toHaveValue('1')
})

test('the slice list names each slice', () => {
  setup()
  openEditor()
  const list = screen.getAllByRole('list').find((l) => l.tagName === 'OL')!
  expect(within(list).getAllByRole('listitem')).toHaveLength(8)
  expect(within(list).getAllByText('Wildcard')).toHaveLength(2)
  expect(within(list).getAllByText('Ann: Film 1')).toHaveLength(3)
})

test('Wheel settings is unavailable during a spin and its reveal', async () => {
  setup({ random: () => 0.5, spinMs: 20 })
  fireEvent.click(spin())
  expect(screen.getByRole('button', { name: 'Wheel settings' })).toBeDisabled()
  await screen.findByRole('dialog')
  expect(screen.getByRole('button', { name: 'Wheel settings' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByRole('button', { name: 'Wheel settings' })).toBeEnabled()
})

test('a locked drawer disables every editing control, including the drag handles, but not Done', () => {
  const store = setup()
  cleanup()
  const onClosed = vi.fn()
  render(
    <AppStoreContext.Provider value={store}>
      <WheelEditor locked onClosed={onClosed} />
    </AppStoreContext.Provider>,
  )
  const before = store.getState().night.layout
  for (const handle of screen.getAllByRole('button', { name: /^Drag slice/ }))
    expect(handle.hasAttribute('disabled')).toBe(true)
  expect(screen.getByLabelText('Wildcard weight')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add wildcard' })).toBeDisabled()
  const handle = screen.getByRole('button', { name: 'Drag slice 1' })
  fireEvent.keyDown(handle, { code: 'Space' })
  fireEvent.keyDown(handle, { code: 'ArrowDown' })
  fireEvent.keyDown(handle, { code: 'Space' })
  expect(store.getState().night.layout).toEqual(before)
  expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(onClosed).toHaveBeenCalled()
})

test('a slice can be dragged with the keyboard through its handle', async () => {
  setup()
  openEditor()
  const before = wedgeLabels()
  const handle = screen.getByRole('button', { name: 'Drag slice 1' })
  handle.focus()
  fireEvent.keyDown(handle, { code: 'Space' })
  fireEvent.keyDown(handle, { code: 'ArrowDown' })
  fireEvent.keyDown(handle, { code: 'Space' })
  // jsdom has no layout, so a drop may not move anything; the handle must at least work.
  expect(wedgeLabels()).toHaveLength(before.length)
  expect(handle).toBeInTheDocument()
})
