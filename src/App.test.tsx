import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from './App.tsx'
import { defaultState } from './state/model.ts'
import { createMemoryPersistence } from './state/persistence.ts'
import { createAppStore } from './state/store.ts'

const attribution =
  'This product uses the TMDB API but is not endorsed or certified by TMDB.'

function expectFooter() {
  const footer = screen.getByRole('contentinfo')
  expect(within(footer).getByText(attribution)).toBeInTheDocument()
  expect(within(footer).getByRole('img', { name: 'TMDB' })).toBeInTheDocument()
}

function setup(fetchFn: typeof fetch, token: string | null = null) {
  const persistence = createMemoryPersistence({
    ...defaultState,
    settings: { tmdbToken: token },
  })
  const store = createAppStore(persistence)
  render(<App store={store} fetchFn={fetchFn} />)
  return { store, persistence }
}

const ok = () => vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

test('with no token only the prompt and the footer show', () => {
  setup(ok())
  expect(screen.getByLabelText('TMDB Read Access Token')).toBeInTheDocument()
  expect(screen.queryByText("Tonight's viewers")).not.toBeInTheDocument()
  expectFooter()
})

test('a passing check saves the token and shows setup', async () => {
  const fetchFn = ok()
  const { store } = setup(fetchFn)
  fireEvent.change(screen.getByLabelText('TMDB Read Access Token'), {
    target: { value: ' tok ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(store.getState().settings.tmdbToken).toBe('tok'))
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  expect(fetchFn).toHaveBeenCalledTimes(1)
  expectFooter()
})

test.each([
  ['a 401 response', () => vi.fn().mockResolvedValue(new Response('{}', { status: 401 }))],
  ['a network error', () => vi.fn().mockRejectedValue(new TypeError('offline'))],
])('%s shows an error and saves nothing', async (_name, makeFetch) => {
  const { store } = setup(makeFetch())
  fireEvent.change(screen.getByLabelText('TMDB Read Access Token'), {
    target: { value: 'bad' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(store.getState().settings.tmdbToken).toBeNull()
  expect(screen.getByLabelText('TMDB Read Access Token')).toBeInTheDocument()
  expectFooter()
})

test('Change TMDB token brings the prompt back', () => {
  const { store } = setup(ok(), 'tok')
  fireEvent.click(screen.getByRole('button', { name: 'Change TMDB token' }))
  expect(store.getState().settings.tmdbToken).toBeNull()
  expect(screen.getByLabelText('TMDB Read Access Token')).toBeInTheDocument()
})

test('a banner with the logo sits above the screen', () => {
  setup(ok())
  const banner = screen.getByRole('banner')
  const main = screen.getByRole('main')
  expect(
    banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(main).not.toContainElement(banner)
})

test('the banner also shows on a night screen', () => {
  setup(ok(), 'tok')
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
  expect(screen.getByRole('banner')).toBeInTheDocument()
})

test('the one h1 is the logo named Movie Nite', () => {
  setup(ok())
  const headings = screen.getAllByRole('heading', { level: 1 })
  expect(headings).toHaveLength(1)
  expect(headings[0]).toHaveAccessibleName('Movie Nite')
  expect(
    within(headings[0]).getByRole('img', { name: 'Movie Nite' }),
  ).toBeInTheDocument()
})

test('the banner picks the dark logo by colour scheme', () => {
  setup(ok())
  const picture = screen.getByRole('banner').querySelector('picture')!
  const source = picture.querySelector('source')!
  expect(source.getAttribute('media')).toBe('(prefers-color-scheme: dark)')
  expect(source.getAttribute('srcset')).toContain('logo-dark-transparent')
  expect(picture.querySelector('img')!.getAttribute('src')).toContain(
    'logo-light-transparent',
  )
})
