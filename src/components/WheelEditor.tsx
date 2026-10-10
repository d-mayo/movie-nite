import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import {
  defaultWheelSettings,
  maxSpinSeconds,
  maxSpinTurnsPerSecond,
  minSpinSeconds,
  minSpinTurnsPerSecond,
} from '../wheel/edit.ts'
import { canHover, closeDelayMs } from './canHover.ts'
import Slider from './Slider.tsx'
import Stepper from './Stepper.tsx'

interface Props {
  locked?: boolean
  onClosed: () => void
  // The button the popover hangs from.
  anchor?: RefObject<HTMLElement | null>
}

// Mounted only while shown, like the End night dialog: Cancel and confirming
// unmount it directly, and Escape does so through the native `close` event.
function RestoreDialog({ onConfirm, onClosed }: { onConfirm: () => void; onClosed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.addEventListener('close', onClosed)
    return () => dialog.removeEventListener('close', onClosed)
  }, [onClosed])
  // Close natively, then unmount at once rather than wait for the `close` event.
  function dismiss() {
    ref.current?.close()
    onClosed()
  }
  return (
    <dialog ref={ref} className="card confirm" aria-labelledby="restore-heading">
      <h2 id="restore-heading">Restore all wheel settings?</h2>
      <p>Every wildcard, spin and default setting goes back to its factory value. Adjustments made for a viewer stay.</p>
      <div className="confirm-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            onConfirm()
            dismiss()
          }}
        >
          Restore
        </button>
        <button type="button" className="quiet" onClick={dismiss}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}

// The Wheel settings popover, mounted only while shown. It closes on Escape
// (the native `close` event), on a press outside it, and, where a pointer can
// hover, shortly after the pointer leaves it.
export default function WheelEditor({ locked = false, onClosed, anchor }: Props) {
  const {
    night,
    settings,
    setWildcardsPerViewer,
    setWildcardCount,
    setWildcardWeight,
    setDefaultSlices,
    setDefaultWeight,
    setSpinSeconds,
    setSpinTurnsPerSecond,
    restoreWheelSettings,
  } = useApp()
  const { wheel } = settings
  const dialog = useRef<HTMLDialogElement>(null)
  const [confirming, setConfirming] = useState(false)
  // Read by the document listeners, which outlive a render.
  const confirmingRef = useRef(false)
  // True once the pointer has been inside since the popover opened, or since
  // the Restore confirmation closed.
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
    // Keep focus off the sliders, so an arrow key right after opening changes nothing.
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
      if (confirmingRef.current || e.pointerType === 'touch' || !canHover()) return
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
      if (confirmingRef.current || e.pointerType === 'touch' || !canHover()) return
      outside.current = true
      if (wasInside.current && !outsidePress.current) scheduleClose()
    }
    // A drag that ends outside the popover leaves it open for the usual delay.
    function onUp() {
      if (outside.current && wasInside.current && !outsidePress.current && !confirmingRef.current && canHover()) {
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
    if (wasInside.current && outside.current && canHover() && !confirmingRef.current) {
      scheduleClose()
    }
  }
  function showConfirm() {
    confirmingRef.current = true
    clearTimer()
    setConfirming(true)
  }
  // Back to the popover: the pointer must be inside again before leaving counts.
  const closeConfirm = useCallback(() => {
    confirmingRef.current = false
    setConfirming(false)
    wasInside.current = false
    outside.current = false
    clearTimer()
    dialog.current?.focus()
  }, [clearTimer])
  const atFactory = (Object.keys(defaultWheelSettings) as (keyof typeof wheel)[]).every(
    (k) => wheel[k] === defaultWheelSettings[k],
  )
  const onWheel = viewersOnWheel(night)
  return (
    <>
      <dialog
        ref={dialog}
        className="card wheel-drawer"
        aria-label="Wheel settings"
        tabIndex={-1}
        onPointerDown={(e) => {
          outsidePress.current = e.target === e.currentTarget && !insideRect(e.clientX, e.clientY)
          if (outsidePress.current) clearTimer()
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && outsidePress.current) dismiss()
        }}
        onPointerCancel={pressEnded}
        onContextMenu={pressEnded}
        onAuxClick={pressEnded}
      >
        <div className="drawer-body">
          <fieldset disabled={locked} className="setup wheel-editor">
            <section className="inset-card" aria-labelledby="wildcards-heading">
              <div className="card-head">
                <h3 id="wildcards-heading">Wildcards</h3>
                <label className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={wheel.wildcardsPerViewer}
                    onChange={(e) => setWildcardsPerViewer(e.target.checked)}
                  />
                  One per viewer
                </label>
              </div>
              {onWheel.length === 0 && <p>Nobody is on the wheel.</p>}
              <Stepper
                label="Wildcard count"
                value={wheel.wildcardsPerViewer ? onWheel.length : wheel.wildcardCount}
                min={0}
                max={12}
                disabled={locked || wheel.wildcardsPerViewer}
                onChange={setWildcardCount}
              />
              <Slider
                label="Wildcard weight"
                value={wheel.wildcardWeight}
                step={0.5}
                min={0.5}
                max={20}
                onChange={setWildcardWeight}
              />
            </section>
            <section className="inset-card" aria-labelledby="spin-heading">
              <div className="card-head">
                <h3 id="spin-heading">Spin</h3>
              </div>
              <Slider
                label="Length"
                value={wheel.spinSeconds}
                step={0.5}
                min={minSpinSeconds}
                max={maxSpinSeconds}
                format={(n) => `${n} s`}
                onChange={setSpinSeconds}
              />
              <Slider
                label="Intensity"
                value={wheel.spinTurnsPerSecond}
                step={0.1}
                min={minSpinTurnsPerSecond}
                max={maxSpinTurnsPerSecond}
                format={(n) => `${n} turns/s`}
                onChange={setSpinTurnsPerSecond}
              />
            </section>
            <section className="inset-card" aria-labelledby="defaults-heading">
              <div className="card-head">
                <h3 id="defaults-heading">Viewer Defaults</h3>
              </div>
              <Stepper
                label="Slices per viewer"
                value={wheel.defaultSlices}
                min={1}
                max={12}
                disabled={locked}
                onChange={setDefaultSlices}
              />
              <Slider
                label="Weight per viewer"
                value={wheel.defaultWeight}
                step={0.5}
                min={0.5}
                max={20}
                onChange={setDefaultWeight}
              />
            </section>
            <button
              type="button"
              className="quiet restore-all"
              disabled={atFactory}
              onClick={showConfirm}
            >
              Restore All Defaults
            </button>
          </fieldset>
        </div>
      </dialog>
      {confirming && <RestoreDialog onConfirm={restoreWheelSettings} onClosed={closeConfirm} />}
    </>
  )
}
