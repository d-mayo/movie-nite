import { createRef } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { defaultState, type AppState, type LetterboxdLink, type Nomination, type Viewer } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
import { addViewer as add, header, markAway, markHere, openCell, removeViewer } from '../test/cells.ts'
import { createTmdbClient } from '../tmdb/client.ts'
import type { LetterboxdClient } from '../letterboxd/client.ts'
import { createWatchlistMemory, type WatchlistSource } from '../letterboxd/watchlist.ts'
import NightSetup from './NightSetup.tsx'
import { defaultWheelSettings } from '../wheel/edit.ts'

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

function mount(state: AppState, locked = false, waiting?: ReadonlySet<string>, watchlist?: WatchlistSource, fetchFn: typeof fetch = vi.fn()) {
  const store = createAppStore(createMemoryPersistence(state))
  const ui = (isLocked: boolean) => (
    <AppStoreContext.Provider value={store}>
      <NightSetup client={createTmdbClient('https://w.test', fetchFn)} locked={isLocked} letterboxdWaiting={waiting} watchlist={watchlist} onHide={vi.fn()} hideRef={createRef()} />
    </AppStoreContext.Provider>
  )
  const view = render(ui(locked))
  return { store, rerender: (isLocked: boolean) => view.rerender(ui(isLocked)) }
}

function setup() {
  return mount({ ...defaultState, settings: { viewersHidden: false, wheel: defaultWheelSettings } })
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
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
      roster,
      night: { ...defaultState.night, presentIds: roster.map((v) => v.id), ...night },
      holdover,
    },
    locked,
  )
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
  expect(cellOf('Ann').querySelector('.cell-summary')).toHaveTextContent('3 slices · weight 5')
  expect(within(cellOf('Bo')).getByText('No film yet')).toBeInTheDocument()

  act(() => store.getState().setViewerSlices('a', 4))
  expect(cellOf('Ann').querySelector('.cell-summary')).toHaveTextContent('4 slices · weight 5')

  const cy = within(cellOf('Cy'))
  expect(cy.getByText('Won tonight')).toBeInTheDocument()
  expect(cy.getByText('Other (2000)')).toBeInTheDocument()
  expect(cy.queryByText(/slices/)).toBeNull()
  expect(cy.queryByText('No film yet')).toBeNull()

  const di = within(cellOf('Di'))
  expect(di.queryByText(/slices/)).toBeNull()
  expect(di.getByText('Away')).toBeInTheDocument()
  expect(cy.queryByText('Away')).toBeNull()
  expect(within(cellOf('Ann')).queryByText('Away')).toBeNull()
})

