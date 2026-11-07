import { act, fireEvent, screen, within } from '@testing-library/react'

// The debug overlay, opened from the ⚙ menu's Debug options item (once ?debug has turned it on).
export function openDebug(): HTMLElement {
  const open = screen.queryByRole('dialog', { name: 'Debug options' })
  if (open) return open
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Debug options' }))
  return screen.getByRole('dialog', { name: 'Debug options' })
}

// dialog.close() stands in for Escape, which closes a modal dialog natively.
export function closeDebug() {
  const open = screen.queryByRole('dialog', { name: 'Debug options' })
  if (open) act(() => (open as HTMLDialogElement).close())
}

// A control of the open overlay, by its label.
export function debugControl(label: string | RegExp): HTMLElement {
  return within(openDebug()).getByLabelText(label)
}

// Presses one Force switch through the overlay, then closes the overlay so it does not cover the reveal.
export function toggleForce(label: string) {
  fireEvent.click(debugControl(label))
  closeDebug()
}

export function chooseForceCard(id: string) {
  fireEvent.change(debugControl('Force card'), { target: { value: id } })
  closeDebug()
}
