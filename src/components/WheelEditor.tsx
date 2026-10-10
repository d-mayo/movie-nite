import { useEffect, useRef, type RefObject } from 'react'
import { viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import {
  maxSpinSeconds,
  maxSpinTurnsPerSecond,
  minSpinSeconds,
  minSpinTurnsPerSecond,
} from '../wheel/edit.ts'
import Slider from './Slider.tsx'
import Stepper from './Stepper.tsx'

interface Props {
  locked?: boolean
  onClosed: () => void
  // The button the popover hangs from.
  anchor?: RefObject<HTMLElement | null>
}

// The Wheel settings popover. Mounted only while shown, like the End night
// dialog: a click outside unmounts it directly, and Escape does so through the
// native `close` event.
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
  } = useApp()
  const { wheel } = settings
  const dialog = useRef<HTMLDialogElement>(null)
  // True when the press that began a click landed on the backdrop, not in the drawer.
  const pressedBackdrop = useRef(false)
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
    return () => {
      window.removeEventListener('resize', place)
      el.removeEventListener('close', onClosed)
    }
  }, [anchor, onClosed])
  // Close natively, then unmount at once rather than wait for the `close` event.
  function dismiss() {
    dialog.current?.close()
    onClosed()
  }
  const onWheel = viewersOnWheel(night)
  return (
    <dialog
      ref={dialog}
      className="card wheel-drawer"
      aria-label="Wheel settings"
      tabIndex={-1}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) dismiss()
      }}
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
              <h3 id="defaults-heading">Defaults</h3>
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
        </fieldset>
      </div>
    </dialog>
  )
}
