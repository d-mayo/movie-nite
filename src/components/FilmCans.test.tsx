import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Nomination } from '../state/model.ts'
import { finishTake, newCans, openChoice, phaseOf, pickCan, settleTick, takeFilm, type Cans } from '../wildcards/cans.ts'
import FilmCans from './FilmCans.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const film = (tmdbId: number): Nomination => ({
  tmdbId,
  title: `Film ${tmdbId}`,
  year: 2000,
  posterPath: null,
  overview: 'A film.',
  runtime: 100,
  genres: [],
})

// FilmCans driven the way the panel drives it, at full length.
function Host({ films }: { films: Nomination[] }) {
  const [cans, setCans] = useState<Cans>(() => newCans(films))
  const play = (fn: (c: Cans) => Cans) => setCans((c) => fn(c))
  return (
    <>
      <output data-testid="phase">{phaseOf(cans)}</output>
      <FilmCans
        cans={cans}
        random={() => 0}
        onPick={(i) => play((c) => pickCan(c, i, () => 0))}
        onTake={(i) => play((c) => takeFilm(c, i))}
        onSettle={() => play(settleTick)}
        onOpen={() => play(openChoice)}
        onFinish={() => play(finishTake)}
      />
    </>
  )
}

const phase = () => screen.getByTestId('phase').textContent

test('with two cans, at full length, the other can unveils and then the film is taken', () => {
  vi.useFakeTimers()
  render(<Host films={[film(1), film(2)]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Pick can 1' }))
  expect(phase()).toBe('unveiling')
  act(() => void vi.advanceTimersByTime(1200))
  expect(phase()).toBe('closing')
  expect(document.querySelectorAll('.can-open')).toHaveLength(2)
  act(() => void vi.advanceTimersByTime(1600))
  expect(phase()).toBe('taken')
})
