import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'

function film(id: number, posterPath: string | null): Nomination {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    year: 2000,
    posterPath,
    overview: '',
    runtime: 100,
    genres: [],
  }
}

function setup() {
  const store = createAppStore(
    createMemoryPersistence({ ...defaultState, settings: { tmdbToken: 'tok' } }),
  )
  render(<App store={store} fetchFn={vi.fn()} />)
  return store
}

const wedges = () => screen.queryAllByTestId('wedge')
const images = () => document.querySelectorAll('image')

test('with no ticked viewers an empty state shows beside setup', () => {
  setup()
  expect(screen.getByText(/Tick or add viewers/)).toBeInTheDocument()
  expect(wedges()).toHaveLength(0)
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
})

test('the wheel follows viewers and nominations live', () => {
  const store = setup()
  fireEvent.change(screen.getByLabelText('Add a viewer'), { target: { value: 'Ann' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  expect(wedges()).toHaveLength(4)
  expect(screen.getAllByText('Ann')).not.toHaveLength(0)
  expect(screen.getAllByText('WILDCARD')).toHaveLength(1)
  expect(images()).toHaveLength(0)

  const id = store.getState().roster[0].id
  act(() => store.getState().nominate(id, film(1, '/a.jpg')))
  expect(images()).toHaveLength(3)
  expect(images()[0].getAttribute('href')).toBe('https://image.tmdb.org/t/p/w185/a.jpg')

  act(() => store.getState().nominate(id, film(2, '/b.jpg')))
  expect(images()[0].getAttribute('href')).toBe('https://image.tmdb.org/t/p/w185/b.jpg')

  act(() => store.getState().nominate(id, film(3, null)))
  expect(images()).toHaveLength(0)
  expect(wedges()).toHaveLength(4)
  expect(screen.getByTestId('pointer')).toBeInTheDocument()

  fireEvent.click(screen.getByLabelText('Ann'))
  expect(wedges()).toHaveLength(0)
  fireEvent.click(screen.getByLabelText('Ann'))
  expect(wedges()).toHaveLength(4)

  act(() => store.getState().nominate(id, film(4, '/c.jpg')))
  expect(screen.queryByRole('button', { name: 'New night' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Remove Ann' }))
  expect(wedges()).toHaveLength(0)
})

test('a viewer name of 20 characters is shortened on the wheel, a short one is not', () => {
  setup()
  for (const name of ['abcdefghijklmnopqrst', 'Ann']) {
    fireEvent.change(screen.getByLabelText('Add a viewer'), { target: { value: name } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  }
  expect(screen.getAllByText('abcdefghijklm…')).not.toHaveLength(0)
  expect(screen.queryByText('abcdefghijklmnopqrst', { selector: 'text' })).toBeNull()
  expect(screen.getAllByText('Ann', { selector: 'text' })).not.toHaveLength(0)
})
