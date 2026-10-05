import { act, fireEvent, render, screen } from '@testing-library/react'
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
  const onChangeToken = vi.fn()
  render(
    <AppStoreContext.Provider value={store}>
      <NightSetup
        client={createTmdbClient('tok', vi.fn())}
        onAuthError={vi.fn()}
        onChangeToken={onChangeToken}
      />
    </AppStoreContext.Provider>,
  )
  return { store, onChangeToken }
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

test('New night is hidden without nominations and clears them when clicked', () => {
  const { store } = setup()
  add('Ann')
  expect(screen.queryByRole('button', { name: 'New night' })).toBeNull()

  const ann = store.getState().roster[0].id
  act(() => store.getState().nominate(ann, film))
  fireEvent.click(screen.getByRole('button', { name: 'New night' }))
  expect(store.getState().night.nominations).toEqual({})
  expect(store.getState().night.presentIds).toEqual([ann])
  expect(store.getState().roster).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'New night' })).toBeNull()
})

test('Change TMDB token calls back', () => {
  const { onChangeToken } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Change TMDB token' }))
  expect(onChangeToken).toHaveBeenCalled()
})
