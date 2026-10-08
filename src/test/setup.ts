import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no canvas, so confetti is a no-op unless a test mocks it itself.
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

afterEach(cleanup)

// jsdom 30 has neither dialog.showModal nor the Popover API, and its default
// stylesheet hides every [popover] that isn't :popover-open, so the stand-ins
// below toggle an inline display style and never touch real :popover-open.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

if (!('showPopover' in HTMLElement.prototype)) {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>
  proto.showPopover = function showPopover(this: HTMLElement) {
    this.style.display = 'block'
    this.dataset.popoverOpen = 'true'
  }
  proto.hidePopover = function hidePopover(this: HTMLElement) {
    this.style.display = ''
    delete this.dataset.popoverOpen
  }
  proto.togglePopover = function togglePopover(this: HTMLElement) {
    if (this.dataset.popoverOpen) (this as unknown as { hidePopover(): void }).hidePopover()
    else (this as unknown as { showPopover(): void }).showPopover()
  }
  document.addEventListener(
    'click',
    (event) => {
      const button = (event.target as Element).closest?.('[popovertarget]')
      if (!button) return
      const target = document.getElementById(button.getAttribute('popovertarget') ?? '')
      ;(target as unknown as { togglePopover?: () => void } | null)?.togglePopover?.()
    },
    true,
  )
}
