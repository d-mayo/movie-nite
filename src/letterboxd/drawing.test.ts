import { expect, test } from 'vitest'
import { defaultState, type Nomination } from '../state/model.ts'
import { movieExclusions, rewindExclusions } from './drawing.ts'

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

test('a game entry in the watched list is skipped by the exclusions', () => {
  const night = { ...defaultState.night, watched: [{ kind: 'game' as const, name: 'Rento', url: 'https://rento.com/' }, film(4)] }
  expect([...movieExclusions(night, null)]).toEqual([4])
})

test("Rewind skips tonight's films but not the held film", () => {
  const night = { ...defaultState.night, nominations: { a: film(1) }, wonFilms: [3], watched: [film(4)] }
  expect([...rewindExclusions(night)].sort()).toEqual([1, 3, 4])
})