test('a cell on the wheel shows slices and weight as two captioned figures, with no frame number', () => {
  const { store } = setupWith({ presentIds: ['a', 'b'] })
  const figures = () =>
    Array.from(cellOf('Ann').querySelectorAll('.cell-figure')).map((f) => [
      f.querySelector('b')!.textContent,
      f.querySelector('small')!.textContent,
    ])
  expect(figures()).toEqual([['3', 'slices'], ['5', 'weight']])
  act(() => store.getState().setViewerSlices('a', 1))
  expect(figures()[0]).toEqual(['1', 'slice'])
  expect(cellOf('Ann').querySelector('.cell-summary')).toHaveTextContent('1 slice · weight 5')
  expect(cellOf('Ann').textContent).toMatch(/^Ann/)
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

test('an open cell shows its film control, color, sliders and menu; an away cell does not open', () => {
  setupWith({ nominations: { a: film }, presentIds: ['a'] })
  openCell('Ann')
  expect(screen.getByRole('button', { name: 'Remove Film from Ann' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: "Ann's color" })).toBeInTheDocument()
  const slices = screen.getByRole('group', { name: 'Slices for Ann' })
  expect(slices.querySelector('output')).toHaveTextContent('3')
  const weight = screen.getByLabelText('Weight for Ann')
  expect(slices.closest('.inset-card')).toBe(weight.closest('.inset-card'))
  expect(slices.closest('.inset-card')).not.toBeNull()
  expect(weight).toHaveAttribute('min', '0.5')
  expect(weight).toHaveAttribute('max', '20')
  expect(weight).toHaveAttribute('step', '0.5')
  expect(weight).toHaveValue('5')
  expect(screen.getByRole('button', { name: 'More for Ann' })).toBeInTheDocument()

  // Bo is away: there is nothing to open.
  openCell('Bo')
  expect(header('Bo')).not.toHaveAttribute('aria-expanded')
  expect(screen.queryByRole('button', { name: "Bo's color" })).toBeNull()
  expect(screen.queryByRole('button', { name: 'More for Bo' })).toBeNull()
})

test('a won viewer has a cell that never opens', () => {
  setupWith({ nominations: { a: film }, wonFilms: [1] })
  openCell('Ann')
  expect(header('Ann')).not.toHaveAttribute('aria-expanded')
  expect(header('Ann')).not.toHaveAttribute('aria-controls')
  expect(screen.queryByRole('button', { name: "Ann's color" })).toBeNull()
  expect(screen.queryByRole('button', { name: 'More for Ann' })).toBeNull()
  openCell('Bo')
  expect(screen.getByRole('button', { name: "Bo's color" })).toBeInTheDocument()
})

test("a won viewer's eye toggle marks them away and here, and the cell still never opens", () => {
  const { store } = setupWith({ nominations: { a: film }, wonFilms: [1] })
  markAway('Ann')
  expect(store.getState().night.presentIds).toEqual(['b'])
  openCell('Ann')
  expect(header('Ann')).not.toHaveAttribute('aria-expanded')
  markHere('Ann')
  expect(store.getState().night.presentIds).toContain('a')
  expect(within(cellOf('Ann')).getByText('Film (2000)')).toBeInTheDocument()
  expect(within(cellOf('Ann')).getByText('Won tonight')).toBeInTheDocument()
  openCell('Ann')
  expect(header('Ann')).not.toHaveAttribute('aria-expanded')
  expect(screen.queryByRole('button', { name: "Ann's color" })).toBeNull()
})

test('slider moves are saved as adjustments at once', () => {
  const { store } = setupWith({ nominations: { a: film }, presentIds: ['a'] })
  expect(store.getState().night.adjustments).toEqual({})
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'Increase Slices for Ann' }))
  expect(store.getState().night.adjustments.a.slices).toBe(4)
  fireEvent.change(screen.getByLabelText('Weight for Ann'), { target: { value: '7.5' } })
  expect(store.getState().night.adjustments.a.weight).toBe(7.5)
  expect(screen.getByRole('group', { name: 'Slices for Ann' }).querySelector('output')).toHaveTextContent('4')
  expect(cellOf('Ann').querySelector('.cell-summary')).toHaveTextContent('4 slices · weight 7.5')
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
  expect(header('Ann')).not.toHaveAttribute('aria-expanded')
  expect(screen.queryByLabelText('Search a film for Ann')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Remove Film from Ann' })).toBeNull()
  openCell('Bo')
  expect(screen.getByRole('button', { name: 'Remove Other from Bo' })).toBeInTheDocument()
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

test('a saved Watch next session film is not shown in the viewer pane', () => {
  setupWith({}, film)
  expect(screen.queryByText('Watch next session')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Clear Watch next session film' })).toBeNull()
})

test('the pane has no Add form until the + is pressed, then a popup adds a trimmed name on Enter', () => {
  const { store } = setup()
  expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add a viewer' }))
  const field = screen.getByLabelText('Name')
  expect(field).toHaveFocus()
  expect(field).toHaveAttribute('maxlength', '20')
  fireEvent.change(field, { target: { value: ' Ann ' } })
  fireEvent.submit(field.closest('form')!)
  expect(store.getState().roster.map((v) => v.name)).toEqual(['Ann'])
  expect(store.getState().night.presentIds).toHaveLength(1)
  expect(screen.getByText('Headcount: 1')).toBeInTheDocument()
  expect(document.getElementById('add-viewer-popup')!.style.display).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Add a viewer' }))
  expect(screen.getByLabelText('Name')).toHaveValue('')
})

test('a blank or duplicate name keeps the popup open with an error, and Escape cancels', () => {
  const { store } = setup()
  add('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'Add a viewer' }))
  const field = screen.getByLabelText('Name')
  fireEvent.submit(field.closest('form')!)
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a name.')
  expect(field).toHaveAccessibleDescription('Enter a name.')
  fireEvent.change(field, { target: { value: 'ann' } })
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.submit(field.closest('form')!)
  expect(screen.getByRole('alert')).toHaveTextContent('Ann is already on the roster.')
  expect(field).toHaveValue('ann')
  expect(document.getElementById('add-viewer-popup')!.dataset.popoverOpen).toBe('true')
  expect(store.getState().roster).toHaveLength(1)
  fireEvent.keyDown(field, { key: 'Escape' })
  expect(document.getElementById('add-viewer-popup')!.dataset.popoverOpen).toBeUndefined()
  expect(store.getState().roster).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Add a viewer' }))
  expect(screen.getByLabelText('Name')).toHaveValue('')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('the + is crossed out and described once the roster is full, opens nothing, and frees on removal', () => {
  setup()
  for (let i = 0; i < 12; i++) add(`V${i}`)
  const plus = screen.getByRole('button', { name: 'Add a viewer' })
  expect(plus).toHaveAttribute('aria-disabled', 'true')
  expect(plus).toBeEnabled()
  expect(plus).toHaveAccessibleDescription('The roster is full')
  fireEvent.click(plus)
  expect(document.getElementById('add-viewer-popup')!.dataset.popoverOpen).toBeUndefined()
  removeViewer('V3')
  const freed = screen.getByRole('button', { name: 'Add a viewer' })
  expect(freed).not.toHaveAttribute('aria-disabled')
  fireEvent.click(freed)
  expect(document.getElementById('add-viewer-popup')!.dataset.popoverOpen).toBe('true')
})

test('during a spin the + is disabled, and with a full roster it is still crossed out', () => {
  const { rerender } = setup()
  for (let i = 0; i < 12; i++) add(`V${i}`)
  rerender(true)
  const plus = screen.getByRole('button', { name: 'Add a viewer' })
  expect(plus).toBeDisabled()
  expect(plus).toHaveAttribute('aria-disabled', 'true')
})

test('a swatch opens the presets, marks the own color, disables taken ones and sets a free one', () => {
  const { store } = setupWith({})
  openCell('Ann')
  const swatch = screen.getByRole('button', { name: "Ann's color" })
  fireEvent.click(swatch)
  const picker = document.getElementById('color-picker-a')!
  const buttons = within(picker).getAllByRole('button')
  expect(buttons).toHaveLength(12)
  expect(within(picker).getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true')
  expect(within(picker).getByRole('button', { name: "Orange, Bo's color" })).toBeDisabled()
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

test('the menu resets a viewer slices and weight, and is off when they are already the default', () => {
  const { store } = setupWith({ nominations: { a: film }, presentIds: ['a', 'b'] })
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'More for Ann' }))
  expect(screen.getByRole('button', { name: 'Reset slices and weight' })).toBeDisabled()

  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Increase Slices for Ann' }))
  fireEvent.change(screen.getByLabelText('Weight for Ann'), { target: { value: '12' } })
  act(() => store.getState().setViewerSlices('b', 2))
  expect(store.getState().night.adjustments.a).toEqual({ slices: 7, weight: 12 })
  fireEvent.click(screen.getByRole('button', { name: 'Reset slices and weight' }))
  expect(store.getState().night.adjustments.a).toBeUndefined()
  expect(store.getState().night.adjustments.b.slices).toBe(2)
  expect(screen.getByRole('group', { name: 'Slices for Ann' }).querySelector('output')).toHaveTextContent('3')
})

test('the X over a poster removes the film and the search takes its place', () => {
  const { store } = setupWith({ nominations: { a: film } })
  openCell('Ann')
  expect(screen.queryByLabelText('Search a film for Ann')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Film from Ann' }))
  expect(store.getState().night.nominations.a).toBeUndefined()
  expect(screen.getByLabelText('Search a film for Ann')).toBeInTheDocument()
  expect(within(cellOf('Ann')).getByText('No film yet')).toBeInTheDocument()
})

const resetAll = () => screen.getByRole('button', { name: 'Reset all slices and weights' })

test('the reset icon is off with no adjustment, and asks before resetting every viewer', () => {
  const { store } = setupWith({ presentIds: ['a', 'b'] })
  expect(screen.queryByRole('button', { name: 'More for all viewers' })).toBeNull()
  expect(resetAll()).toBeDisabled()

  act(() => store.getState().setViewerSlices('a', 7))
  act(() => store.getState().setViewerWeight('b', 12))
  expect(resetAll()).toBeEnabled()
  fireEvent.click(resetAll())
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveTextContent("Reset every viewer's slices and weight?")
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(Object.keys(store.getState().night.adjustments)).toHaveLength(2)

  fireEvent.click(resetAll())
  fireEvent.click(screen.getByRole('dialog').querySelector('.confirm-actions button.danger')!)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(store.getState().night.adjustments).toEqual({})
})

test('Escape on the reset confirmation changes nothing', () => {
  const { store } = setupWith({ presentIds: ['a', 'b'] })
  act(() => store.getState().setViewerSlices('a', 7))
  fireEvent.click(resetAll())
  act(() => {
    screen.getByRole('dialog').dispatchEvent(new Event('close'))
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(Object.keys(store.getState().night.adjustments)).toHaveLength(1)
})

test('the reset icon is disabled during a spin, and a pending confirmation does not come back', () => {
  const { store, rerender } = setupWith({ presentIds: ['a', 'b'] })
  act(() => store.getState().setViewerSlices('a', 7))
  fireEvent.click(resetAll())
  rerender(true)
  expect(resetAll()).toBeDisabled()
  expect(screen.queryByRole('dialog')).toBeNull()
  rerender(false)
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('an unadjusted viewer has no asterisk; adjusting shows it, and Reset removes it', () => {
  setupWith({ nominations: { a: film }, presentIds: ['a'] }, null, people.slice(0, 1))
  expect(within(cellOf('Ann')).queryByTitle('Adjusted tonight')).toBeNull()
  expect(header('Ann')).not.toHaveAccessibleName(/Adjusted tonight/)
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'More for Ann' }))
  expect(screen.getByRole('button', { name: 'Reset slices and weight' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'More for Ann' }))

  fireEvent.click(screen.getByRole('button', { name: 'Increase Slices for Ann' }))
  expect(within(cellOf('Ann')).getByTitle('Adjusted tonight')).toHaveTextContent('*')
  expect(header('Ann')).toHaveAccessibleName(/Adjusted tonight/)
  fireEvent.click(screen.getByRole('button', { name: 'More for Ann' }))
  expect(screen.getByRole('button', { name: 'Reset slices and weight' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Reset slices and weight' }))
  expect(within(cellOf('Ann')).queryByTitle('Adjusted tonight')).toBeNull()
  expect(screen.getByRole('group', { name: 'Slices for Ann' }).querySelector('output')).toHaveTextContent('3')
})

test('setting slices from 3 to 4 and back to 3 keeps the asterisk', () => {
  setupWith({ nominations: { a: film }, presentIds: ['a'] }, null, people.slice(0, 1))
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'Increase Slices for Ann' }))
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Slices for Ann' }))
  expect(within(cellOf('Ann')).getByTitle('Adjusted tonight')).toBeInTheDocument()
})

test('an away viewer keeps the asterisk, and Reset all is enabled for it alone and clears it', () => {
  const { store } = setupWith({ presentIds: ['a', 'b'] })
  expect(resetAll()).toBeDisabled()
  act(() => store.getState().setViewerSlices('b', 5))
  markAway('Bo')
  expect(within(cellOf('Bo')).getByTitle('Adjusted tonight')).toBeInTheDocument()
  expect(resetAll()).toBeEnabled()
  fireEvent.click(resetAll())
  fireEvent.click(screen.getByRole('dialog').querySelector('.confirm-actions button.danger')!)
  expect(within(cellOf('Bo')).queryByTitle('Adjusted tonight')).toBeNull()
  expect(store.getState().night.adjustments).toEqual({})
})

test('removing an adjusted viewer and adding one with the same name shows no asterisk', () => {
  const { store } = setupWith({ presentIds: ['a', 'b'] })
  act(() => store.getState().setViewerSlices('a', 5))
  removeViewer('Ann')
  add('Ann')
  expect(within(cellOf('Ann')).queryByTitle('Adjusted tonight')).toBeNull()
})

test('the summary shows the effective slices and weight', () => {
  const { store } = setupWith({ presentIds: ['a'] }, null, people.slice(0, 1))
  expect(cellOf('Ann').querySelector('.cell-summary')).toHaveTextContent('3 slices · weight 5')
  act(() => store.getState().setDefaultSlices(2))
  act(() => store.getState().setDefaultWeight(7))
  expect(cellOf('Ann').querySelector('.cell-summary')).toHaveTextContent('2 slices · weight 7')
})

// A night of Ann and Bo, Ann with the given Letterboxd link; `night` adds to the night.
function setupLinked(
  letterboxd: LetterboxdLink | undefined,
  { waiting, night = {} }: { waiting?: ReadonlySet<string>; night?: Partial<typeof defaultState.night> } = {},
) {
  const roster: Viewer[] = [{ ...people[0], letterboxd }, people[1]]
  return mount(
    {
      ...defaultState,
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
      roster,
      night: { ...defaultState.night, presentIds: ['a', 'b'], ...night },
    },
    false,
    waiting,
  )
}

const lbField = (name: string) => screen.getByLabelText(`Letterboxd profile for ${name}`)
const openLinkPopup = (name: string) => fireEvent.click(screen.getByRole('button', { name: `Link Letterboxd for ${name}` }))

afterEach(() => vi.unstubAllGlobals())

test('an unlinked open panel has a washed-out Letterboxd icon with a Link Letterboxd tooltip that opens a popup', () => {
  setupLinked(undefined)
  openCell('Ann')
  const icon = screen.getByRole('button', { name: 'Link Letterboxd for Ann' })
  expect(icon).toHaveAttribute('title', 'Link Letterboxd')
  expect(icon).toHaveClass('lb-panel-unlinked')
  openLinkPopup('Ann')
  expect(lbField('Ann')).toBeInTheDocument()
})

test('typing @Jo in the popup and pressing Link links jo at once', () => {
  const { store } = setupLinked(undefined)
  openCell('Ann')
  openLinkPopup('Ann')
  fireEvent.change(lbField('Ann'), { target: { value: '@Jo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Link' }))
  expect(store.getState().roster[0].letterboxd).toEqual({ username: 'jo', status: 'pending' })
  // The panel icon is now the profile link, with the username as its tooltip.
  const link = screen.getByRole('link', { name: 'Letterboxd profile jo' })
  expect(link).toHaveAttribute('href', 'https://letterboxd.com/jo/')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
})

test('a pasted profile address with Enter links the username', () => {
  const { store } = setupLinked(undefined)
  openCell('Ann')
  openLinkPopup('Ann')
  const field = lbField('Ann')
  fireEvent.change(field, { target: { value: 'https://letterboxd.com/Jo/films/' } })
  fireEvent.submit(field.closest('form')!)
  expect(store.getState().roster[0].letterboxd).toEqual({ username: 'jo', status: 'pending' })
})

test('an invalid entry says so in the popup and links nothing', () => {
  const { store } = setupLinked(undefined)
  openCell('Ann')
  openLinkPopup('Ann')
  fireEvent.change(lbField('Ann'), { target: { value: 'letterboxd.com/film/dune/' } })
  fireEvent.click(screen.getByRole('button', { name: 'Link' }))
  expect(screen.getByText("That isn't a Letterboxd username").closest('[role="status"]')).not.toBeNull()
  expect(store.getState().roster[0].letterboxd).toBeUndefined()
})

test('a linked panel icon shows the username as its tooltip, or the check state while pending', () => {
  setupLinked({ username: 'jo', status: 'found' })
  openCell('Ann')
  expect(screen.getByRole('link', { name: 'Letterboxd profile jo' })).toHaveAttribute('title', 'jo')
})

test('a pending panel icon says it is checking, or that Letterboxd cannot be reached, and the slices still change', () => {
  const { store } = setupLinked({ username: 'jo', status: 'pending' })
  openCell('Ann')
  expect(screen.getByRole('link', { name: 'Letterboxd profile jo' })).toHaveAttribute('title', 'jo: checking…')
  const slices = screen.getByRole('group', { name: 'Slices for Ann' })
  fireEvent.click(within(slices).getAllByRole('button').at(-1)!)
  expect(store.getState().night.adjustments.a?.slices).toBe(4)
})

test('with a retry waiting the panel icon says Letterboxd cannot be reached', () => {
  setupLinked({ username: 'jo', status: 'pending' }, { waiting: new Set(['a']) })
  openCell('Ann')
  expect(screen.getByRole('link', { name: 'Letterboxd profile jo' })).toHaveAttribute(
    'title',
    "jo: Letterboxd can't be reached, trying again soon",
  )
})

test('a missing profile is a dimmed warning in the panel, not a link, and Unlink Letterboxd in the menu clears it', () => {
  const { store } = setupLinked({ username: 'jo', status: 'missing' })
  openCell('Ann')
  const panel = within(document.querySelector('.cell-body') as HTMLElement)
  expect(panel.getByRole('img', { name: 'No Letterboxd profile called jo' })).toHaveAttribute('tabindex', '0')
  expect(panel.queryByRole('link')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'More for Ann' }))
  fireEvent.click(screen.getByRole('button', { name: 'Unlink Letterboxd' }))
  expect(store.getState().roster[0].letterboxd).toBeUndefined()
  expect(screen.getByRole('button', { name: 'Link Letterboxd for Ann' })).toBeInTheDocument()
})

test('Unlink Letterboxd in the menu is disabled while nothing is linked', () => {
  setupLinked(undefined)
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'More for Ann' }))
  expect(screen.getByRole('button', { name: 'Unlink Letterboxd' })).toBeDisabled()
})

const lbLinkIn = (name: string) => within(cellOf(name)).queryByRole('link')

test.each([
  ['on the wheel', {}],
  ['away', { presentIds: ['b'] }],
  ['won', { nominations: { a: film }, wonFilms: [1] }],
])('a found viewer %s has a Letterboxd link beside the name, outside the header button', (_, night) => {
  setupLinked({ username: 'jo', status: 'found' }, { night })
  const link = within(cellOf('Ann')).getByRole('link', { name: 'Ann on Letterboxd' })
  expect(link).toHaveAttribute('href', 'https://letterboxd.com/jo/')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']))
  // Hovering shows the username.
  expect(link).toHaveAttribute('title', 'jo')
  expect(link.getAttribute('tabindex')).not.toBe('-1')
  expect(header('Ann').contains(link)).toBe(false)
  // It is placed over the slot the header leaves after the name.
  expect(cellOf('Ann').querySelector('.cell-title .cell-lb-slot')).not.toBeNull()
  const expanded = header('Ann').getAttribute('aria-expanded')
  fireEvent.click(link)
  expect(header('Ann').getAttribute('aria-expanded')).toBe(expanded)
})

test('a pending viewer has a spinning icon named for the check', () => {
  setupLinked({ username: 'jo', status: 'pending' })
  const link = within(cellOf('Ann')).getByRole('link', { name: "Checking Ann's Letterboxd profile…" })
  expect(link).toHaveAttribute('title', 'jo: checking…')
  expect(within(link).getByTestId('lb-spinner')).toHaveClass('turning')
})

test('the pending spinner does not turn under reduced motion', () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }))
  setupLinked({ username: 'jo', status: 'pending' })
  expect(within(cellOf('Ann')).getByTestId('lb-spinner')).not.toHaveClass('turning')
})

