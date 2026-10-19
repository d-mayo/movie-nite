import { expect, test } from 'vitest'
import { defaultState, type Nomination } from '../state/model.ts'
import { movieExclusions } from './drawing.ts'

const film = (tmdbId: number): Nomination => ({
  tmdbId,
  title: `Film ${tmdbId}`,
  year: null,
  posterPath: null,
  overview: '',
  runtime: null,
  genres: [],
})

test('a movie card skips every nomination, the films won and watched tonight and the held film', () => {
  const night = {
    ...defaultState.night,
    nominations: { a: film(1), b: film(2) },
    wonFilms: [3],
    watched: [film(4), film(3)],
  }
  expect([...movieExclusions(night, film(5))].sort()).toEqual([1, 2, 3, 4, 5])
  expect([...movieExclusions(night, null)].sort()).toEqual([1, 2, 3, 4])
})
