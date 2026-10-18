import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { soundCredits } from '../assets/sound/credits.ts'
import readme from '../assets/sound/README.md?raw'
import { defaultState } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'

const notice = 'This product uses the TMDB API but is not endorsed or certified by TMDB.'

function setup() {
  const store = createAppStore(
    createMemoryPersistence({
      ...defaultState,
      settings: { viewersHidden: false, wheel: defaultWheelSettings },
      roster: [{ id: 'a', name: 'Ann', color: '#e6194b' }],
      night: {
        ...defaultState.night,
        presentIds: ['a'],
        nominations: {
          a: { tmdbId: 1, title: 'Alien', year: 1979, posterPath: null, overview: '', runtime: 117, genres: [] },
        },
      },
    }),
  )
  render(<App store={store} fetchFn={vi.fn() as unknown as typeof fetch} random={() => 0.01} spinMs={20} />)
  return store
}

const gear = () => screen.getByRole('button', { name: 'Settings' })
const openCredits = () => {
  fireEvent.click(gear())
  fireEvent.click(screen.getByRole('button', { name: 'Credits' }))
}

test('the gear menu lists Wheel settings, then Credits', () => {
  setup()
  fireEvent.click(gear())
  const items = within(document.getElementById('settings-menu')!)
    .getAllByRole('button')
    .map((b) => b.textContent)
  expect(items).toEqual(['Wheel settings', 'Credits'])
})

test('Credits opens a dialog with the TMDB logo, notice, link and every sound credit', () => {
  setup()
  expect(screen.queryByRole('dialog')).toBeNull()
  openCredits()
  const dialog = screen.getByRole('dialog', { name: 'Credits' })
  expect(within(dialog).getByRole('img', { name: 'TMDB' })).toBeInTheDocument()
  expect(within(dialog).getByText(new RegExp(notice))).toBeInTheDocument()
  expect(within(dialog).getByRole('link', { name: 'themoviedb.org' })).toHaveAttribute(
    'href',
    'https://www.themoviedb.org',
  )
  for (const credit of soundCredits) {
    const item = within(dialog).getByText(new RegExp(`^${credit.what}:`), { selector: 'li' })
    expect(item).toHaveTextContent(`by ${credit.author} (${credit.license})`)
    expect(within(item).getByRole('link')).toHaveAttribute('href', credit.sourceUrl)
  }
})

test('Close and Escape unmount the dialog and focus the gear', () => {
  setup()
  openCredits()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(gear()).toHaveFocus()

  openCredits()
  gear().blur()
  act(() => (screen.getByRole('dialog') as HTMLDialogElement).close())
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(gear()).toHaveFocus()
})

test('Credits stays enabled during a spin and after the night has ended', async () => {
  const store = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Spin' }))
  fireEvent.click(gear())
  expect(screen.getByRole('button', { name: 'Credits' })).toBeEnabled()
  await screen.findByRole('dialog')
  expect(screen.getByRole('button', { name: 'Credits' })).toBeEnabled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
  act(() => store.getState().endNight())
  expect(screen.getByRole('button', { name: 'Credits' })).toBeEnabled()
})

test('every MP3 in src/assets/sound has exactly one credit, and every credit names a file', () => {
  const files = Object.keys(import.meta.glob('../assets/sound/*.mp3')).map((p) => p.split('/').pop())
  expect(soundCredits.map((c) => c.file).sort()).toEqual(files.sort())
})

test('each credit’s source link and author also appear in the sound README', () => {
  for (const c of soundCredits) {
    expect(readme, c.file).toContain(c.sourceUrl)
    expect(readme, c.file).toContain(c.author)
  }
})
