import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App.tsx'

test('shows the app name and the TMDB attribution footer', () => {
  render(<App />)

  expect(screen.getByRole('heading', { name: 'Movie Nite' })).toBeInTheDocument()

  const footer = screen.getByRole('contentinfo')
  expect(
    within(footer).getByText(
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    ),
  ).toBeInTheDocument()
  expect(within(footer).getByRole('img', { name: 'TMDB' })).toBeInTheDocument()
})
