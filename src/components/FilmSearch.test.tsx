import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createTmdbClient } from '../tmdb/client.ts'
import FilmSearch from './FilmSearch.tsx'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

const searchBody = () =>
  json({
    results: [
      { id: 1, title: 'Alien', release_date: '1979-05-25', poster_path: '/p.jpg' },
      { id: 2, title: 'Aliens', release_date: '1986-07-18', poster_path: null },
    ],
  })

const movieBody = () =>
  json({
    id: 1,
    title: 'Alien',
    release_date: '1979-05-25',
    poster_path: '/p.jpg',
    overview: 'ov',
    runtime: 117,
    genres: [{ name: 'Horror' }],
  })

function mount(fetchFn: (url: string) => Promise<Response>) {
  const onPick = vi.fn()
  const onAuthError = vi.fn()
  render(
    <FilmSearch
      label="Find a film"
      client={createTmdbClient('tok', fetchFn as unknown as typeof fetch)}
      onAuthError={onAuthError}
      onPick={onPick}
    />,
  )
  return { onPick, onAuthError }
}

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Find a film'), { target: { value } })

test('typing shows results with poster and year, and picking reports the full film', async () => {
  const { onPick } = mount((url) =>
    Promise.resolve(url.includes('/search/') ? searchBody() : movieBody()),
  )
  type('alien')
  await tick(300)
  expect(screen.getByRole('img', { name: 'Poster of Alien' })).toBeInTheDocument()
  expect(screen.getByText('Aliens (1986)')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pick Alien (1979)' }))
  await tick(0)
  expect(onPick).toHaveBeenCalledWith(
    expect.objectContaining({ tmdbId: 1, runtime: 117, genres: ['Horror'] }),
  )
})

test('a failing getMovie shows Retry, and retrying picks', async () => {
  let fail = true
  const { onPick } = mount((url) =>
    Promise.resolve(
      url.includes('/search/') ? searchBody() : fail ? json({}, 500) : movieBody(),
    ),
  )
  type('alien')
  await tick(300)
  fireEvent.click(screen.getByRole('button', { name: 'Pick Alien (1979)' }))
  await tick(0)
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load Alien')
  expect(onPick).not.toHaveBeenCalled()
  fail = false
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await tick(0)
  expect(onPick).toHaveBeenCalledTimes(1)
})

test('a 401 calls onAuthError', async () => {
  const { onAuthError } = mount(() => Promise.resolve(json({}, 401)))
  type('alien')
  await tick(300)
  expect(onAuthError).toHaveBeenCalled()
})
