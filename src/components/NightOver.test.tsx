import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { defaultState } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
import type { CardEffect } from '../wildcards/cards.ts'
import NightOver from './NightOver.tsx'

afterEach(cleanup)

function mount(cardEffects: CardEffect[], watched: unknown[] = []) {
  const store = createAppStore(
    createMemoryPersistence({ ...defaultState, night: { ...defaultState.night, ended: true, cardEffects, watched: watched as never } }),
  )
  render(
    <AppStoreContext.Provider value={store}>
      <NightOver />
    </AppStoreContext.Provider>,
  )
}

test('lists every card that came up, a removed viewer\'s included, after a heading line', () => {
  mount([
    { cardId: 'x', label: 'Gone +2 weight', change: { kind: 'weight', amount: 2, viewerIds: ['gone'] } },
    { cardId: 'w', label: '+1 wildcard', change: { kind: 'wildcards', amount: 1 } },
    { cardId: 'x', label: 'Gone +2 weight', change: { kind: 'weight', amount: 2, viewerIds: ['gone'] } },
  ])
  expect(screen.getByText('Cards tonight:')).toBeInTheDocument()
  const items = within(screen.getByRole('list', { name: 'Cards tonight' })).getAllByRole('listitem')
  expect(items.map((li) => li.textContent)).toEqual(['Gone +2 weight', '+1 wildcard', 'Gone +2 weight'])
})

test('lists a movie card by its label among the wheel cards, in landing order', () => {
  mount([
    { cardId: 'w', label: '+1 wildcard', change: { kind: 'wildcards', amount: 1 } },
    { cardId: 'genre-night', label: 'Horror night', change: { kind: 'movie' } },
  ])
  const items = within(screen.getByRole('list', { name: 'Cards tonight' })).getAllByRole('listitem')
  expect(items.map((li) => li.textContent)).toEqual(['+1 wildcard', 'Horror night'])
})

test('with no cards it shows no card list', () => {
  mount([])
  expect(screen.queryByText('Cards tonight:')).toBeNull()
  expect(screen.queryByRole('list', { name: 'Cards tonight' })).toBeNull()
})

const watchedFilm = { tmdbId: 7, title: 'Seven', year: 1995, posterPath: null, overview: '', runtime: null, genres: [] }
const game = { kind: 'game', name: 'Rento', url: 'https://rento.com/' }

test('a game entry reads "Rento (game)", linked in a new tab, under "Watched tonight:"', () => {
  mount([], [watchedFilm, game])
  expect(screen.getByText('Watched tonight:')).toBeInTheDocument()
  expect(screen.queryByText('Films watched tonight:')).toBeNull()
  const link = screen.getByRole('link', { name: 'Rento (game)' })
  expect(link).toHaveAttribute('href', 'https://rento.com/')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link.getAttribute('rel')).toContain('noopener')
  expect(screen.getByRole('link', { name: 'Seven (1995)' })).toBeInTheDocument()
})

test('with films only the heading stays "Films watched tonight:"', () => {
  mount([], [watchedFilm])
  expect(screen.getByText('Films watched tonight:')).toBeInTheDocument()
})

test('a game alone is still a watched list', () => {
  mount([], [game])
  expect(screen.getByText('Watched tonight:')).toBeInTheDocument()
  expect(screen.queryByText('No films were watched tonight.')).toBeNull()
})
