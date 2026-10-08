import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
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

function setup() {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok' },
    }),
  )
  render(
    <AppStoreContext.Provider value={store}>
      <NightSetup
        client={createTmdbClient('tok', vi.fn())}
        onAuthError={vi.fn()}
      />
    </AppStoreContext.Provider>,
  )
  return { store }
}

function add(name: string) {
  fireEvent.change(screen.getByLabelText('Add a viewer'), {
    target: { value: name },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}

test('adding a guest ticks them, unticking lowers the headcount, removing deletes them', () => {
  setup()
  add(' Ann ')
  add('Bo')
  expect(screen.getByLabelText('Ann')).toBeChecked()
  expect(screen.getByText('Headcount: 2')).toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('Ann'))
  expect(screen.getByText('Headcount: 1')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Remove Bo' }))
  expect(screen.queryByLabelText('Bo')).not.toBeInTheDocument()
  expect(screen.getByText('Headcount: 0')).toBeInTheDocument()
})

test('a duplicate name is not added', () => {
  setup()
  add('Ann')
  add('ann')
  expect(screen.getAllByRole('checkbox')).toHaveLength(1)
})

function setupWith(night: Partial<typeof defaultState.night>, holdover: Nomination | null = null) {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { tmdbToken: 'tok' },
      roster: [
        { id: 'a', name: 'Ann', color: '#e6194b' },
        { id: 'b', name: 'Bo', color: '#f58231' },
      ],
      night: { ...defaultState.night, presentIds: ['a', 'b'], ...night },
      holdover,
    }),
  )
  render(
    <AppStoreContext.Provider value={store}>
      <NightSetup
        client={createTmdbClient('tok', vi.fn())}
        onAuthError={vi.fn()}
      />
    </AppStoreContext.Provider>,
  )
  return store
}

test('a done viewer shows their film as won, with no search or change control', () => {
  setupWith({ nominations: { a: film, b: { ...film, tmdbId: 2, title: 'Other' } }, wonFilms: [1] })
  expect(screen.getByText('Film (2000)')).toBeInTheDocument()
  expect(screen.getByText(/Won tonight/)).toBeInTheDocument()
  expect(screen.queryByLabelText('Search a film for Ann')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Change film for Ann' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Change film for Bo' })).toBeInTheDocument()
})

test('other viewers can still be ticked, unticked and removed after a win', () => {
  const store = setupWith({ nominations: { a: film }, wonFilms: [1] })
  fireEvent.click(screen.getByLabelText('Bo'))
  expect(store.getState().night.presentIds).toEqual(['a'])
  fireEvent.click(screen.getByLabelText('Bo'))
  expect(store.getState().night.presentIds).toEqual(['a', 'b'])
  fireEvent.click(screen.getByRole('button', { name: 'Remove Bo' }))
  expect(store.getState().roster.map((v) => v.id)).toEqual(['a'])
})

test('a saved Watch next session film is shown and can be cleared', () => {
  const store = setupWith({}, film)
  expect(screen.getByText('Watch next session')).toBeInTheDocument()
  expect(screen.getByText('Film (2000)')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear Watch next session film' }))
  expect(store.getState().holdover).toBeNull()
  expect(screen.queryByText('Watch next session')).toBeNull()
})

test('the Add a viewer field accepts at most 20 characters', () => {
  setup()
  expect(screen.getByLabelText('Add a viewer')).toHaveAttribute('maxlength', '20')
})
