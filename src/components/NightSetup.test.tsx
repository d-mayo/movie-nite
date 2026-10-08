import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { defaultState, type AppState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
import { header, markAway, markHere, openCell, removeViewer } from '../test/cells.ts'
import { createTmdbClient } from '../tmdb/client.ts'
import NightSetup from './NightSetup.tsx'

const film: Nomination = {
  tmdbId: 1,
  title: 'Film',
  year: 2000,
  posterPath: null,
  overview: '',
  runtime: 100,
  genres: [],
}

const people = [
  { id: 'a', name: 'Ann', color: '#e6194b' },
  { id: 'b', name: 'Bo', color: '#f58231' },
  { id: 'c', name: 'Cy', color: '#4363d8' },
  { id: 'd', name: 'Di', color: '#3cb44b' },
]

function mount(state: AppState, locked = false) {
  const store = createAppStore(createMemoryPersistence(state))
  const ui = (isLocked: boolean) => (
    <AppStoreContext.Provider value={store}>
      <NightSetup client={createTmdbClient('tok', vi.fn())} onAuthError={vi.fn()} locked={isLocked} />
    </AppStoreContext.Provider>
  )
  const view = render(ui(locked))
  return { store, rerender: (isLocked: boolean) => view.rerender(ui(isLocked)) }
}

function setup() {
  return mount({ ...defaultState, settings: { tmdbToken: 'tok' } })
}

function setupWith(
  night: Partial<typeof defaultState.night>,
  holdover: Nomination | null = null,
  roster = people.slice(0, 2),
  locked = false,
) {
  return mount(
    {
      ...defaultState,
      settings: { tmdbToken: 'tok' },
      roster,
      night: { ...defaultState.night, presentIds: roster.map((v) => v.id), ...night },
      holdover,
    },
    locked,
  )
}

function add(name: string) {
  fireEvent.change(screen.getByLabelText('Add a viewer'), {
    target: { value: name },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}

const names = () => Array.from(document.querySelectorAll('.cell-name')).map((n) => n.textContent)
const cellOf = (name: string) => header(name).closest('li')!

test('adding a guest puts them on the wheel, marking away lowers the headcount, removing deletes them', () => {
  setup()
  add(' Ann ')
  add('Bo')
  expect(screen.getByRole('button', { name: 'Ann is here' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('Headcount: 2')).toBeInTheDocument()

  markAway('Ann')
  expect(screen.getByText('Headcount: 1')).toBeInTheDocument()

  removeViewer('Bo')
  expect(screen.queryByText('Bo')).not.toBeInTheDocument()
  expect(screen.getByText('Headcount: 0')).toBeInTheDocument()
})

test('a duplicate name is not added', () => {
  setup()
  add('Ann')
  add('ann')
  expect(names()).toEqual(['Ann'])
})

test('cells list viewers on the wheel, then those who won, then those away, dimming the last two', () => {
  const four = people
  const store = setupWith(
    {
      presentIds: ['a', 'c', 'd'],
      nominations: { c: film },
      wonFilms: [1],
    },
    null,
    four,
  ).store
  expect(names()).toEqual(['Ann', 'Di', 'Cy', 'Bo'])
  expect(cellOf('Cy')).toHaveClass('dimmed')
  expect(cellOf('Bo')).toHaveClass('dimmed')
  expect(cellOf('Ann')).not.toHaveClass('dimmed')
  expect(cellOf('Di')).not.toHaveClass('dimmed')
  const headcount = screen.getByText('Headcount: 3')
  expect(headcount.compareDocumentPosition(cellOf('Ann')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  markAway('Cy')
  expect(store.getState().night.presentIds).toEqual(['a', 'd'])
  expect(names()).toEqual(['Ann', 'Di', 'Bo', 'Cy'])
  expect(within(cellOf('Cy')).getByText('Won tonight')).toBeInTheDocument()
})

test('a closed cell summarises the film and the slices and weight, or says what is missing', () => {
  const { store } = setupWith(
    { nominations: { a: film, c: { ...film, tmdbId: 2, title: 'Other' } }, wonFilms: [2], presentIds: ['a', 'b', 'c'] },
    null,
    [...people.slice(0, 3), people[3]],
  )
  const ann = within(cellOf('Ann'))
  expect(ann.getByText('Film (2000)')).toBeInTheDocument()
  expect(ann.getByText('3 slices · weight 5')).toBeInTheDocument()
  expect(within(cellOf('Bo')).getByText('No film yet')).toBeInTheDocument()

  act(() => store.getState().setViewerSlices('a', 4))
  expect(within(cellOf('Ann')).getByText('4 slices · weight 5')).toBeInTheDocument()

  const cy = within(cellOf('Cy'))
  expect(cy.getByText('Won tonight')).toBeInTheDocument()
  expect(cy.getByText('Other (2000)')).toBeInTheDocument()
  expect(cy.queryByText(/slices/)).toBeNull()
  expect(cy.queryByText('No film yet')).toBeNull()

  const di = within(cellOf('Di'))
  expect(di.queryByText(/slices/)).toBeNull()
})

test('the eye toggle marks a viewer away or here without opening or closing their cell', () => {
  const { store } = setupWith({}, null, people.slice(0, 3))
  const eye = screen.getByRole('button', { name: 'Ann is here' })
  expect(eye).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(eye)
  const away = screen.getByRole('button', { name: 'Ann is away' })
  expect(away).toHaveAttribute('aria-pressed', 'false')
  expect(store.getState().night.presentIds).toEqual(['b', 'c'])
  expect(header('Ann')).not.toHaveAttribute('aria-expanded', 'true')
  expect(names()).toEqual(['Bo', 'Cy', 'Ann'])
  fireEvent.click(away)
  expect(names()).toEqual(['Ann', 'Bo', 'Cy'])
  expect(header('Ann')).toHaveAttribute('aria-expanded', 'false')
})

test('an open cell shows its film control, colour, sliders and menu; an away cell does not open', () => {
  setupWith({ nominations: { a: film }, presentIds: ['a'] })
  openCell('Ann')
  expect(screen.getByRole('button', { name: 'Change film for Ann' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: "Ann's colour" })).toBeInTheDocument()
  const slices = screen.getByLabelText('Slices for Ann')
  expect(slices).toHaveAttribute('min', '1')
  expect(slices).toHaveAttribute('max', '12')
  expect(slices).toHaveAttribute('step', '1')
  expect(slices).toHaveValue('3')
  const weight = screen.getByLabelText('Weight for Ann')
  expect(weight).toHaveAttribute('min', '0.5')
  expect(weight).toHaveAttribute('max', '20')
  expect(weight).toHaveAttribute('step', '0.5')
  expect(weight).toHaveValue('5')
  expect(screen.getByRole('button', { name: 'More for Ann' })).toBeInTheDocument()

  // Bo is away: there is nothing to open.
  openCell('Bo')
  expect(header('Bo')).not.toHaveAttribute('aria-expanded')
  expect(screen.queryByRole('button', { name: "Bo's colour" })).toBeNull()
  expect(screen.queryByRole('button', { name: 'More for Bo' })).toBeNull()
})

test('a won viewer opens to only the colour and the menu', () => {
  setupWith({ nominations: { a: film }, wonFilms: [1] })
  openCell('Ann')
  expect(screen.getByRole('button', { name: "Ann's colour" })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'More for Ann' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Slices for Ann')).toBeNull()
  expect(screen.queryByLabelText('Search a film for Ann')).toBeNull()
})

test('slider moves save the layout from the derived wheel at once', () => {
  const { store } = setupWith({ nominations: { a: film }, presentIds: ['a'] })
  expect(store.getState().night.layout).toBeNull()
  openCell('Ann')
  fireEvent.change(screen.getByLabelText('Slices for Ann'), { target: { value: '4' } })
  expect(store.getState().night.layout?.viewers.a.slices).toBe(4)
  fireEvent.change(screen.getByLabelText('Weight for Ann'), { target: { value: '7.5' } })
  expect(store.getState().night.layout?.viewers.a.weight).toBe(7.5)
  expect(screen.getByLabelText('Slices for Ann')).toHaveValue('4')
  expect(within(cellOf('Ann')).getByText('4 slices · weight 7.5')).toBeInTheDocument()
})

test('Remove from roster asks first; Cancel and Escape keep the viewer, confirming removes them', () => {
  const { store } = setupWith({})
  function ask() {
    openCell('Bo')
    fireEvent.click(screen.getByRole('button', { name: 'More for Bo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove from roster' }))
    return screen.getByRole('dialog', { name: 'Remove Bo from the roster?' })
  }
  expect(screen.queryByRole('button', { name: 'Remove Bo' })).toBeNull()

  ask()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(store.getState().roster.map((v) => v.id)).toEqual(['a', 'b'])

  const dialog = ask()
  act(() => {
    dialog.dispatchEvent(new Event('close'))
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(store.getState().roster.map((v) => v.id)).toEqual(['a', 'b'])

  ask()
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(store.getState().roster.map((v) => v.id)).toEqual(['a'])

  store.getState().addViewer('Ed')
  expect(store.getState().roster[1].color).toBe('#f58231')
})

test('a viewer who won shows their film with no search or change control', () => {
  setupWith({ nominations: { a: film, b: { ...film, tmdbId: 2, title: 'Other' } }, wonFilms: [1] })
  expect(screen.getByText('Film (2000)')).toBeInTheDocument()
  expect(screen.getByText('Won tonight')).toBeInTheDocument()
  openCell('Ann')
  expect(screen.queryByLabelText('Search a film for Ann')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Change film for Ann' })).toBeNull()
  openCell('Bo')
  expect(screen.getByRole('button', { name: 'Change film for Bo' })).toBeInTheDocument()
})

test('other viewers can still be marked away and removed after a win', () => {
  const { store } = setupWith({ nominations: { a: film }, wonFilms: [1] })
  markAway('Bo')
  expect(store.getState().night.presentIds).toEqual(['a'])
  markHere('Bo')
  expect(store.getState().night.presentIds).toEqual(['a', 'b'])
  removeViewer('Bo')
  expect(store.getState().roster.map((v) => v.id)).toEqual(['a'])
})

test('a saved Watch next session film is shown below the cells and can be cleared', () => {
  const { store } = setupWith({}, film)
  expect(screen.getByText('Watch next session')).toBeInTheDocument()
  expect(screen.getAllByText('Film (2000)')).not.toHaveLength(0)
  const last = cellOf('Bo')
  expect(
    last.compareDocumentPosition(screen.getByText('Watch next session')) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear Watch next session film' }))
  expect(store.getState().holdover).toBeNull()
  expect(screen.queryByText('Watch next session')).toBeNull()
})

test('the Add a viewer field accepts at most 20 characters', () => {
  setup()
  expect(screen.getByLabelText('Add a viewer')).toHaveAttribute('maxlength', '20')
})

test('the Add control is disabled with a note once the roster is full, and frees on removal', () => {
  setup()
  for (let i = 0; i < 12; i++) add(`V${i}`)
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  expect(screen.getByText(/roster is full/)).toBeInTheDocument()
  removeViewer('V3')
  expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled()
  expect(screen.queryByText(/roster is full/)).toBeNull()
})

test('a swatch opens the presets, marks the own colour, disables taken ones and sets a free one', () => {
  const { store } = setupWith({})
  openCell('Ann')
  const swatch = screen.getByRole('button', { name: "Ann's colour" })
  fireEvent.click(swatch)
  const picker = document.getElementById('color-picker-a')!
  const buttons = within(picker).getAllByRole('button')
  expect(buttons).toHaveLength(12)
  expect(within(picker).getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(picker).getByRole('button', { name: "Orange, Bo's colour" })).toBeDisabled()
  expect(screen.queryByText(/custom/i)).toBeNull()

  fireEvent.click(within(picker).getByRole('button', { name: 'Blue' }))
  expect(store.getState().roster[0].color).toBe('#4363d8')
  expect(picker.dataset.popoverOpen).toBeUndefined()
})

test('the cell controls are disabled while the list is locked', () => {
  setupWith({}, null, people.slice(0, 1), true)
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeDisabled()
  expect(header('Ann')).toBeDisabled()
})

test('an away viewer keeps their film, still shown in their cell, and has it again on return', () => {
  const { store } = setupWith({ nominations: { a: film } })
  markAway('Ann')
  expect(store.getState().night.nominations.a.tmdbId).toBe(1)
  expect(within(cellOf('Ann')).getByText('Film (2000)')).toBeInTheDocument()
  expect(within(cellOf('Ann')).queryByText(/slices/)).toBeNull()
  markHere('Ann')
  expect(within(cellOf('Ann')).getByText('Film (2000)')).toBeInTheDocument()
})