test('a pending viewer with a retry waiting has the icon named for it', () => {
  setupLinked({ username: 'jo', status: 'pending' }, { waiting: new Set(['a']) })
  expect(
    within(cellOf('Ann')).getByRole('link', { name: "Can't reach Letterboxd for Ann, trying again soon" }),
  ).toBeInTheDocument()
})

test('a missing viewer has a focusable warning icon and no link; an unlinked one has nothing', () => {
  setupLinked({ username: 'jo', status: 'missing' })
  expect(lbLinkIn('Ann')).toBeNull()
  const icon = within(cellOf('Ann')).getByRole('img', { name: 'No Letterboxd profile called jo' })
  expect(icon).toHaveAttribute('tabindex', '0')
  expect(icon).toHaveAttribute('title', 'No Letterboxd profile called jo')
  expect(lbLinkIn('Bo')).toBeNull()
  expect(cellOf('Bo').querySelector('.cell-lb')).toBeNull()
  expect(cellOf('Bo').querySelector('.cell-lb-slot')).toBeNull()
})

// Drawing from a Letterboxd watchlist, through the open cell.
function drawingSetup(fetchFn: typeof fetch, nominations: AppState['night']['nominations'] = {}) {
  const lb: LetterboxdClient = {
    checkProfile: vi.fn(),
    watchlistPage: vi.fn(async () => ({ slugs: ['a', 'b'], hasNext: false })),
    filmTmdbId: vi.fn(async (slug: string) => (slug === 'a' ? 11 : 22)),
  }
  const watchlist: WatchlistSource = { client: lb, memory: createWatchlistMemory(), random: () => 0 }
  const roster = [{ ...people[0], letterboxd: { username: 'ann', status: 'found' as const } }, people[1]]
  const state: AppState = {
    ...defaultState,
    settings: { viewersHidden: false, wheel: defaultWheelSettings },
    roster,
    night: { ...defaultState.night, presentIds: ['a', 'b'], nominations },
  }
  return { ...mount(state, false, undefined, watchlist, fetchFn), lb }
}

