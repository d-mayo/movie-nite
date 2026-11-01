import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { canHover, closeDelayMs } from './canHover.ts'

// The placing and closing of a modal `<dialog>` popover hung under a button,
// shared by the Wheel settings and debug popovers. It closes on Escape (the
// native `close` event), on a press outside it, and, where a pointer can
// hover, shortly after the pointer leaves it once it has been inside. Spread
// `dialogProps` on the dialog and give it `dialogRef`.
export function useHungPopover(onClosed: () => void, anchor?: RefObject<HTMLElement | null>) {
  const dialog = useRef<HTMLDialogElement>(null)
  // Read by the document listeners, which outlive a render. True while a dialog sits over the popover.
  const suspendedRef = useRef(false)
  // True once the pointer has been inside since the popover opened, or since
  // a dialog over it closed.
  const wasInside = useRef(false)
  // True while the last pointer position was outside the popover.
  const outside = useRef(false)
  // True from a press on the backdrop, outside the popover's rectangle, until its click.
  const outsidePress = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Close natively, then unmount at once rather than wait for the `close` event.
  const dismiss = useCallback(() => {
    dialog.current?.close()
    onClosed()
  }, [onClosed])
  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const scheduleClose = useCallback(() => {
    clearTimer()
    timer.current = setTimeout(dismiss, closeDelayMs)
  }, [clearTimer, dismiss])
  const insideRect = useCallback((x: number, y: number) => {
    const r = dialog.current?.getBoundingClientRect()
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }, [])
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (!el.open) el.showModal()
    el.addEventListener('close', onClosed)
    // Keep focus off the controls, so a key right after opening changes nothing.
    el.focus()
    // Hang the popover under the button that opened it, right edges aligned.
    function place() {
      const rect = anchor?.current?.getBoundingClientRect()
      if (!el || !rect) return
      el.style.top = `${rect.bottom + 8}px`
      const left = rect.right - el.offsetWidth
      el.style.left = `${Math.min(Math.max(8, left), window.innerWidth - el.offsetWidth - 8)}px`
      el.style.maxHeight = `${window.innerHeight - rect.bottom - 24}px`
    }
    place()
    window.addEventListener('resize', place)
    // A modal dialog's backdrop covers the viewport and its events target the
    // dialog, so leaving is found by comparing positions with its rectangle.
    function onMove(e: PointerEvent) {
      if (suspendedRef.current || e.pointerType === 'touch' || !canHover()) return
      if (insideRect(e.clientX, e.clientY)) {
        outside.current = false
        wasInside.current = true
        clearTimer()
      } else {
        outside.current = true
        // A held button is a drag, such as a slider's: it ends with pointerup.
        if (wasInside.current && !outsidePress.current && e.buttons === 0) scheduleClose()
      }
    }
    function onLeaveDocument(e: PointerEvent) {
      if (suspendedRef.current || e.pointerType === 'touch' || !canHover()) return
      outside.current = true
      if (wasInside.current && !outsidePress.current) scheduleClose()
    }
    // A drag that ends outside the popover leaves it open for the usual delay.
    function onUp() {
      if (outside.current && wasInside.current && !outsidePress.current && !suspendedRef.current && canHover()) {
        scheduleClose()
      }
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.documentElement.addEventListener('pointerleave', onLeaveDocument)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeaveDocument)
      el.removeEventListener('close', onClosed)
      clearTimer()
    }
  }, [anchor, onClosed, insideRect, clearTimer, scheduleClose])
  // A press that ends without a click leaves the popover open, and restarts
  // the leave timer if the pointer is still outside.
  function pressEnded() {
    if (!outsidePress.current) return
    outsidePress.current = false
    if (wasInside.current && outside.current && canHover() && !suspendedRef.current) {
      scheduleClose()
    }
  }
  // A dialog now sits over the popover: its leave timer, outside press and Escape wait.
  const suspend = useCallback(() => {
    suspendedRef.current = true
    clearTimer()
  }, [clearTimer])
  // Back to the popover: the pointer must be inside again before leaving counts.
  const resume = useCallback(() => {
    suspendedRef.current = false
    wasInside.current = false
    outside.current = false
    clearTimer()
  }, [clearTimer])
  const dialogProps = {
    tabIndex: -1,
    onPointerDown: (e: React.PointerEvent<HTMLDialogElement>) => {
      outsidePress.current = e.target === e.currentTarget && !insideRect(e.clientX, e.clientY)
      if (outsidePress.current) clearTimer()
    },
    onClick: (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === e.currentTarget && outsidePress.current) dismiss()
    },
    onPointerCancel: pressEnded,
    onContextMenu: pressEnded,
    onAuxClick: pressEnded,
  }
  return { dialogRef: dialog, dialogProps, suspend, resume }
}
