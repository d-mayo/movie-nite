import { act, fireEvent, screen, within } from '@testing-library/react'

// The debug popover, opened from the banner's debug button (with ?debug in the address).
export function openDebug(): HTMLElement {
  const open = screen.queryByRole('dialog', { name: 'Debug options' })
  if (open) return open
  fireEvent.click(screen.getByRole('button', { name: 'Debug options' }))
  return screen.getByRole('dialog', { name: 'Debug options' })
}

// dialog.close() stands in for Escape, which closes a modal dialog natively.
export function closeDebug() {
  const open = screen.queryByRole('dialog', { name: 'Debug options' })
  if (open) act(() => (open as HTMLDialogElement).close())
}

// A control of the open popover, by its label.
export function debugControl(label: string | RegExp): HTMLElement {
  return within(openDebug()).getByLabelText(label)
}

// Presses one Force switch through the popover, then closes it so it does not cover the reveal.
export function toggleForce(label: string) {
  fireEvent.click(debugControl(label))
  closeDebug()
}

export function chooseForceCard(id: string) {
  fireEvent.change(debugControl('Force card'), { target: { value: id } })
  closeDebug()
}
