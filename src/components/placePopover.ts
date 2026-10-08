import type { MouseEvent } from 'react'

// Popovers are fixed, so each is placed under the button that opens it.
export function placeUnder(e: MouseEvent<HTMLButtonElement>, popover: HTMLElement | null) {
  if (!popover) return
  const rect = e.currentTarget.getBoundingClientRect()
  popover.style.top = `${rect.bottom + 4}px`
  popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`
}
