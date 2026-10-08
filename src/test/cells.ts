import { fireEvent, screen } from '@testing-library/react'

// A viewer cell's header button, found by the name it shows.
export function header(name: string): HTMLElement {
  return screen.getByText(name, { selector: '.cell-name' }).closest('button')!
}

export function openCell(name: string) {
  const h = header(name)
  if (h.getAttribute('aria-expanded') !== 'true') fireEvent.click(h)
}

export function markAway(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `${name} is here` }))
}

export function markHere(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `${name} is away` }))
}

// Removes a viewer through their cell's menu and the confirmation.
export function removeViewer(name: string) {
  openCell(name)
  fireEvent.click(screen.getByRole('button', { name: `More for ${name}` }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove from roster' }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
}
