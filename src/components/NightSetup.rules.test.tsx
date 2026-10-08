import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
import { header } from '../test/cells.ts'
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

const hoverQuery = '(hover: hover) and (pointer: fine)'
const original = Object.getOwnPropertyDescriptor(window, 'matchMedia')

function canHover(on: boolean) {
  if (!on) {
    delete (window as { matchMedia?: unknown }).matchMedia
    return
  }
  window.matchMedia = ((query: string) => ({
    matches: query === hoverQuery,
  })) as typeof window.matchMedia
}

let focusVisible = true
const realMatches = Element.prototype.matches

beforeEach(() => {
  vi.useFakeTimers()
  focusVisible = true
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
    this: Element,
    selector: string,
  ) {
    return selector === ':focus-visible' ? focusVisible : realMatches.call(this, selector)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (original) Object.defineProperty(window, 'matchMedia', original)
  else delete (window as { matchMedia?: unknown }).matchMedia
})

function mount(locked = false) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok' },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
        { id: 'd', name: 'Di', color: '#3cb44b' },
      ],
      night: {
        ...defaultState.night,
        presentIds: ['a', 'b', 'd'],
        nominations: { b: film },
      },
    }),
  )
  const ui = (isLocked: boolean) => (
    <AppStoreContext.Provider value={store}>
      <NightSetup
        client={createTmdbClient('tok', vi.fn())}
        onAuthError={vi.fn()}
        locked={isLocked}
      />
    </AppStoreContext.Provider>
  )
  const view = render(ui(locked))
  return { store, rerender: (isLocked: boolean) => view.rerender(ui(isLocked)) }
}

const cell = (name: string) => header(name).closest('li')!
const isOpen = (name: string) => header(name).getAttribute('aria-expanded') === 'true'
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const enter = (name: string) => fireEvent.pointerEnter(cell(name))
const leave = (name: string) => fireEvent.pointerLeave(cell(name))
const mouseClick = (name: string) => fireEvent.click(header(name), { detail: 1 })
const keyClick = (name: string) => fireEvent.click(header(name), { detail: 0 })

test('with a hovering pointer a cell opens after resting about 150 ms and closes about 300 ms after leaving', () => {
  canHover(true)
  mount()
  enter('Ann')
  wait(100)
  expect(isOpen('Ann')).toBe(false)
  wait(100)
  expect(isOpen('Ann')).toBe(true)

  leave('Ann')
  wait(200)
  enter('Ann')
  wait(500)
  expect(isOpen('Ann')).toBe(true)

  leave('Ann')
  wait(350)
  expect(isOpen('Ann')).toBe(false)
})

test('leaving before the delay cancels a hover open', () => {
  canHover(true)
  mount()
  enter('Ann')
  wait(100)
  leave('Ann')
  wait(500)
  expect(isOpen('Ann')).toBe(false)
})

test('a mouse click only opens a cell; Enter and Space toggle it', () => {
  canHover(true)
  mount()
  mouseClick('Ann')
  expect(isOpen('Ann')).toBe(true)
  mouseClick('Ann')
  expect(isOpen('Ann')).toBe(true)
  keyClick('Ann')
  expect(isOpen('Ann')).toBe(false)
  keyClick('Ann')
  expect(isOpen('Ann')).toBe(true)
})

test('without hover a click or tap toggles the cell, and so do Enter and Space', () => {
  canHover(false)
  mount()
  mouseClick('Ann')
  expect(isOpen('Ann')).toBe(true)
  mouseClick('Ann')
  expect(isOpen('Ann')).toBe(false)
  keyClick('Ann')
  expect(isOpen('Ann')).toBe(true)
  keyClick('Ann')
  expect(isOpen('Ann')).toBe(false)
  enter('Ann')
  wait(500)
  expect(isOpen('Ann')).toBe(false)
})

test('opening one cell closes another', () => {
  canHover(false)
  mount()
  mouseClick('Ann')
  mouseClick('Bo')
  expect(isOpen('Ann')).toBe(false)
  expect(isOpen('Bo')).toBe(true)
})

test('the eye toggle on a closed cell leaves it closed', () => {
  canHover(true)
  mount()
  fireEvent.click(screen.getByRole('button', { name: 'Bo is here' }), { detail: 1 })
  expect(isOpen('Bo')).toBe(false)
})

test('keyboard-visible focus inside a cell keeps it open; a clicked slider does not', () => {
  canHover(true)
  mount()
  mouseClick('Ann')
  const search = screen.getByLabelText('Search a film for Ann')
  fireEvent.focus(search)
  enter('Ann')
  leave('Ann')
  wait(1000)
  expect(isOpen('Ann')).toBe(true)

  fireEvent.blur(search, { relatedTarget: document.body })
  wait(0)
  mouseClick('Bo')
  expect(isOpen('Bo')).toBe(true)
  focusVisible = false
  const slices = screen.getByLabelText('Slices for Bo')
  fireEvent.focus(slices)
  enter('Bo')
  leave('Bo')
  wait(400)
  expect(isOpen('Bo')).toBe(false)
})

test('a slider drag keeps the cell open until the pointer is released', () => {
  canHover(true)
  mount()
  mouseClick('Bo')
  enter('Bo')
  fireEvent.pointerDown(screen.getByLabelText('Slices for Bo'))
  leave('Bo')
  wait(1000)
  expect(isOpen('Bo')).toBe(true)
  fireEvent.pointerUp(window)
  wait(400)
  expect(isOpen('Bo')).toBe(false)
})

test('an open colour popover, menu or Remove confirmation keeps the cell open', () => {
  canHover(true)
  mount()
  mouseClick('Bo')
  enter('Bo')

  fireEvent.click(screen.getByRole('button', { name: "Bo's colour" }))
  leave('Bo')
  wait(1000)
  expect(isOpen('Bo')).toBe(true)
  act(() => document.getElementById('color-picker-b')!.hidePopover())
  wait(350)
  expect(isOpen('Bo')).toBe(false)

  mouseClick('Bo')
  enter('Bo')
  fireEvent.click(screen.getByRole('button', { name: 'More for Bo' }))
  leave('Bo')
  wait(1000)
  expect(isOpen('Bo')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Remove from roster' }))
  wait(1000)
  expect(isOpen('Bo')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  wait(350)
  expect(isOpen('Bo')).toBe(false)
})

test('hover does not open another cell while one is held open, but a click does', () => {
  canHover(true)
  mount()
  mouseClick('Ann')
  fireEvent.focus(screen.getByLabelText('Search a film for Ann'))
  leave('Ann')
  enter('Di')
  wait(1000)
  expect(isOpen('Di')).toBe(false)
  expect(isOpen('Ann')).toBe(true)

  mouseClick('Di')
  expect(isOpen('Di')).toBe(true)
  expect(isOpen('Ann')).toBe(false)
})

test('a lock closes the open cell and nothing opens until it ends', () => {
  canHover(true)
  const { rerender } = mount()
  mouseClick('Ann')
  expect(isOpen('Ann')).toBe(true)
  rerender(true)
  expect(isOpen('Ann')).toBe(false)
  expect(screen.getByRole('button', { name: 'Ann is here' })).toBeDisabled()
  expect(header('Ann')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  enter('Bo')
  wait(1000)
  expect(isOpen('Bo')).toBe(false)
  mouseClick('Bo')
  keyClick('Bo')
  expect(isOpen('Bo')).toBe(false)

  rerender(false)
  mouseClick('Ann')
  expect(isOpen('Ann')).toBe(true)
})
