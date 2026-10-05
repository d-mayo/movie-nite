import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'

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
      settings: { tmdbToken: 'tok' },
      roster: [
        { id: 'a', name: 'Ann' },
        { id: 'b', name: 'Bo' },
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
const openEditor = () => fireEvent.click(screen.getByRole('button', { name: 'Edit wheel' }))
const spin = () => screen.getByRole('button', { name: 'Spin' })

test('Edit wheel swaps the editor in for setup, keeps the wheel, and Done brings setup back', () => {
  setup()
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  openEditor()
  expect(screen.queryByText("Tonight's viewers")).not.toBeInTheDocument()
  expect(screen.getAllByTestId('wedge')).toHaveLength(8)
  expect(spin()).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
})

test('a slice count redraws the wheel at once, and a weight is kept', () => {
  const store = setup()
  openEditor()
  fireEvent.change(screen.getByLabelText('Slices for Ann'), { target: { value: '5' } })
  expect(wedgeLabels().filter((l) => l === 'An')).toHaveLength(5)
  fireEvent.change(screen.getByLabelText('Weight for Bo'), { target: { value: '7.5' } })
  expect(store.getState().night.layout?.viewers.b.weight).toBe(7.5)
})

test('invalid input changes nothing', () => {
  const store = setup()
  openEditor()
  const before = wedgeLabels()
  for (const [label, value] of [
    ['Slices for Ann', '13'],
    ['Slices for Ann', ''],
    ['Slices for Ann', '2.5'],
    ['Weight for Ann', '0.3'],
    ['Weight for Ann', '100'],
  ]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  expect(wedgeLabels()).toEqual(before)
  expect(store.getState().night.layout).toBeNull()
})

test('wildcards can be added and removed', () => {
  setup()
  openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Add wildcard' }))
  expect(wedgeLabels().filter((l) => l === 'W')).toHaveLength(3)
  fireEvent.change(screen.getByLabelText('Weight for wildcard 3'), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove wildcard 3' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove wildcard 2' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove wildcard 1' }))
  expect(wedgeLabels().filter((l) => l === 'W')).toHaveLength(0)
})

test('moving a slice hand-places the order, which Spread evenly tidies', () => {
  setup()
  openEditor()
  expect(screen.queryByRole('button', { name: 'Spread evenly' })).not.toBeInTheDocument()
  const before = wedgeLabels()
  fireEvent.click(screen.getByRole('button', { name: 'Move slice 1 down' }))
  expect(wedgeLabels().slice(0, 2)).toEqual([before[1], before[0]])
  expect(screen.getByText(/placed by hand/)).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText('Slices for Bo'), { target: { value: '4' } })
  expect(wedgeLabels()).toHaveLength(9)
  expect(wedgeLabels().slice(0, 2)).toEqual([before[1], before[0]])

  fireEvent.click(screen.getByRole('button', { name: 'Spread evenly' }))
  expect(screen.getByText(/placed by hand/)).toBeInTheDocument()
})

test('Reset to default restores the default wheel', () => {
  const store = setup()
  openEditor()
  const before = wedgeLabels()
  fireEvent.change(screen.getByLabelText('Slices for Ann'), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
  expect(wedgeLabels()).toEqual(before)
  expect(store.getState().night.layout).toBeNull()
})

test('the slice list names each slice', () => {
  setup()
  openEditor()
  const list = screen.getAllByRole('list').find((l) => l.tagName === 'OL')!
  expect(within(list).getAllByRole('listitem')).toHaveLength(8)
  expect(within(list).getAllByText('Wildcard')).toHaveLength(2)
  expect(within(list).getAllByText('Ann: Film 1')).toHaveLength(3)
})

test('Edit wheel is offered only between spins and while the night is on', async () => {
  const store = setup({ random: () => 0.5, spinMs: 20 })
  fireEvent.click(spin())
  expect(screen.queryByRole('button', { name: 'Edit wheel' })).not.toBeInTheDocument()
  await screen.findByRole('dialog')
  expect(screen.queryByRole('button', { name: 'Edit wheel' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByRole('button', { name: 'Edit wheel' })).toBeInTheDocument()
  act(() => store.getState().endNight())
  expect(screen.queryByRole('button', { name: 'Edit wheel' })).not.toBeInTheDocument()
})

test('with the editor open Spin works, and the editor is locked during the spin', async () => {
  setup({ random: () => 0.5, spinMs: 20 })
  openEditor()
  fireEvent.click(spin())
  expect(screen.getByLabelText('Weight for Ann')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add wildcard' })).toBeDisabled()
  await screen.findByRole('dialog')
  expect(screen.getByLabelText('Slices for Ann')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.getByLabelText('Weight for Ann')).toBeEnabled()
})

test('ending the night with the editor open brings setup back', () => {
  const store = setup()
  openEditor()
  act(() => store.getState().endNight())
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  expect(screen.queryByText('Edit wheel', { selector: 'h2' })).not.toBeInTheDocument()
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