const movieResponse = (id: number) =>
  new Response(JSON.stringify({ id, title: `Film ${id}`, release_date: '2000-01-01', poster_path: null, overview: '', runtime: 90, genres: [] }))

test('Re-roll is there again when the cell reopens', () => {
  drawingSetup(vi.fn(), { a: { ...film, tmdbId: 11 } })
  openCell('Ann')
  expect(screen.getByRole('button', { name: 'Re-roll' })).toBeInTheDocument()
  fireEvent.click(header('Ann'))
  openCell('Ann')
  expect(screen.getByRole('button', { name: 'Re-roll' })).toBeInTheDocument()
})

test('closing the cell while the film loads nominates nothing, and the next press uses the kept walk', async () => {
  let resolve!: (r: Response) => void
  const fetchFn = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>((r) => (resolve = r)))
    .mockImplementation(async () => movieResponse(11)) as unknown as typeof fetch
  const { store, lb } = drawingSetup(fetchFn)
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'Random from watchlist' }))
  await act(async () => {})
  fireEvent.click(header('Ann'))
  await act(async () => {
    resolve(movieResponse(11))
  })
  expect(store.getState().night.nominations.a).toBeUndefined()
  openCell('Ann')
  fireEvent.click(screen.getByRole('button', { name: 'Random from watchlist' }))
  await act(async () => {})
  expect(store.getState().night.nominations.a.tmdbId).toBe(11)
  expect(lb.watchlistPage).toHaveBeenCalledTimes(1)
})
